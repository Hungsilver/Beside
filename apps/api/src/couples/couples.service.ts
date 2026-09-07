import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Couple, type User } from '@prisma/client';
import {
  buildLoveSummary,
  ERROR_CODES,
  ymdInTimeZone,
  type CoupleResponse,
  type LoveSummary,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { toPublicUser, toDateOnly } from '../users/user.mapper';
import { generateInviteCode } from './invite-code';
import { LocationsService } from '../locations/locations.service';
import type { Env } from '../config/env';

type CoupleWithMembers = Couple & { members: User[] };

@Injectable()
export class CouplesService {
  private readonly logger = new Logger(CouplesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------
  // Tạo couple + sinh mã mời
  // ------------------------------------------------------------------

  async create(userId: string, anniversaryAt: Date): Promise<CoupleResponse> {
    const user = await this.getUserOrThrow(userId);
    if (user.coupleId) {
      throw AppError.conflict(
        ERROR_CODES.ALREADY_IN_COUPLE,
        'Bạn đang ở trong một cặp đôi rồi. Huỷ ghép đôi trước khi tạo mới.',
      );
    }

    const expiresAt = this.inviteExpiry();

    // Mã ghép đôi có ràng buộc unique. Xác suất trùng cực thấp nhưng vẫn có,
    // nên thử lại vài lần thay vì để lỗi 500 rơi vào mặt người dùng.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const couple = await this.prisma.couple.create({
          data: {
            anniversaryAt: this.toDateOnlyUtc(anniversaryAt),
            inviteCode: generateInviteCode(),
            inviteExpiresAt: expiresAt,
            members: { connect: { id: userId } },
          },
          include: { members: true },
        });
        return this.toResponse(couple, userId);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.warn(`Mã ghép đôi bị trùng, sinh lại (lần ${attempt + 1})`);
          continue;
        }
        throw err;
      }
    }

    throw AppError.conflict(
      ERROR_CODES.INTERNAL,
      'Không sinh được mã ghép đôi, vui lòng thử lại',
    );
  }

  // ------------------------------------------------------------------
  // Tham gia bằng mã mời
  // ------------------------------------------------------------------

  async join(userId: string, inviteCode: string): Promise<CoupleResponse> {
    // --- Bước 1: kiểm tra để BÁO LỖI CHO ĐÚNG (chưa phải chốt chặn) ---
    const user = await this.getUserOrThrow(userId);
    if (user.coupleId) {
      throw AppError.conflict(
        ERROR_CODES.ALREADY_IN_COUPLE,
        'Bạn đang ở trong một cặp đôi rồi',
      );
    }

    const found = await this.prisma.couple.findUnique({
      where: { inviteCode },
      include: { members: true },
    });
    if (!found) {
      throw AppError.notFound(
        ERROR_CODES.INVITE_NOT_FOUND,
        'Mã ghép đôi không tồn tại',
      );
    }
    if (found.members.some((m) => m.id === userId)) {
      throw AppError.badRequest(
        ERROR_CODES.INVITE_SELF_JOIN,
        'Đây là mã của chính bạn — hãy gửi mã này cho người ấy',
      );
    }
    // Kiểm tra "đã dùng" TRƯỚC "hết hạn": mã đã ghép xong thì lý do thật là
    // couple đã đủ người, chứ không phải hết hạn — dù mốc hết hạn cũng đã trôi qua.
    if (found.inviteConsumedAt || found.members.length >= 2) {
      throw AppError.conflict(ERROR_CODES.COUPLE_FULL, 'Cặp đôi này đã đủ 2 người');
    }
    if (found.inviteExpiresAt && found.inviteExpiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest(
        ERROR_CODES.INVITE_EXPIRED,
        'Mã ghép đôi đã hết hạn. Nhờ người ấy tạo mã mới nhé.',
      );
    }

    /*
     * --- Bước 2: CHỐT CHẶN thật, chống hai người bấm "Kết đôi" cùng lúc ---
     *
     * Các phép kiểm tra ở bước 1 chỉ để hiện thông báo dễ hiểu; chúng KHÔNG
     * chống được race, vì giữa lúc đọc và lúc ghi vẫn có khe hở.
     *
     * Ở đây dùng "atomic claim": đánh dấu invite_consumed_at bằng MỘT câu UPDATE
     * có điều kiện `WHERE invite_consumed_at IS NULL`. Postgres khoá dòng đó, nên
     * trong hai giao dịch song song chỉ đúng một cái đổi được (count = 1);
     * cái còn lại thấy đã có giá trị (count = 0) và bị từ chối.
     *
     * Trước đây chỗ này dùng isolation Serializable. Cách đó đúng về dữ liệu nhưng
     * giao dịch thứ hai chết vì hết thời gian chờ của Prisma và trả về 500 — người
     * dùng thấy "lỗi máy chủ" thay vì lời giải thích. Atomic claim chạy được ở mức
     * Read Committed mặc định nên không có xung đột phải thử lại.
     *
     * Mã mời được GIỮ NGUYÊN (không xoá) để người vào sau còn nhận được thông báo
     * "cặp đôi đã đủ 2 người" thay vì "mã không tồn tại".
     */
    const couple = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.couple.updateMany({
          where: { id: found.id, inviteConsumedAt: null },
          data: { inviteConsumedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw AppError.conflict(
            ERROR_CODES.COUPLE_FULL,
            'Có người vừa ghép đôi trước bạn mất rồi.',
          );
        }

        // Chỉ gắn khi người này vẫn còn "chưa thuộc couple nào".
        // Nếu count = 0 thì giao dịch rollback, mã mời được khôi phục nguyên vẹn.
        const attached = await tx.user.updateMany({
          where: { id: userId, coupleId: null },
          data: { coupleId: found.id },
        });
        if (attached.count === 0) {
          throw AppError.conflict(
            ERROR_CODES.ALREADY_IN_COUPLE,
            'Bạn đang ở trong một cặp đôi rồi',
          );
        }

        const result = await tx.couple.findUniqueOrThrow({
          where: { id: found.id },
          include: { members: true },
        });

        // Chốt chặn cuối: dữ liệu không bao giờ được phép có 3 người.
        if (result.members.length > 2) {
          throw AppError.conflict(
            ERROR_CODES.COUPLE_FULL,
            'Cặp đôi này đã đủ 2 người',
          );
        }
        return result;
      },
      // Nới thời gian chờ mặc định của Prisma (2s/5s): khi hai người bấm cùng lúc,
      // giao dịch sau phải đợi khoá dòng của giao dịch trước.
      { maxWait: 10_000, timeout: 15_000 },
    );

    return this.toResponse(couple, userId);
  }

  // ------------------------------------------------------------------
  // Đọc
  // ------------------------------------------------------------------

  async findMine(userId: string): Promise<CoupleResponse> {
    const couple = await this.getMyCoupleOrThrow(userId);
    return this.toResponse(couple, userId);
  }

  async loveSummary(userId: string, now: Date = new Date()): Promise<LoveSummary> {
    const couple = await this.getMyCoupleOrThrow(userId);
    return buildLoveSummary(couple.anniversaryAt, now);
  }

  async updateAnniversary(
    userId: string,
    anniversaryAt: Date,
  ): Promise<CoupleResponse> {
    const couple = await this.getMyCoupleOrThrow(userId);
    const updated = await this.prisma.couple.update({
      where: { id: couple.id },
      data: { anniversaryAt: this.toDateOnlyUtc(anniversaryAt) },
      include: { members: true },
    });
    return this.toResponse(updated, userId);
  }

  /** Tạo lại mã mời (khi mã cũ hết hạn và vẫn chưa ai ghép vào). */
  async regenerateInvite(userId: string): Promise<CoupleResponse> {
    const couple = await this.getMyCoupleOrThrow(userId);
    if (couple.members.length >= 2) {
      throw AppError.conflict(
        ERROR_CODES.COUPLE_FULL,
        'Cặp đôi đã đủ 2 người, không cần mã mời nữa',
      );
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const updated = await this.prisma.couple.update({
          where: { id: couple.id },
          data: {
            inviteCode: generateInviteCode(),
            inviteExpiresAt: this.inviteExpiry(),
            // Mã mới thì chưa ai giành — đặt lại chốt chặn về trạng thái ban đầu.
            inviteConsumedAt: null,
          },
          include: { members: true },
        });
        return this.toResponse(updated, userId);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw AppError.conflict(
      ERROR_CODES.INTERNAL,
      'Không sinh được mã ghép đôi, vui lòng thử lại',
    );
  }

  /**
   * Huỷ ghép đôi — XOÁ HẲN couple và toàn bộ dữ liệu chung
   * (vị trí, check-in, lịch, địa điểm... theo onDelete: Cascade).
   * Không thể khôi phục, nên controller bắt buộc phải có xác nhận.
   */
  async unpair(userId: string): Promise<void> {
    const couple = await this.getMyCoupleOrThrow(userId);

    const memberIds = couple.members.map((m) => m.id);

    await this.prisma.$transaction(async (tx) => {
      // Gỡ liên kết của cả hai người trước, rồi mới xoá couple.
      await tx.user.updateMany({
        where: { coupleId: couple.id },
        data: { coupleId: null },
      });
      await tx.couple.delete({ where: { id: couple.id } });
    });

    // Postgres đã xoá theo cascade, nhưng Redis thì không biết gì về chuyện đó.
    // Không dọn ở đây thì người ghép đôi tiếp theo sẽ đọc trúng cache và thấy
    // vị trí cuối cùng từ mối quan hệ trước (trace rà soát, RV-20).
    await this.locations.forgetCachedLocations(memberIds);

    this.logger.log(`Couple ${couple.id} đã bị huỷ bởi user ${userId}`);
  }

  // ------------------------------------------------------------------
  // Hỗ trợ
  // ------------------------------------------------------------------

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.unauthorized(
        ERROR_CODES.UNAUTHENTICATED,
        'Tài khoản không còn tồn tại',
      );
    }
    return user;
  }

  private async getMyCoupleOrThrow(userId: string): Promise<CoupleWithMembers> {
    const user = await this.getUserOrThrow(userId);
    if (!user.coupleId) {
      throw AppError.notFound(
        ERROR_CODES.NOT_IN_COUPLE,
        'Bạn chưa ghép đôi với ai cả',
      );
    }
    const couple = await this.prisma.couple.findUnique({
      where: { id: user.coupleId },
      include: { members: true },
    });
    if (!couple) {
      // Dữ liệu không nhất quán — dọn luôn để lần sau không lặp lại.
      await this.prisma.user.update({
        where: { id: userId },
        data: { coupleId: null },
      });
      throw AppError.notFound(
        ERROR_CODES.NOT_IN_COUPLE,
        'Bạn chưa ghép đôi với ai cả',
      );
    }
    return couple;
  }

  private inviteExpiry(): Date {
    const hours = this.config.get('INVITE_TTL_HOURS', { infer: true });
    return new Date(Date.now() + hours * 3_600_000);
  }

  /**
   * Chuẩn hoá ngày kỷ niệm trước khi ghi vào cột DATE.
   *
   * ĐỊNH NGHĨA: ngày kỷ niệm là NGÀY LỊCH THEO GIỜ VIỆT NAM.
   * Không được dùng `date.toISOString().slice(0,10)` ở đây: nếu client gửi
   * "2023-02-14T00:00:00+07:00" (= 2023-02-13T17:00Z) thì cách đó lưu nhầm
   * thành 13/02 — lệch đúng một ngày, và bộ đếm ngày yêu sẽ sai mãi mãi.
   */
  private toDateOnlyUtc(date: Date): Date {
    const { year, month, day } = ymdInTimeZone(date);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private toResponse(couple: CoupleWithMembers, viewerId: string): CoupleResponse {
    const members = couple.members.map(toPublicUser);
    const partner = members.find((m) => m.id !== viewerId) ?? null;
    // Mã đã dùng xong thì coi như không còn, dù vẫn được giữ trong DB.
    const codeDead = couple.inviteConsumedAt !== null || couple.members.length >= 2;

    return {
      id: couple.id,
      anniversaryAt: toDateOnly(couple.anniversaryAt),
      createdAt: couple.createdAt.toISOString(),
      // Không lộ mã mời khi đã đủ 2 người.
      inviteCode: codeDead ? null : couple.inviteCode,
      inviteExpiresAt:
        codeDead || !couple.inviteExpiresAt
          ? null
          : couple.inviteExpiresAt.toISOString(),
      members,
      partner,
    };
  }
}
