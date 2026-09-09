import { z } from 'zod';
import type { CaroBoard, CaroMark } from './caro';

/**
 * Ván chơi giữa hai người (F10 Tiến lên · F11 Cờ caro).
 *
 * Xem `docs/thiet-ke-games.md`. Hai luật cứng của module này:
 *
 *   1. **Bài trên tay không bao giờ rời server nguyên vẹn.** Mọi state đi ra
 *      client đều đã qua bộ lọc theo người xem — xem `TienLenClientState`.
 *   2. **Nước đi đi bằng REST**, WebSocket chỉ đẩy state mới về. Nước đi cần mã
 *      lỗi rõ ràng ("bộ này không chặn được") và cơ chế thử lại; ván 30 giây một
 *      lượt không cần tiết kiệm một nhịp mạng.
 */

export const GAME_KINDS = ['TIEN_LEN', 'CARO'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAME_KIND_LABELS: Record<GameKind, string> = {
  TIEN_LEN: 'Tiến lên miền Nam',
  CARO: 'Cờ caro',
};

export const GAME_STATUSES = ['PLAYING', 'FINISHED', 'ABANDONED'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_END_REASONS = [
  'HET_BAI', // Tiến lên: đánh hết bài
  'DU_QUAN', // Caro: đủ chuỗi thắng
  'HET_GIO', // hết đồng hồ
  'DAU_HANG',
  'HOA', // Caro: bàn đầy
  'BO_DO', // quá hạn không ai đi
] as const;
export type GameEndReason = (typeof GAME_END_REASONS)[number];

export const GAME_END_LABELS: Record<GameEndReason, string> = {
  HET_BAI: 'Hết bài',
  DU_QUAN: 'Đủ quân thắng',
  HET_GIO: 'Hết giờ',
  DAU_HANG: 'Đầu hàng',
  HOA: 'Hoà — bàn đã đầy',
  BO_DO: 'Ván bị bỏ dở',
};

// ---------------------------------------------------------------------------
// Đồng hồ
// ---------------------------------------------------------------------------

/** Mỗi lượt 30 giây (chủ dự án chốt 09/09). */
export const TURN_MS = 30_000;

/**
 * Không ai đi nước nào suốt 30 phút thì ván tự huỷ.
 *
 * Đây cũng là **trần chờ** của cơ chế tạm dừng: đồng hồ dừng khi người tới lượt
 * ẩn app, nên nếu không có mốc này thì một ván bỏ dở treo vĩnh viễn.
 */
export const ABANDON_AFTER_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Trạng thái ván — bản ĐÃ LỌC gửi cho client
// ---------------------------------------------------------------------------

export interface CaroClientState {
  kind: 'CARO';
  board: CaroBoard;
  /** Quân của từng người. */
  marks: Record<string, CaroMark>;
  lastMove: { r: number; c: number } | null;
  /** Chuỗi thắng, chỉ có khi ván đã kết thúc bằng `DU_QUAN`. */
  winLine: { r: number; c: number }[] | null;
}

export interface TienLenClientState {
  kind: 'TIEN_LEN';
  /** Bài của CHÍNH người đang xem. Bài đối phương không bao giờ đi ra khỏi server. */
  myHand: number[];
  /** Đối phương còn mấy lá — chỉ con số. */
  opponentCount: number;
  /** Bộ đang nằm trên bàn, phải chặn được nó. `null` = được ra bài tự do. */
  table: { userId: string; cards: number[] } | null;
  /** Đối phương vừa bỏ lượt hay không (để giao diện nói rõ vì sao tới lượt mình). */
  opponentPassed: boolean;
  /**
   * Lá bắt buộc phải có trong bộ đầu tiên của ván, hoặc `null` khi ván đã chạy.
   *
   * Là **lá nhỏ nhất trong số bài đã chia**, không phải cứ 3♠: mỗi người 13 lá
   * nên 26 lá bị bỏ ra, và 3♠ có thể không được chia cho ai cả.
   */
  mustInclude: number | null;
}

export type GameClientState = CaroClientState | TienLenClientState;

export interface GameResponse {
  id: string;
  kind: GameKind;
  status: GameStatus;
  /** Hai người trong ván, theo thứ tự ổn định để giao diện không nhảy chỗ. */
  players: { userId: string; displayName: string }[];
  turnUserId: string | null;
  /**
   * Mốc hết giờ (epoch ms). `null` = đồng hồ đang TẠM DỪNG vì người tới lượt
   * không mở app — giao diện phải nói rõ chứ không để đồng hồ đứng im khó hiểu.
   */
  turnDeadlineAt: number | null;
  turnRemainingMs: number;
  winnerId: string | null;
  endReason: GameEndReason | null;
  state: GameClientState;
  /** Khoá lạc quan — gửi kèm mỗi nước đi để phát hiện hai người bấm cùng lúc. */
  version: number;
  /** Nước đi gần nhất do ĐỒNG HỒ tự sinh, không phải người bấm. */
  lastMoveAuto: boolean;
  createdAt: string;
  /** Ván tự huỷ sau mốc này nếu không ai đi (epoch ms). */
  abandonAt: number;
}

export interface GameSummaryResponse {
  /** Mỗi loại game một dòng, kể cả khi chưa chơi ván nào. */
  items: {
    kind: GameKind;
    /** Ván đang chạy, `null` nếu chưa có. */
    activeGameId: string | null;
    played: number;
    /** userId → số ván thắng. Ván hoà không tính cho ai. */
    wins: Record<string, number>;
    draws: number;
  }[];
}

// ---------------------------------------------------------------------------
// Đầu vào
// ---------------------------------------------------------------------------

export const createGameSchema = z.object({
  kind: z.enum(GAME_KINDS),
});
export type CreateGameInput = z.infer<typeof createGameSchema>;

export const caroMoveSchema = z.object({
  r: z.number().int().min(0).max(14),
  c: z.number().int().min(0).max(14),
});

export const tienLenMoveSchema = z.union([
  z.object({ cards: z.array(z.number().int().min(0).max(51)).min(1).max(13) }),
  z.object({ pass: z.literal(true) }),
]);

/**
 * Nước đi. Khuôn khác nhau theo loại game nên phải kiểm hai bước: schema chung
 * lấy `version`, rồi service chọn schema riêng theo `game.kind`.
 *
 * `version` là **bắt buộc**: thiếu nó thì hai người bấm cùng lúc sẽ cùng ghi đè
 * lên nhau mà không ai biết (xem `docs/thiet-ke-games.md` §7).
 */
export const gameMoveEnvelopeSchema = z.object({
  version: z.number().int().min(0),
  move: z.unknown(),
});
export type GameMoveEnvelope = z.infer<typeof gameMoveEnvelopeSchema>;

// ---------------------------------------------------------------------------
// WebSocket — namespace riêng, không dùng chung với luồng vị trí
// ---------------------------------------------------------------------------

/**
 * Cố tình tách khỏi `/rt`: `LocationsGateway` là nơi nhạy cảm nhất về quyền
 * riêng tư và đang chạy ổn định, trộn thêm luồng game vào đó là đặt hai việc
 * không liên quan vào chung một chỗ dễ vỡ. Đổi lại máy người dùng mở socket thứ
 * hai — nhưng chỉ khi đang ở màn game.
 */
export const GAME_RT_NAMESPACE = '/rtg';

export const GAME_RT_EVENTS = {
  // client → server
  WATCH: 'g:watch',
  /** Tab bị ẩn / khoá màn hình → tạm dừng đồng hồ nếu đang là lượt của mình. */
  AWAY: 'g:away',
  BACK: 'g:back',
  // server → client
  STATE: 'g:state',
  OVER: 'g:over',
  ERROR: 'g:error',
} as const;

export interface GameOverEvent {
  gameId: string;
  winnerId: string | null;
  endReason: GameEndReason;
}
