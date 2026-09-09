import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { STUDY_RT_EVENTS, STUDY_RT_NAMESPACE } from '@beside/shared';
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
    this.watchers.delete(client.id);
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
