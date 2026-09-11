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
  CHEER_COOLDOWN_MS,
  STUDY_RT_EVENTS,
  STUDY_RT_NAMESPACE,
  isStudyCheerCode,
  type StudyCheerEvent,
} from '@beside/shared';
import { TokenService } from '../auth/token.service';
import { StudyService } from './study.service';

/**
 * Kênh thời gian thực của phòng học.
 *
 * Namespace riêng `/rts`, cùng lý do đã dùng cho `/rtg` của trò chơi: không
 * trộn thêm luồng nào vào gateway vị trí. Chỉ mở khi người dùng đang ở màn học.
 *
 * Gateway này **không giữ đồng hồ** — đồng hồ nằm ở cột `endsAt` trong DB và
 * cron mới là thứ đẩy nó đi. Ở đây chỉ đẩy trạng thái mới về cho hai máy.
 */
@WebSocketGateway({
  namespace: STUDY_RT_NAMESPACE,
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class StudyGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  /** socket.id → userId. */
  private readonly watchers = new Map<string, string>();

  /**
   * userId → thời điểm cổ vũ gần nhất, để chặn bấm liên tục.
   *
   * Giữ trong bộ nhớ tiến trình chứ không vào Redis: mất khi khởi động lại là
   * chấp nhận được (tệ nhất là ai đó gửi thêm được một lời cổ vũ), và một vòng
   * mạng cho việc này thì đắt hơn giá trị nó mang lại.
   *
   * Khoá theo userId chứ không theo socket.id — mở hai tab là có hai socket,
   * và bộ đếm theo socket sẽ không chặn được gì cả.
   */
  private readonly lastCheerAt = new Map<string, number>();

  constructor(
    private readonly tokens: TokenService,
    private readonly study: StudyService,
  ) {}

  /** Xác thực ngay ở bước bắt tay — cùng bài học với hai gateway kia. */
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
    this.watchers.set(client.id, userId);
  }

  handleDisconnect(client: Socket): void {
    const userId = this.watchers.get(client.id);
    this.watchers.delete(client.id);

    // Người đó không còn socket nào thì bỏ luôn bộ đếm — nếu không `Map` này
    // sẽ phình dần theo số người từng vào phòng học.
    if (userId && ![...this.watchers.values()].includes(userId)) {
      this.lastCheerAt.delete(userId);
    }
  }

  /**
   * Vào nghe phòng học của couple mình.
   *
   * Nghe theo COUPLE chứ không theo phiên: người kia bấm "bắt đầu" lúc mình
   * đang mở app thì mình phải thấy ngay. Nghe theo phiên thì lúc chưa có phiên
   * nào client chẳng có gì để nghe — mà đúng khoảnh khắc cần biết nhất lại là
   * khoảnh khắc không nghe được.
   */
  @SubscribeMessage(STUDY_RT_EVENTS.WATCH)
  async handleWatch(@ConnectedSocket() client: Socket): Promise<void> {
    const userId = this.watchers.get(client.id);
    if (!userId) return;

    try {
      const coupleId = await this.study.coupleIdOf(userId);
      await client.join(room(coupleId));
      await this.sendTo(client, userId);
    } catch {
      client.emit(STUDY_RT_EVENTS.ERROR, {
        code: 'NOT_IN_COUPLE',
        message: 'Bạn chưa ghép đôi với ai cả',
      });
    }
  }

  /**
   * Gửi một lời cổ vũ sang máy người ấy.
   *
   * Chỉ nhận MÃ trong danh sách đóng, không nhận chữ tự do: cho gửi chữ thì
   * kênh này thành một khung chat, mà app đã chốt không có chat trong app
   * (§7.3) — và một ô chat hiện ra giữa lúc đang học thì phá đúng thứ phòng
   * học phục vụ.
   *
   * Không gửi thông báo đẩy. Cổ vũ chỉ có nghĩa khi người kia đang ngồi đó và
   * đang mở app; rung điện thoại của người đã cất máy đi học là làm phiền.
   */
  @SubscribeMessage(STUDY_RT_EVENTS.CHEER)
  async handleCheer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = this.watchers.get(client.id);
    if (!userId) return;

    const code = (body as { code?: unknown } | null)?.code;
    // Mã lạ thì im lặng bỏ qua: đây là client của chính mình gửi sai, báo lỗi
    // ra màn hình người dùng cũng chẳng giúp họ làm gì được.
    if (!isStudyCheerCode(code)) return;

    const now = Date.now();
    const last = this.lastCheerAt.get(userId) ?? 0;
    if (now - last < CHEER_COOLDOWN_MS) return;
    this.lastCheerAt.set(userId, now);

    let coupleId: string;
    let fromName: string;
    try {
      const ctx = await this.study.senderContext(userId);
      coupleId = ctx.coupleId;
      fromName = ctx.displayName;
    } catch {
      return;
    }

    const event: StudyCheerEvent = { code, fromUserId: userId, fromName, at: now };
    // Phát cho CẢ phòng, kể cả người gửi: client tự bỏ qua tiếng vọng của mình
    // bằng `fromUserId`. Loại trừ ở server thì người mở hai tab sẽ không thấy
    // gì ở tab còn lại.
    this.server.in(room(coupleId)).emit(STUDY_RT_EVENTS.CHEER, event);
  }

  /**
   * Đẩy trạng thái mới cho mọi máy của một cặp đôi.
   *
   * Khác `g:state` của trò chơi, ở đây KHÔNG có gì phải giấu — hai người nhìn
   * chung một đồng hồ. Vẫn gửi từng socket vì mỗi lần đọc đều phải đi qua kiểm
   * quyền theo `coupleId` của chính người đó.
   */
  async broadcastCouple(coupleId: string): Promise<void> {
    const sockets = await this.server.in(room(coupleId)).fetchSockets();
    for (const socket of sockets) {
      const userId = this.watchers.get(socket.id);
      if (!userId) continue;
      await this.sendTo(socket, userId);
    }
  }

  /** Tiện dụng cho controller: phát cho couple của chính người vừa thao tác. */
  async broadcastFor(userId: string): Promise<void> {
    try {
      await this.broadcastCouple(await this.study.coupleIdOf(userId));
    } catch {
      // Không còn couple thì cũng chẳng còn ai để báo.
    }
  }

  private async sendTo(socket: Emitter, userId: string): Promise<void> {
    try {
      socket.emit(STUDY_RT_EVENTS.STATE, await this.study.current(userId));
    } catch {
      socket.emit(STUDY_RT_EVENTS.ERROR, {
        code: 'NOT_FOUND',
        message: 'Không mở được phòng học',
      });
    }
  }
}

/** Đủ để gửi đi: `fetchSockets()` trả RemoteSocket, `handleWatch` cầm Socket thật. */
interface Emitter {
  emit(event: string, payload: unknown): unknown;
}

const room = (coupleId: string): string => `study:${coupleId}`;

function extractToken(client: Socket): string | null {
  const fromAuth = client.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}
