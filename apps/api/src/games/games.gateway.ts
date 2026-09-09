import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  GAME_RT_EVENTS,
  GAME_RT_NAMESPACE,
  type GameOverEvent,
} from '@beside/shared';
import { TokenService } from '../auth/token.service';
import { GamesService } from './games.service';

interface WatcherState {
  userId: string;
  /** Ván đang mở trên màn hình, `null` khi mới kết nối. */
  gameId: string | null;
}

/**
 * Kênh thời gian thực của trò chơi.
 *
 * Namespace RIÊNG, không dùng chung `/rt` với luồng vị trí: `LocationsGateway`
 * là nơi nhạy cảm nhất về quyền riêng tư và đang chạy ổn định, trộn thêm luồng
 * game vào đó là đặt hai việc không liên quan vào chung một chỗ dễ vỡ. Đổi lại
 * máy người dùng mở socket thứ hai — nhưng chỉ khi đang ở màn game.
 *
 * Gateway này **không nhận nước đi** (nước đi đi bằng REST). Nó chỉ:
 *   - đẩy state mới về cho cả hai người, mỗi người một bản đã lọc riêng;
 *   - tạm dừng / chạy tiếp đồng hồ theo việc người tới lượt có mở app không.
 */
@WebSocketGateway({
  namespace: GAME_RT_NAMESPACE,
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class GamesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GamesGateway.name);

  @WebSocketServer()
  server!: Server;

  /** socket.id → ai đang xem ván nào. Một người có thể mở nhiều tab. */
  private readonly watchers = new Map<string, WatcherState>();

  constructor(
    private readonly tokens: TokenService,
    private readonly games: GamesService,
  ) {}

  /**
   * Xác thực ngay ở bước BẮT TAY, không phải trong `handleConnection` — cùng
   * bài học đã ghi ở `LocationsGateway` (trace Phase 2, L9): để ở
   * `handleConnection` thì một socket chưa xác thực vẫn kịp tồn tại và client
   * tưởng mình đã vào được.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = extractToken(socket);
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

  handleConnection(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    this.watchers.set(client.id, { userId, gameId: null });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const state = this.watchers.get(client.id);
    this.watchers.delete(client.id);
    if (!state?.gameId) return;

    /*
     * Rớt kết nối cũng là "không mở app" → dừng đồng hồ.
     *
     * Nhưng chỉ dừng khi người này KHÔNG còn kết nối nào khác: đóng một tab
     * trong khi tab kia vẫn mở thì họ vẫn đang ngồi trước màn hình.
     */
    if (this.hasOtherConnection(state.userId, client.id)) return;
    await this.pauseAndBroadcast(state.userId, state.gameId);
  }

  // ------------------------------------------------------------------

  @SubscribeMessage(GAME_RT_EVENTS.WATCH)
  async handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const state = this.watchers.get(client.id);
    const gameId = readGameId(body);
    if (!state || !gameId) return;

    state.gameId = gameId;
    await client.join(room(gameId));

    // Mở màn hình lên là đang xem → nếu đang tới lượt họ thì đồng hồ chạy tiếp.
    const resumed = await this.games.resumeClock(state.userId, gameId);
    if (resumed) {
      await this.broadcastGame(gameId);
    } else {
      await this.sendStateTo(client, state.userId, gameId);
    }
  }

  /** Tab bị ẩn hoặc màn hình bị khoá — client báo chủ động, xem §5.2 thiết kế. */
  @SubscribeMessage(GAME_RT_EVENTS.AWAY)
  async handleAway(@ConnectedSocket() client: Socket): Promise<void> {
    const state = this.watchers.get(client.id);
    if (!state?.gameId) return;
    if (this.hasOtherConnection(state.userId, client.id)) return;
    await this.pauseAndBroadcast(state.userId, state.gameId);
  }

  @SubscribeMessage(GAME_RT_EVENTS.BACK)
  async handleBack(@ConnectedSocket() client: Socket): Promise<void> {
    const state = this.watchers.get(client.id);
    if (!state?.gameId) return;
    const resumed = await this.games.resumeClock(state.userId, state.gameId);
    if (resumed) await this.broadcastGame(state.gameId);
  }

  // ------------------------------------------------------------------

  /**
   * Đẩy state mới cho MỌI socket đang xem ván này.
   *
   * Cố tình không dùng `server.to(room).emit` như `loc:partner`: mỗi người phải
   * nhận một bản state ĐÃ LỌC theo chính họ (bài trên tay không được lộ), nên
   * phải gửi riêng từng socket.
   */
  async broadcastGame(gameId: string): Promise<void> {
    const sockets = await this.server.in(room(gameId)).fetchSockets();
    if (sockets.length === 0) return;

    // Một lần nạp cho cả phòng. Bản gửi đi thì mỗi người một khác, nhưng dữ liệu
    // gốc thì chung — hỏi DB lại cho từng socket chỉ là cộng thêm độ trễ.
    const game = await this.games.loadForBroadcast(gameId);

    for (const socket of sockets) {
      const state = this.watchers.get(socket.id);
      if (!state) continue;

      // `game.state` chứa bài úp của CẢ HAI người, nên không có ngoại lệ nào:
      // không phải người trong ván thì không nhận được gì.
      if (!game || !this.games.isMember(game, state.userId)) {
        socket.emit(GAME_RT_EVENTS.ERROR, {
          code: 'NOT_FOUND',
          message: 'Không mở được ván này nữa',
        });
        continue;
      }
      socket.emit(GAME_RT_EVENTS.STATE, this.games.toResponse(game, state.userId));
    }
  }

  /**
   * Bản KHÔNG CHỜ của `syncAndBroadcast`, dùng cho đường REST.
   *
   * Người vừa đi nước đã có state mới nằm sẵn trong câu trả lời HTTP rồi; bắt
   * họ chờ thêm một vòng đọc DB + phát socket nữa chỉ để phục vụ người kia là
   * cộng thẳng vào độ trễ của chính họ. Có gì lệch (đồng hồ vừa bị tạm dừng
   * chẳng hạn) thì gói `g:state` theo sau sẽ chỉnh lại ngay sau đó.
   */
  pushState(gameId: string, turnUserId: string | null): void {
    void this.syncAndBroadcast(gameId, turnUserId).catch((e: unknown) => {
      this.logger.warn(
        `Không phát được state ván ${gameId}: ${e instanceof Error ? e.message : 'lỗi lạ'}`,
      );
    });
  }

  /**
   * Sau mỗi nước đi: chỉnh đồng hồ cho khớp thực tế RỒI mới phát state.
   *
   * Đây là lỗ hổng dễ bỏ sót nhất của cơ chế tạm dừng. Đổi lượt thì server đặt
   * một mốc hết giờ mới cho người kia — nhưng nếu lúc đó họ **đang không mở
   * app**, đồng hồ vẫn chạy và 30 giây sau họ thua một ván mà chưa từng nhìn
   * thấy. `pauseClock` chỉ được gọi khi có sự kiện `g:away` hay socket rớt, mà
   * cả hai đều đã xảy ra TỪ TRƯỚC nước đi này.
   *
   * Nên mỗi lần lượt đổi tay, phải hỏi lại: người tới lượt có socket nào đang
   * xem ván này không? Không thì dừng đồng hồ ngay.
   */
  async syncAndBroadcast(gameId: string, turnUserId: string | null): Promise<void> {
    if (turnUserId && !this.isWatching(turnUserId, gameId)) {
      await this.games.pauseClock(turnUserId, gameId);
    }
    await this.broadcastGame(gameId);
  }

  /** Báo ván kết thúc — dùng cho kết cục do đồng hồ, không phải do ai bấm. */
  async broadcastOver(gameId: string, event: GameOverEvent): Promise<void> {
    await this.broadcastGame(gameId);
    this.server.to(room(gameId)).emit(GAME_RT_EVENTS.OVER, event);
  }

  private async sendStateTo(socket: Emitter, userId: string, gameId: string): Promise<void> {
    try {
      const game = await this.games.get(userId, gameId);
      socket.emit(GAME_RT_EVENTS.STATE, game);
    } catch {
      // Ván bị xoá, hoặc người này không còn thuộc couple sở hữu ván. Không nói
      // rõ lý do — client chỉ cần biết là không xem được nữa.
      socket.emit(GAME_RT_EVENTS.ERROR, {
        code: 'NOT_FOUND',
        message: 'Không mở được ván này nữa',
      });
    }
  }

  private async pauseAndBroadcast(userId: string, gameId: string): Promise<void> {
    const paused = await this.games.pauseClock(userId, gameId);
    if (paused) await this.broadcastGame(gameId);
  }

  /** Người này có socket nào đang mở đúng ván đó không. */
  private isWatching(userId: string, gameId: string): boolean {
    for (const s of this.watchers.values()) {
      if (s.userId === userId && s.gameId === gameId) return true;
    }
    return false;
  }

  private hasOtherConnection(userId: string, exceptSocketId: string): boolean {
    for (const [id, s] of this.watchers) {
      if (id !== exceptSocketId && s.userId === userId) return true;
    }
    return false;
  }
}

/**
 * Chỉ cần đúng bấy nhiêu để gửi state đi.
 *
 * `fetchSockets()` trả về `RemoteSocket`, còn `handleWatch` cầm `Socket` thật —
 * hai kiểu khác nhau nhưng cùng có `emit`. Nhận kiểu tối thiểu này thì một hàm
 * phục vụ được cả hai chỗ, khỏi phải tra ngược từ id về socket.
 */
interface Emitter {
  emit(event: string, payload: unknown): unknown;
}

const room = (gameId: string): string => `game:${gameId}`;

function readGameId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as { gameId?: unknown }).gameId;
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? raw : null;
}

function extractToken(client: Socket): string | null {
  const fromAuth = client.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}
