import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { GameKind, GameStatus, Prisma, type Game } from '@prisma/client';
import {
  ABANDON_AFTER_MS,
  CARO_SIZE,
  caroMoveSchema,
  checkMove,
  autoActionTienLen,
  detectInstantWin,
  emptyBoard,
  ERROR_CODES,
  findWin,
  holdsThreeSpade,
  isBoardFull,
  placeMark,
  stepTienLen,
  tienLenMoveSchema,
  TURN_MS,
  viewTienLen,
  type CaroBoard,
  type CaroClientState,
  type CaroMark,
  type GameClientState,
  type GameEndReason,
  type GameResponse,
  type GameSummaryResponse,
  type InstantWinKind,
  type TienLenAction,
  type TienLenPlay,
  type TienLenTableState,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService, type CoupleContext } from '../locations/locations.service';
import { PushService } from '../push/push.service';
import { dealTienLen } from './deal';

/**
 * Trạng thái ván caro như nó nằm trong DB.
 *
 * Với caro không có gì phải giấu (bàn cờ hai bên đều thấy), nên bản lưu và bản
 * gửi đi gần như trùng nhau — khác Tiến lên, nơi `state` chứa bài úp.
 */
interface CaroStoredState {
  kind: 'CARO';
  board: CaroBoard;
  marks: Record<string, CaroMark>;
  lastMove: { r: number; c: number } | null;
  winLine: { r: number; c: number }[] | null;
}

/**
 * Trạng thái ván Tiến lên như nó nằm trong DB.
 *
 * Phần diễn biến dùng nguyên `TienLenTableState` của `packages/shared` — luật
 * và luồng ván là hàm thuần ở đó, service này chỉ lo phần DB, đồng hồ và thông
 * báo. `hands` chứa bài CẢ HAI người nên cột `state` không bao giờ được trả
 * thẳng ra client; mọi đường ra đi qua `viewTienLen()`.
 */
type TienLenStoredState = TienLenTableState & { kind: 'TIEN_LEN' };

export type GameWithPlayers = Game & {
  couple: { members: { id: string; displayName: string }[] };
};

