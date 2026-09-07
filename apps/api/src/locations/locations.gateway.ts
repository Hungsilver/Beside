import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { LocSource } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import {
  locationPointSchema,
  RT_EVENTS,
  RT_NAMESPACE,
  type PresenceEvent,
} from '@beside/shared';
import { TokenService } from '../auth/token.service';
import { LocationsService, type CoupleContext } from './locations.service';

interface SocketState {
  userId: string;
  coupleId: string;
  partnerId: string | null;
  /** Đang bật "Chia sẻ trực tiếp" hay chỉ mở app. */
  live: boolean;
  battery: number | null;
  lastSeenAt: number | null;
}

const room = (coupleId: string): string => `couple:${coupleId}`;

@WebSocketGateway({
  namespace: RT_NAMESPACE,
  // Origin do CORS của app quyết định; Socket.IO kiểm tra riêng nên phải khai lại.
  cors: { origin: true, credentials: true },
  // Ưu tiên WebSocket nhưng vẫn cho phép long-polling: Safari trên iOS đôi khi
  // rớt WebSocket khi chuyển mạng 4G ↔ Wi-Fi (ARCHITECTURE.md §4).
  transports: ['websocket', 'polling'],
})
export class LocationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LocationsGateway.name);

  @WebSocketServer()
  server!: Server;

  /** socket.id → trạng thái. Một người có thể mở nhiều tab/thiết bị. */
  private readonly states = new Map<string, SocketState>();

  constructor(
    private readonly tokens: TokenService,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------

  /**
   * Xác thực NGAY TRONG BƯỚC BẮT TAY, không phải sau khi đã kết nối.
   *
   * Trước đây việc kiểm tra token nằm ở handleConnection: client vẫn nhận được
   * sự kiện 'connect' rồi mới bị ngắt. Nghĩa là một socket chưa xác thực đã kịp
   * tồn tại trong server, và phía client tưởng mình đã vào được (trace Phase 2,
   * TC-51). Middleware `server.use` chặn từ đầu — client nhận 'connect_error'
   * và không bao giờ ở trạng thái đã kết nối.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = this.extractToken(socket);
      if (!token) {
        next(new Error('UNAUTHENTICATED'));
        return;
      }
      this.tokens
        .verifyAccessToken(token)
        .then((payload) => {
          socket.data.userId = payload.sub;
          next();
        })
        .catch(() => next(new Error('UNAUTHENTICATED')));
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = client.data.userId as string | undefined;
      if (!userId) throw new Error('chưa qua bước xác thực');

      // Đọc lại couple từ DB chứ KHÔNG tin `cid` trong token: người dùng có thể
      // đã huỷ ghép đôi sau khi token được cấp.
      const ctx = await this.locations.getContext(userId);

      const state: SocketState = {
        userId: ctx.userId,
        coupleId: ctx.coupleId,
        partnerId: ctx.partnerId,
        live: false,
        battery: null,
        lastSeenAt: null,
      };
      this.states.set(client.id, state);
      await client.join(room(ctx.coupleId));

      // Báo cho đối phương biết mình vừa lên
      this.broadcastPresence(state);
      // Và cho người vừa kết nối biết đối phương đang thế nào
      this.sendPartnerPresenceTo(client, state);

      this.logger.log(`Kết nối: user ${ctx.userId} vào ${room(ctx.coupleId)}`);
    } catch (err) {
      // Không nói rõ lý do — client chỉ cần biết là phải đăng nhập lại.
      client.emit(RT_EVENTS.ERROR, {
        code: 'UNAUTHENTICATED',
        message: 'Phiên kết nối không hợp lệ, vui lòng đăng nhập lại',
      });
      client.disconnect(true);
      this.logger.warn(`Từ chối kết nối: ${(err as Error).message}`);
    }
  }

  handleDisconnect(client: Socket): void {
    const state = this.states.get(client.id);
    if (!state) return;
    this.states.delete(client.id);

    // Chỉ báo "offline" khi KHÔNG còn kết nối nào khác của người này —
    // nếu không, đóng một tab sẽ làm đối phương thấy mình offline oan.
    if (!this.hasOtherConnection(state.userId)) {
      this.server.to(room(state.coupleId)).emit(RT_EVENTS.PRESENCE, {
        userId: state.userId,
        online: false,
        live: false,
        battery: state.battery,
        lastSeenAt: state.lastSeenAt,
      } satisfies PresenceEvent);
    }
  }

  // ------------------------------------------------------------------

  @SubscribeMessage(RT_EVENTS.LIVE_START)
  handleLiveStart(@ConnectedSocket() client: Socket): void {
    const state = this.states.get(client.id);
    if (!state) return;
    state.live = true;
    this.broadcastPresence(state);
  }

  @SubscribeMessage(RT_EVENTS.LIVE_STOP)
  handleLiveStop(@ConnectedSocket() client: Socket): void {
    const state = this.states.get(client.id);
    if (!state) return;
    state.live = false;
    this.broadcastPresence(state);
  }

  @SubscribeMessage(RT_EVENTS.LOC_UPDATE)
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    const state = this.states.get(client.id);
    if (!state) {
      client.disconnect(true);
      return;
    }

    const parsed = locationPointSchema.safeParse(raw);
    if (!parsed.success) {
      client.emit(RT_EVENTS.ERROR, {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu vị trí không hợp lệ',
      });
      return;
    }

    let ctx: CoupleContext;
    try {
      // Đọc lại quyền riêng tư MỖI LẦN: bật chế độ ẩn danh phải có hiệu lực ngay,
      // không được chờ tới lần kết nối sau.
      ctx = await this.locations.getContext(state.userId);
    } catch {
      client.disconnect(true);
      return;
    }

    const result = await this.locations.ingest(ctx, parsed.data, LocSource.LIVE);

    if (!result.accepted) {
      if (result.reason === 'GHOST_MODE' || result.reason === 'LIVE_DISABLED') {
        // Người dùng tự tắt — báo lại để giao diện hiện đúng trạng thái,
        // chứ không im lặng nuốt mất.
        state.live = false;
        this.broadcastPresence(state);
      }
      return;
    }

    state.battery = parsed.data.battery ?? state.battery;
    state.lastSeenAt = result.event.ts;
    state.partnerId = ctx.partnerId;

    // Phát cho MỌI kết nối khác trong phòng, trừ chính socket vừa gửi.
    client.broadcast.to(room(ctx.coupleId)).emit(RT_EVENTS.LOC_PARTNER, result.event);
  }

  // ------------------------------------------------------------------

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim() || null;
    }
    return null;
  }

  private hasOtherConnection(userId: string): boolean {
    for (const s of this.states.values()) {
      if (s.userId === userId) return true;
    }
    return false;
  }

  private broadcastPresence(state: SocketState): void {
    this.server.to(room(state.coupleId)).emit(RT_EVENTS.PRESENCE, {
      userId: state.userId,
      online: true,
      live: state.live,
      battery: state.battery,
      lastSeenAt: state.lastSeenAt,
    } satisfies PresenceEvent);
  }

  /** Gửi cho socket vừa kết nối biết đối phương đang online/live hay không. */
  private sendPartnerPresenceTo(client: Socket, state: SocketState): void {
    if (!state.partnerId) return;

    let partner: SocketState | null = null;
    for (const s of this.states.values()) {
      if (s.userId === state.partnerId) {
        // Ưu tiên kết nối đang bật chia sẻ trực tiếp
        if (!partner || s.live) partner = s;
      }
    }

    client.emit(RT_EVENTS.PRESENCE, {
      userId: state.partnerId,
      online: partner !== null,
      live: partner?.live ?? false,
      battery: partner?.battery ?? null,
      lastSeenAt: partner?.lastSeenAt ?? null,
    } satisfies PresenceEvent);
  }
}