const COUPLE_INCLUDE = {
  couple: { select: { members: { select: { id: true, displayName: true } } } },
} as const;

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------------
  // Đọc
  // ------------------------------------------------------------------

  async list(userId: string, kind?: GameKind): Promise<GameResponse[]> {
    const ctx = await this.locations.getContext(userId);
    const rows = await this.prisma.game.findMany({
      where: { coupleId: ctx.coupleId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: COUPLE_INCLUDE,
    });
    return rows.map((g) => this.toResponse(g, userId));
  }

  async get(userId: string, gameId: string): Promise<GameResponse> {
    const { game } = await this.load(userId, gameId);
    return this.toResponse(game, userId);
  }

  /**
   * Bảng điểm. Đếm thẳng từ `winnerId` chứ không giữ bảng tổng hợp riêng —
   * một cặp đôi thì số ván nhỏ tới mức đếm lại mỗi lần vẫn rẻ hơn là phải giữ
   * hai nguồn sự thật đồng bộ với nhau.
   */
  async summary(userId: string): Promise<GameSummaryResponse> {
    const ctx = await this.locations.getContext(userId);

    const rows = await this.prisma.game.findMany({
      where: { coupleId: ctx.coupleId },
      select: { id: true, kind: true, status: true, winnerId: true, endReason: true },
    });

    const items = ([GameKind.TIEN_LEN, GameKind.CARO] as const).map((kind) => {
      const ofKind = rows.filter((g) => g.kind === kind);
      const finished = ofKind.filter((g) => g.status === GameStatus.FINISHED);
      const wins: Record<string, number> = {};
      for (const g of finished) {
        if (g.winnerId) wins[g.winnerId] = (wins[g.winnerId] ?? 0) + 1;
      }
      return {
        kind,
        activeGameId: ofKind.find((g) => g.status === GameStatus.PLAYING)?.id ?? null,
        played: finished.length,
        wins,
        draws: finished.filter((g) => g.winnerId === null).length,
      };
    });

    return { items };
  }

  // ------------------------------------------------------------------
  // Tạo ván
  // ------------------------------------------------------------------

  async create(userId: string, kind: GameKind): Promise<GameResponse> {
    const ctx = await this.locations.getContext(userId);
    if (!ctx.partnerId) {
      throw AppError.badRequest(
        ERROR_CODES.NOT_IN_COUPLE,
        'Cần có đủ hai người mới chơi được',
      );
    }

    /*
     * Mỗi loại game chỉ được có MỘT ván đang chạy.
     *
     * Trả 409 kèm id ván đang chạy để client mở thẳng vào đó, thay vì im lặng
     * tạo ván thứ hai rồi mọi màn hình phải tự đoán "ván nào là ván đang chơi".
     */
    const running = await this.prisma.game.findFirst({
      where: { coupleId: ctx.coupleId, kind, status: GameStatus.PLAYING },
      select: { id: true },
    });
    if (running) {
      // Kèm id ván đang chạy trong `fieldErrors` để client mở thẳng vào đó.
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Hai bạn đang có một ván dở, chơi nốt ván đó đã nhé',
        HttpStatus.CONFLICT,
        { gameId: [running.id] },
      );
    }

    const opened =
      kind === GameKind.CARO
        ? { state: this.newCaroState(userId, ctx.partnerId), firstUserId: userId }
        : await this.newTienLenState(ctx.coupleId, userId, ctx.partnerId);
    const now = new Date();

    /*
     * Tới trắng: ván kết thúc NGAY lúc chia bài, không ai đánh lá nào.
     *
     * Xử ngay ở đây chứ không để người cầm bài phải bấm một nút "báo tới trắng":
     * server đã nhìn thấy cả hai tay bài, còn nút bấm thì tạo ra một trạng thái
     * "đang chờ khai báo" mà đồng hồ 30 giây không biết phải làm gì với nó.
     */
    const blitz = opened.state.kind === 'TIEN_LEN' ? opened.state.instantWin : null;

    const game = await this.prisma.game.create({
      data: {
        coupleId: ctx.coupleId,
        kind,
        state: opened.state as unknown as Prisma.InputJsonValue,
        ...(blitz
          ? {
              status: GameStatus.FINISHED,
              turnUserId: null,
              turnDeadlineAt: null,
              winnerId: blitz.userId,
              endReason: 'TOI_TRANG' satisfies GameEndReason,
              finishedAt: now,
              lastMoveAt: now,
            }
          : {
              turnUserId: opened.firstUserId,
              // Đồng hồ chỉ chạy khi người tới lượt thật sự đang mở app; lúc vừa
              // tạo thì họ đang mở, nên bắt đầu đếm ngay.
              turnDeadlineAt: new Date(now.getTime() + TURN_MS),
              turnRemainingMs: TURN_MS,
              lastMoveAt: now,
            }),
      },
      include: COUPLE_INCLUDE,
    });

    void this.push.sendToPartner(userId, {
      kind: 'GAME_TURN',
      title: kind === GameKind.CARO ? 'Có ván cờ caro mới' : 'Có ván tiến lên mới',
      body: `${ctx.displayName} rủ bạn chơi một ván`,
      url: `/tro-choi/${game.id}`,
      tag: `game:${game.id}`,
      at: Date.now(),
    });

    return this.toResponse(game, userId);
  }

  private newCaroState(firstUserId: string, secondUserId: string): CaroStoredState {
    return {
      kind: 'CARO',
      board: emptyBoard(),
      marks: { [firstUserId]: 'X', [secondUserId]: 'O' },
      lastMove: null,
      winLine: null,
    };
  }

  /**
   * Chia bài và quyết định ai đi trước.
   *
   * Ván ĐẦU TIÊN của cặp đôi: người cầm **lá nhỏ nhất đã chia** đi trước, và bộ
   * đầu tiên phải chứa lá đó. (Luật gốc nói "ai có 3♠", nhưng mỗi người 13 lá
   * thì 26 lá bị bỏ ra và 3♠ có thể không được chia cho ai — xem `deal.ts`.)
   *
   * Từ ván thứ hai: người thắng ván trước đi trước, ra bài tự do.
   */
  private async newTienLenState(
    coupleId: string,
    creatorId: string,
    partnerId: string,
  ): Promise<{ state: TienLenStoredState; firstUserId: string }> {
    const { hands, lowest } = dealTienLen();
    const byUser: Record<string, number[]> = {
      [creatorId]: hands[0],
      [partnerId]: hands[1],
    };

    /*
     * Tới trắng xét TRƯỚC mọi thứ khác: người cầm tay bài ấy thắng luôn, nên ai
     * đi trước hay lá nào bắt buộc đều thành vô nghĩa.
     *
     * Cả hai cùng tới trắng thì người tạo ván được tính thắng. Xác suất gần như
     * bằng không, nhưng "gần như" không phải là "không" — để hoà ở đây sẽ là một
     * nhánh code không ai từng chạy tới mà vẫn phải bảo trì.
     */
    const blitzUser = ([creatorId, partnerId] as const).find(
      (id) => detectInstantWin(byUser[id] as number[]) !== null,
    );
    const instantWin = blitzUser
      ? { userId: blitzUser, kind: detectInstantWin(byUser[blitzUser] as number[]) as InstantWinKind }
      : null;

    const lastWinner = await this.prisma.game.findFirst({
      where: {
        coupleId,
        kind: GameKind.TIEN_LEN,
        status: GameStatus.FINISHED,
        winnerId: { not: null },
      },
      orderBy: { finishedAt: 'desc' },
      select: { winnerId: true },
    });

    // Người thắng ván trước chỉ được đi trước nếu họ vẫn ở trong ván này.
    const previous =
      lastWinner?.winnerId && byUser[lastWinner.winnerId] ? lastWinner.winnerId : null;

    const base: Omit<TienLenStoredState, 'mustInclude'> = {
      kind: 'TIEN_LEN',
      hands: byUser,
      pile: [],
      passedBy: null,
      thoiThreeSpade: null,
      instantWin,
    };

    if (previous) {
      return {
        state: { ...base, mustInclude: null },
        firstUserId: previous,
      };
    }

    const firstUserId = byUser[creatorId]?.includes(lowest) ? creatorId : partnerId;
    return {
      state: { ...base, mustInclude: lowest },
      firstUserId,
    };
  }

  // ------------------------------------------------------------------
  // Nước đi
  // ------------------------------------------------------------------

  async move(
    userId: string,
    gameId: string,
    version: number,
    rawMove: unknown,
  ): Promise<GameResponse> {
    const { game } = await this.load(userId, gameId);

    if (game.status !== GameStatus.PLAYING) {
      throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, 'Ván này đã kết thúc rồi');
    }
    if (game.turnUserId !== userId) {
      throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, 'Chưa tới lượt bạn');
    }

    const saved =
      game.kind === GameKind.CARO
        ? await this.applyCaroMove(game, userId, version, parseCaroMove(rawMove), false)
        : await this.applyTienLenMove(game, userId, version, parseTienLenMove(rawMove), false);

    return this.toResponse(saved, userId);
  }

  /**
   * Đặt một quân rồi chốt kết quả.
   *
   * Dùng chung cho cả nước người bấm lẫn nước do đồng hồ sinh ra, để hai đường
   * không thể xử khác nhau — trọng tài chỉ có một bộ luật.
   */
  private async applyCaroMove(
    game: GameWithPlayers,
    userId: string,
    version: number,
    move: { r: number; c: number },
    auto: boolean,
  ): Promise<GameWithPlayers> {
    const state = this.readCaroState(game);
    const mark = state.marks[userId];
    if (!mark) {
      throw AppError.forbidden(ERROR_CODES.FORBIDDEN, 'Bạn không ở trong ván này');
    }

    const invalid = checkMove(state.board, move.r, move.c);
    if (invalid) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, invalid.message);
    }

    const board = placeMark(state.board, move.r, move.c, mark);
    const win = findWin(board, move.r, move.c);
    const full = isBoardFull(board);

    const next: CaroStoredState = {
      ...state,
      board,
      lastMove: { r: move.r, c: move.c },
      winLine: win?.line ?? null,
    };

    const partnerId = this.partnerOf(game, userId);
    const now = new Date();

    let data: Prisma.GameUpdateInput;
    let over: { winnerId: string | null; endReason: GameEndReason } | null = null;

    if (win) {
      over = { winnerId: userId, endReason: 'DU_QUAN' };
    } else if (full) {
      over = { winnerId: null, endReason: 'HOA' };
    }

    if (over) {
      data = {
        state: next as unknown as Prisma.InputJsonValue,
        status: GameStatus.FINISHED,
        turnUser: { disconnect: true },
        turnDeadlineAt: null,
        winner: over.winnerId ? { connect: { id: over.winnerId } } : undefined,
        endReason: over.endReason,
        finishedAt: now,
        lastMoveAt: now,
        lastMoveAuto: auto,
      };
    } else {
      data = {
        state: next as unknown as Prisma.InputJsonValue,
        turnUser: partnerId ? { connect: { id: partnerId } } : { disconnect: true },
        // Lượt mới, đồng hồ mới. Đối phương có thể đang không mở app — gateway
        // sẽ tạm dừng ngay khi biết, xem `pauseClock`.
        turnDeadlineAt: new Date(now.getTime() + TURN_MS),
        turnRemainingMs: TURN_MS,
        lastMoveAt: now,
        lastMoveAuto: auto,
      };
    }

    const saved = await this.commit(game, version, data, {
      userId,
      payload: move,
      auto,
    });

    this.announce(game.id, userId, partnerId, over?.endReason ?? null, auto);
    return saved;
  }

  // ------------------------------------------------------------------

  /**
   * Đánh bài hoặc bỏ lượt.
   *
   * Với hai người, "vòng" đơn giản hơn hẳn bản bốn người: bỏ lượt là mất vòng
   * NGAY, không phải chờ ai khác. Người kia ăn vòng, bàn được dọn, và họ ra bài
   * tự do ở lượt sau.
   */
  private async applyTienLenMove(
    game: GameWithPlayers,
    userId: string,
    version: number,
    move: TienLenMove,
    auto: boolean,
  ): Promise<GameWithPlayers> {
    const state = this.readTienLenState(game);
    const partnerId = this.partnerOf(game, userId);
    if (!partnerId) {
      throw AppError.conflict(ERROR_CODES.NOT_IN_COUPLE, 'Ván này không còn đủ hai người');
    }

    // Toàn bộ luật nằm ở `packages/shared` — service không tự phán xử gì cả.
    const result = stepTienLen(state, userId, partnerId, move);
    if (!result.ok) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, result.error.message);
    }

    const now = new Date();
    const next: TienLenStoredState = { kind: 'TIEN_LEN', ...result.step.state };
    const over: { winnerId: string | null; endReason: GameEndReason } | null =
      result.step.finished ? { winnerId: result.step.winnerId, endReason: 'HET_BAI' } : null;

    const data: Prisma.GameUpdateInput = over
      ? {
          state: next as unknown as Prisma.InputJsonValue,
          status: GameStatus.FINISHED,
          turnUser: { disconnect: true },
          turnDeadlineAt: null,
          winner: { connect: { id: over.winnerId as string } },
          endReason: over.endReason,
          finishedAt: now,
          lastMoveAt: now,
          lastMoveAuto: auto,
        }
      : {
          state: next as unknown as Prisma.InputJsonValue,
          turnUser: { connect: { id: result.step.nextTurnUserId as string } },
          turnDeadlineAt: new Date(now.getTime() + TURN_MS),
          turnRemainingMs: TURN_MS,
          lastMoveAt: now,
          lastMoveAuto: auto,
        };

    const saved = await this.commit(game, version, data, {
      userId,
      payload: move,
      auto,
    });

    this.announce(game.id, userId, partnerId, over?.endReason ?? null, auto);
    return saved;
  }

  /** Báo cho người ấy biết tới lượt họ — hoặc ghi log khi ván đã xong. */
  private announce(
    gameId: string,
    userId: string,
    partnerId: string | null,
    endReason: GameEndReason | null,
    auto: boolean,
  ): void {
    if (endReason) {
      this.logger.log(`Ván ${gameId} kết thúc: ${endReason}`);
      return;
    }
    if (!partnerId) return;

    // Cố tình KHÔNG await — thông báo hỏng không được làm hỏng nước đi.
    void this.push.sendToPartner(userId, {
      kind: 'GAME_TURN',
      title: 'Tới lượt bạn rồi',
      body: auto ? 'Đối phương hết giờ — tới lượt bạn' : 'Đối phương vừa đi một nước',
      url: `/tro-choi/${gameId}`,
      tag: `game:${gameId}`,
      at: Date.now(),
    });
  }

  // ------------------------------------------------------------------
  // Đầu hàng
  // ------------------------------------------------------------------

  async resign(userId: string, gameId: string): Promise<GameResponse> {
    const { game } = await this.load(userId, gameId);
    if (game.status !== GameStatus.PLAYING) {
      throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, 'Ván này đã kết thúc rồi');
    }

    const partnerId = this.partnerOf(game, userId);

    /*
     * Đầu hàng cũng là một cách kết thúc ván, nên luật thối 3 bích vẫn áp: người
     * bỏ cuộc mà còn ôm 3♠ thì vẫn bị ghi tên. Không ghi thì đầu hàng thành cách
     * chạy trốn khỏi con bài thối.
     */
    const thoi =
      game.kind === GameKind.TIEN_LEN ? this.markThoiThreeSpade(game, userId) : null;

    const saved = await this.commit(game, game.version, {
      status: GameStatus.FINISHED,
      turnUser: { disconnect: true },
      turnDeadlineAt: null,
      winner: partnerId ? { connect: { id: partnerId } } : undefined,
      endReason: 'DAU_HANG',
      finishedAt: new Date(),
      lastMoveAt: new Date(),
      ...(thoi ? { state: thoi as unknown as Prisma.InputJsonValue } : {}),
    });

    return this.toResponse(saved, userId);
  }

  // ------------------------------------------------------------------
  // Đồng hồ
  // ------------------------------------------------------------------

  /**
   * Tạm dừng đồng hồ vì người tới lượt vừa ẩn app.
   *
   * Đây là chốt chặn cho ràng buộc §1.3 của ARCHITECTURE.md: iOS treo JavaScript
   * ngay khi khoá màn hình. Không dừng thì đồng hồ 30 giây biến thành cái máy
   * phạt oan người vừa nhận một cuộc gọi.
   *
   * Trả `null` khi không có gì thay đổi (không phải lượt của họ, hoặc đã dừng rồi).
   */
  async pauseClock(userId: string, gameId: string): Promise<GameResponse | null> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: COUPLE_INCLUDE,
    });
    if (!game || game.status !== GameStatus.PLAYING) return null;
    if (game.turnUserId !== userId || game.turnDeadlineAt === null) return null;

    const remaining = Math.max(0, game.turnDeadlineAt.getTime() - Date.now());
    const saved = await this.prisma.game.update({
      where: { id: gameId },
      data: { turnDeadlineAt: null, turnRemainingMs: remaining },
      include: COUPLE_INCLUDE,
    });
    return this.toResponse(saved, userId);
  }

  /** Người tới lượt mở lại app → đồng hồ chạy tiếp từ đúng chỗ đã dừng. */
  async resumeClock(userId: string, gameId: string): Promise<GameResponse | null> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: COUPLE_INCLUDE,
    });
    if (!game || game.status !== GameStatus.PLAYING) return null;
    if (game.turnUserId !== userId || game.turnDeadlineAt !== null) return null;

    const saved = await this.prisma.game.update({
      where: { id: gameId },
      data: { turnDeadlineAt: new Date(Date.now() + game.turnRemainingMs) },
      include: COUPLE_INCLUDE,
    });
    return this.toResponse(saved, userId);
  }

  /**
   * Xử lý một ván đã hết giờ. Gọi từ cron.
   *
   * Caro không có nước "bỏ lượt", nên hết giờ là **thua ván** — đúng luật đồng
   * hồ cờ. Cơ chế tạm dừng ở trên mới là thứ giữ cho điều đó không thành oan uổng.
   */
  async timeout(gameId: string): Promise<TimeoutResult | null> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: COUPLE_INCLUDE,
    });
    if (!game || game.status !== GameStatus.PLAYING) return null;
    if (!game.turnDeadlineAt || game.turnDeadlineAt.getTime() > Date.now()) return null;

    const lateId = game.turnUserId;
    if (!lateId) return null;

    /*
     * Hai game xử khác nhau — và đây là chỗ DUY NHẤT chúng khác nhau.
     *
     * Cờ không có nước "bỏ lượt" nên hết giờ là thua, đúng luật đồng hồ cờ.
     * Tiến lên thì có: hết giờ chỉ mất lượt, ván đi tiếp. Xử thua ở Tiến lên
     * sẽ là một hình phạt nặng hơn hẳn thứ người chơi đáng nhận.
     */
    if (game.kind === GameKind.CARO) {
      const winnerId = this.partnerOf(game, lateId);
      const saved = await this.commit(game, game.version, {
        status: GameStatus.FINISHED,
        turnUser: { disconnect: true },
        turnDeadlineAt: null,
        winner: winnerId ? { connect: { id: winnerId } } : undefined,
        endReason: 'HET_GIO',
        finishedAt: new Date(),
        lastMoveAuto: true,
      });
      return { game: saved, finished: true, winnerId, endReason: 'HET_GIO' };
    }

    const state = this.readTienLenState(game);
    const auto = autoActionTienLen(state, lateId);
    // Bàn trống mà tay cũng trống là trạng thái không thể có (hết bài thì ván đã
    // kết thúc) — nhưng nếu gặp thì bỏ qua, đừng dựng một nước đi rỗng.
    if (!auto) return null;

    const saved = await this.applyTienLenMove(game, lateId, game.version, auto, true);
    const finished = saved.status !== GameStatus.PLAYING;
    return {
      game: saved,
      finished,
      winnerId: saved.winnerId,
      endReason: (saved.endReason as GameEndReason | null) ?? null,
    };
  }

  /** Ván không ai đi quá lâu → dọn đi cho danh sách khỏi tích rác. */
  async abandonStale(): Promise<string[]> {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_MS);
    const stale = await this.prisma.game.findMany({
      where: { status: GameStatus.PLAYING, lastMoveAt: { lt: cutoff } },
      select: { id: true },
    });
    if (stale.length === 0) return [];

    await this.prisma.game.updateMany({
      where: { id: { in: stale.map((g) => g.id) } },
      data: {
        status: GameStatus.ABANDONED,
        endReason: 'BO_DO',
        turnDeadlineAt: null,
        finishedAt: new Date(),
      },
    });
    return stale.map((g) => g.id);
  }

  /** Ván đang chạy có đồng hồ đã quá hạn — cho cron quét. */
  async findExpired(): Promise<string[]> {
    const rows = await this.prisma.game.findMany({
      where: {
        status: GameStatus.PLAYING,
        turnDeadlineAt: { not: null, lte: new Date() },
      },
      select: { id: true },
      take: 20,
    });
    return rows.map((r) => r.id);
  }

  // ------------------------------------------------------------------
  // Hạ tầng dùng chung
  // ------------------------------------------------------------------

  /**
   * Nạp ván và chốt quyền truy cập.
   *
   * "Ván không tồn tại" và "ván của cặp đôi khác" trả về CÙNG một 404 — giống
   * cách `posts` và `events` đang làm, không để ai dò được id nào có thật.
   */
  private async load(
    userId: string,
    gameId: string,
  ): Promise<{ ctx: CoupleContext; game: GameWithPlayers }> {
    // Hai truy vấn không phụ thuộc nhau — hỏi song song để bớt một vòng tới DB.
    // Trên đường đi một nước bài thì mỗi vòng đều được tính vào độ trễ người chơi.
    const [ctx, game] = await Promise.all([
      this.locations.getContext(userId),
      this.prisma.game.findUnique({
        where: { id: gameId },
        include: COUPLE_INCLUDE,
      }),
    ]);
    if (!game || game.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ván này');
    }
    return { ctx, game };
  }

  /**
   * Ghi một thay đổi kèm **khoá lạc quan**.
   *
   * `updateMany ... where version = <đã đọc>` chỉ đổi được dòng khi chưa ai đi
   * trước. Trường hợp thật sự xảy ra: đồng hồ hết giờ ĐÚNG LÚC người chơi bấm
   * đánh — cả hai cùng ghi, một cái thua, và đó là kết quả đúng: ván không bao
   * giờ đi hai nước cho một lượt.
   *
   * Cố tình KHÔNG dùng transaction Serializable — ADR 2026-09-07 đã ghi lại bài
   * học lúc ghép đôi: bên thua cuộc trả 500 vì hết `maxWait` của Prisma.
   */
  private async commit(
    game: GameWithPlayers,
    version: number,
    data: Prisma.GameUpdateInput,
    move?: { userId: string; payload: object; auto: boolean },
  ): Promise<GameWithPlayers> {
    const nextNo = await this.prisma.gameMove.count({ where: { gameId: game.id } });

    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.game.updateMany({
        where: { id: game.id, version },
        // `updateMany` không nhận cú pháp quan hệ lồng nhau, nên phải hạ về id thuần.
        data: { ...flattenRelations(data), version: { increment: 1 } },
      });
      if (changed.count === 0) return null;

      if (move) {
        await tx.gameMove.create({
          data: {
            gameId: game.id,
            userId: move.userId,
            no: nextNo + 1,
            payload: move.payload as unknown as Prisma.InputJsonValue,
            auto: move.auto,
          },
        });
      }

      return tx.game.findUniqueOrThrow({
        where: { id: game.id },
        include: COUPLE_INCLUDE,
      });
    });

    if (!result) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        'Ván vừa thay đổi, thử lại nhé',
      );
    }
    return result;
  }

  /**
   * Nạp ván cho việc phát state, KHÔNG kèm kiểm quyền.
   *
   * Gateway gọi đúng một lần rồi tự dựng bản riêng cho từng người bằng
   * `toResponse()` — trước đây mỗi socket một lần `get()`, tức là hai truy vấn
   * DB nhân với số tab đang mở, ngay trên đường đi của một nước bài.
   *
   * Vì hàm này bỏ qua kiểm quyền nên nơi gọi **bắt buộc** lọc bằng `isMember()`
   * trước khi gửi bất cứ thứ gì đi: `state` chứa bài úp của cả hai người.
   */
  async loadForBroadcast(gameId: string): Promise<GameWithPlayers | null> {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      include: COUPLE_INCLUDE,
    });
  }

  /** Người này có thuộc cặp đôi sở hữu ván không. */
  isMember(game: GameWithPlayers, userId: string): boolean {
    return game.couple.members.some((m) => m.id === userId);
  }

  private partnerOf(game: GameWithPlayers, userId: string): string | null {
    return game.couple.members.find((m) => m.id !== userId)?.id ?? null;
  }

  private readCaroState(game: Game): CaroStoredState {
    const raw = game.state as unknown as Partial<CaroStoredState> | null;
    // Bàn cờ hỏng thì không có gì cứu được — nhưng cũng không được để nó làm
    // sập tiến trình, nên dựng lại bàn trống và ghi log.
    if (!raw || typeof raw.board !== 'string' || raw.board.length !== CARO_SIZE * CARO_SIZE) {
      this.logger.error(`Ván ${game.id} có state hỏng, dựng lại bàn trống`);
      const marks = raw?.marks ?? {};
      return { kind: 'CARO', board: emptyBoard(), marks, lastMove: null, winLine: null };
    }
    return {
      kind: 'CARO',
      board: raw.board,
      marks: raw.marks ?? {},
      lastMove: raw.lastMove ?? null,
      winLine: raw.winLine ?? null,
    };
  }

  /**
   * Ghi tên người thua còn ôm 3♠ vào state.
   *
   * `stepTienLen()` đã tự làm việc này cho ván kết thúc bằng **hết bài** — nơi
   * luật bài biết chắc ai thua. Hàm này lo các kiểu kết thúc còn lại (đầu hàng),
   * nơi người thua là do service quyết chứ không phải luật bài.
   */
  private markThoiThreeSpade(game: Game, loserId: string): TienLenStoredState | null {
    const state = this.readTienLenState(game);
    if (!holdsThreeSpade(state.hands[loserId] ?? [])) return null;
    return { ...state, thoiThreeSpade: loserId };
  }

  private readTienLenState(game: Game): TienLenStoredState {
    const raw = game.state as unknown as Partial<TienLenStoredState> | null;
    if (!raw || typeof raw.hands !== 'object' || raw.hands === null) {
      // Không dựng lại được ván bài từ hư không — khác bàn cờ, ở đây mọi thứ
      // đều nằm trong `state`. Ném lỗi rõ ràng hơn là trả một ván méo.
      this.logger.error(`Ván ${game.id} có state hỏng`);
      throw AppError.conflict(ERROR_CODES.INTERNAL, 'Ván này bị lỗi dữ liệu, mở ván mới nhé');
    }
    return {
      kind: 'TIEN_LEN',
      hands: raw.hands,
      /*
       * Ván mở trước khi bàn giữ lịch sử chỉ có đúng `table` (một bộ). Nâng nó
       * lên thành chồng bài một tầng thay vì bỏ trắng — ván đang chơi dở lúc
       * triển khai vẫn chạy tiếp được, chỉ mất phần lịch sử của vòng đó.
       */
      pile: raw.pile ?? (legacyTable(raw) ? [legacyTable(raw) as TienLenPlay] : []),
      passedBy: raw.passedBy ?? null,
      mustInclude: raw.mustInclude ?? null,
      thoiThreeSpade: raw.thoiThreeSpade ?? null,
      instantWin: raw.instantWin ?? null,
    };
  }

  /**
   * Lọc trạng thái theo người xem — **chỗ duy nhất** trong toàn bộ code base
   * mà `state` được mở ra để gửi đi.
   *
   * Với Tiến lên, đây là hàng rào giữ cho bài trên tay không bị lộ: người xem
   * thấy bài của mình, còn của đối phương chỉ thấy SỐ LÁ. Thêm bất kỳ đường ra
   * nào khác cho `game.state` là phá thẳng luật số một ở `docs/thiet-ke-games.md` §2.
   */
  private clientState(game: GameWithPlayers, viewerId: string): GameClientState {
    if (game.kind === GameKind.CARO) {
      const stored = this.readCaroState(game);
      return {
        kind: 'CARO',
        board: stored.board,
        marks: stored.marks,
        lastMove: stored.lastMove,
        winLine: stored.winLine,
      } satisfies CaroClientState;
    }

    return viewTienLen(
      this.readTienLenState(game),
      viewerId,
      this.partnerOf(game, viewerId),
    );
  }

  /**
   * Đổi bản ghi thành thứ gửi được cho client.
   *
   * Với caro, bàn cờ hai bên đều thấy nên không có gì phải lọc — nhưng hàm này
   * vẫn nhận `viewerId` để khi Tiến lên nối vào, chỗ lọc bài đã sẵn ở đúng đây
   * chứ không rải rác mỗi nơi một kiểu.
   */
  toResponse(game: GameWithPlayers, viewerId: string): GameResponse {
    return {
      state: this.clientState(game, viewerId),
      id: game.id,
      kind: game.kind,
      status: game.status,
      // Người đang xem luôn đứng đầu — giao diện khỏi phải tự tìm "ai là tôi".
      players: [...game.couple.members]
        .sort((a, b) => (a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0))
        .map((m) => ({ userId: m.id, displayName: m.displayName })),
      turnUserId: game.turnUserId,
      turnDeadlineAt: game.turnDeadlineAt?.getTime() ?? null,
      turnRemainingMs: game.turnRemainingMs,
      winnerId: game.winnerId,
      endReason: (game.endReason as GameEndReason | null) ?? null,
      version: game.version,
      lastMoveAuto: game.lastMoveAuto,
      createdAt: game.createdAt.toISOString(),
      abandonAt: game.lastMoveAt.getTime() + ABANDON_AFTER_MS,
    };
  }
}

/** Nước đi Tiến lên: đánh một bộ, hoặc bỏ lượt. */
type TienLenMove = TienLenAction;

export interface TimeoutResult {
  game: GameWithPlayers;
  /** Ván kết thúc luôn, hay chỉ mất lượt rồi đi tiếp. */
  finished: boolean;
  winnerId: string | null;
  endReason: GameEndReason | null;
}

function parseCaroMove(raw: unknown): { r: number; c: number } {
  const parsed = caroMoveSchema.safeParse(raw);
  if (!parsed.success) {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Nước đi không hợp lệ');
  }
  return parsed.data;
}

function parseTienLenMove(raw: unknown): TienLenMove {
  const parsed = tienLenMoveSchema.safeParse(raw);
  if (!parsed.success) {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Nước đi không hợp lệ');
  }
  return parsed.data;
}

/**
 * `updateMany` chỉ nhận cột thuần, không nhận `{ connect }` / `{ disconnect }`.
 * Hạ các quan hệ về đúng cột khoá ngoại để cùng một mô tả thay đổi dùng được
 * cho cả `update` lẫn `updateMany`.
 */
function flattenRelations(data: Prisma.GameUpdateInput): Prisma.GameUpdateManyMutationInput {
  const { turnUser, winner, ...rest } = data as Prisma.GameUpdateInput & {
    turnUser?: { connect?: { id: string }; disconnect?: boolean };
    winner?: { connect?: { id: string }; disconnect?: boolean };
  };

  const out = { ...rest } as Prisma.GameUpdateManyMutationInput & {
    turnUserId?: string | null;
    winnerId?: string | null;
  };

  if (turnUser) {
    out.turnUserId = turnUser.connect ? turnUser.connect.id : null;
  }
  if (winner) {
    out.winnerId = winner.connect ? winner.connect.id : null;
  }
  return out;
}

/**
 * Bộ trên bàn của các ván mở **trước khi** bàn giữ lịch sử.
 *
 * Khuôn cũ chỉ có `table` (một bộ), khuôn mới là `pile` (cả chồng). Tách ra một
 * hàm riêng thay vì nới lỏng kiểu của `TienLenStoredState`: cột `state` cũ là
 * chuyện của quá khứ, không nên để nó làm bẩn kiểu dữ liệu đang dùng.
 */
function legacyTable(raw: unknown): TienLenPlay | null {
  const table = (raw as { table?: unknown } | null)?.table;
  if (!table || typeof table !== 'object') return null;
  const { userId, cards } = table as { userId?: unknown; cards?: unknown };
  if (typeof userId !== 'string' || !Array.isArray(cards)) return null;
  return { userId, cards: cards.filter((c): c is number => Number.isInteger(c)) };
}
