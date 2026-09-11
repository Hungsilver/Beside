import { Injectable, Logger } from '@nestjs/common';
import { CycleShareLevel, type PeriodEntry } from '@prisma/client';
import {
  CYCLE_LENGTH_DEFAULT,
  ERROR_CODES,
  PERIOD_LENGTH_DEFAULT,
  floatingDateToMs,
  msToFloatingDate,
  partnerView,
  periodLength,
  predictCycle,
  type CyclePartnerResponse,
  type CycleSelfResponse,
  type CycleSettingsInput,
  type PeriodEntryInput,
  type PeriodEntryResponse,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';

/**
 * F14 — Theo dõi chu kỳ kinh nguyệt.
 *
 * ── Luật riêng tư, áp Ở ĐÂY chứ không ở giao diện ───────────────────────────
 *   • Dữ liệu thuộc về MỘT người, không thuộc về couple. Mọi truy vấn đều khoá
 *     theo `userId` của chính người gọi.
 *   • Người ấy chỉ đọc được qua `forPartner()`, và nội dung đi ra đã được
 *     `partnerView()` (packages/shared, có unit test) cắt gọt theo mức chia sẻ.
 *   • Không log nội dung: nhật ký chỉ được có số lượng, không có ngày tháng.
 *     Đây là dữ liệu sức khoẻ, còn nhạy cảm hơn toạ độ (R3).
 */
@Injectable()
export class CycleService {
  private readonly logger = new Logger(CycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------ của mình

  async me(userId: string): Promise<CycleSelfResponse> {
    const [settings, entries] = await Promise.all([
      this.prisma.cycleSettings.findUnique({ where: { userId } }),
      this.prisma.periodEntry.findMany({
        where: { userId },
        orderBy: { startDate: 'desc' },
        take: 24,
      }),
    ]);

    const plain = entries.map(toPlain);

    return {
      // "Chưa có hàng cài đặt và chưa ghi kỳ nào" = chưa bật theo dõi. Không
      // cần thêm cột cờ bật/tắt, cũng không ghi gì vào DB chỉ vì người dùng mở
      // màn hình ra xem.
      enabled: Boolean(settings) || plain.length > 0,
      settings: {
        shareLevel: settings?.shareLevel ?? 'OFF',
        avgCycleDays: settings?.avgCycleDays ?? null,
        avgPeriodDays: settings?.avgPeriodDays ?? null,
        remindMe: settings?.remindMe ?? true,
        remindPartner: settings?.remindPartner ?? false,
      },
      entries: entries.map(toResponse),
      prediction: predictCycle(plain, {
        cycleDays: settings?.avgCycleDays ?? null,
        periodDays: settings?.avgPeriodDays ?? null,
      }),
    };
  }

  async saveSettings(userId: string, input: CycleSettingsInput): Promise<CycleSelfResponse> {
    const data = {
      shareLevel: input.shareLevel as CycleShareLevel,
      avgCycleDays: input.avgCycleDays ?? null,
      avgPeriodDays: input.avgPeriodDays ?? null,
      remindMe: input.remindMe,
      remindPartner: input.remindPartner,
    };

    await this.prisma.cycleSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return this.me(userId);
  }

  async addEntry(userId: string, input: PeriodEntryInput): Promise<CycleSelfResponse> {
    const startDate = toDate(input.startDate);
    const endDate = input.endDate ? toDate(input.endDate) : null;

    // Không cho ghi ngày ở tương lai: một kỳ "sẽ bắt đầu" thì chưa bắt đầu, mà
    // mốc gốc sai thì mọi dự đoán sau đó lệch theo.
    if (startDate.getTime() > Date.now()) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Ngày bắt đầu không thể ở tương lai',
      );
    }

    try {
      await this.prisma.periodEntry.create({ data: { userId, startDate, endDate } });
    } catch {
      // Trùng `(userId, startDate)` — bấm hai lần, hoặc ghi lại đúng ngày cũ.
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        'Đã có một kỳ bắt đầu vào ngày này rồi',
      );
    }

    // Tạo sẵn hàng cài đặt để lần sau `enabled` đúng ngay cả khi người dùng xoá
    // hết các kỳ đã ghi.
    await this.prisma.cycleSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    this.logger.log(`Ghi thêm một kỳ cho người dùng ${userId.slice(0, 8)}…`);
    return this.me(userId);
  }

  async updateEntry(
    userId: string,
    entryId: string,
    input: PeriodEntryInput,
  ): Promise<CycleSelfResponse> {
    const entry = await this.prisma.periodEntry.findUnique({ where: { id: entryId } });
    // Cùng một câu trả lời cho "không có" và "không phải của bạn".
    if (!entry || entry.userId !== userId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy kỳ này');
    }

    await this.prisma.periodEntry.update({
      where: { id: entryId },
      data: {
        startDate: toDate(input.startDate),
        endDate: input.endDate ? toDate(input.endDate) : null,
      },
    });

    return this.me(userId);
  }

  async removeEntry(userId: string, entryId: string): Promise<CycleSelfResponse> {
    const entry = await this.prisma.periodEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.userId !== userId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy kỳ này');
    }

    await this.prisma.periodEntry.delete({ where: { id: entryId } });
    return this.me(userId);
  }

  /**
   * Xoá SẠCH mọi dữ liệu chu kỳ của người này.
   *
   * Dữ liệu sức khoẻ thì "xoá" phải là xoá thật, không phải đánh dấu ẩn.
   */
  async wipe(userId: string): Promise<void> {
    const [, deleted] = await this.prisma.$transaction([
      this.prisma.cycleSettings.deleteMany({ where: { userId } }),
      this.prisma.periodEntry.deleteMany({ where: { userId } }),
    ]);
    this.logger.log(`Đã xoá ${deleted.count} bản ghi chu kỳ của ${userId.slice(0, 8)}…`);
  }

  // ------------------------------------------------------------------ của người ấy

  /**
   * Những gì NGƯỜI ẤY được thấy.
   *
   * Đọc dữ liệu của người kia rồi cắt gọt NGAY tại đây. Client không bao giờ
   * nhận về phần bị ẩn — ẩn ở giao diện thì chỉ cần mở tab Network là thấy hết.
   */
  async forPartner(userId: string): Promise<CyclePartnerResponse> {
    const ctx = await this.locations.getContext(userId);
    const hidden: CyclePartnerResponse = {
      shared: false,
      level: 'OFF',
      name: null,
      phase: null,
      nextStartDate: null,
      daysUntilNext: null,
    };

    if (!ctx.partnerId) return hidden;

    const partner = await this.prisma.user.findUnique({
      where: { id: ctx.partnerId },
      select: { displayName: true, cycleSettings: true },
    });
    const settings = partner?.cycleSettings;
    if (!partner || !settings || settings.shareLevel === CycleShareLevel.OFF) return hidden;

    const entries = await this.prisma.periodEntry.findMany({
      where: { userId: ctx.partnerId },
      orderBy: { startDate: 'desc' },
      take: 12,
    });

    const prediction = predictCycle(entries.map(toPlain), {
      cycleDays: settings.avgCycleDays,
      periodDays: settings.avgPeriodDays,
    });

    return partnerView(settings.shareLevel, partner.displayName, prediction);
  }

  // ------------------------------------------------------------------ nhắc nhở

  /**
   * Danh sách người cần nhắc hôm nay. Cron gọi — xem `cycle-reminder.job.ts`.
   *
   * Trả về dữ liệu đã tính sẵn để job chỉ còn việc gửi thông báo; nhờ vậy phần
   * logic "ai được nhắc, nhắc cái gì" vẫn nằm trong service và test được.
   */
  async dueReminders(now: Date = new Date()): Promise<
    { userId: string; name: string; partnerId: string | null; daysUntil: number;
      remindMe: boolean; remindPartner: boolean }[]
  > {
    const rows = await this.prisma.cycleSettings.findMany({
      where: { OR: [{ remindMe: true }, { remindPartner: true }] },
      select: {
        userId: true,
        shareLevel: true,
        avgCycleDays: true,
        avgPeriodDays: true,
        remindMe: true,
        remindPartner: true,
        user: {
          select: {
            displayName: true,
            couple: { select: { members: { select: { id: true } } } },
          },
        },
      },
    });

    const out: Awaited<ReturnType<CycleService['dueReminders']>> = [];

    for (const row of rows) {
      const entries = await this.prisma.periodEntry.findMany({
        where: { userId: row.userId },
        orderBy: { startDate: 'desc' },
        take: 12,
      });
      if (entries.length === 0) continue;

      const prediction = predictCycle(
        entries.map(toPlain),
        { cycleDays: row.avgCycleDays, periodDays: row.avgPeriodDays },
        now,
      );
      const days = prediction.daysUntilNext;
      // Chỉ nhắc đúng hai mốc: trước một ngày, và đúng ngày. Nhắc dày hơn thì
      // thành phiền, mà trễ rồi mới nhắc thì vô nghĩa.
      if (days === null || (days !== 0 && days !== 1)) continue;

      const partnerId =
        row.user.couple?.members.find((m) => m.id !== row.userId)?.id ?? null;

      out.push({
        userId: row.userId,
        name: row.user.displayName,
        // Không chia sẻ thì người ấy cũng không được nhận nhắc nhở — nếu không,
        // chính thông báo lại là thứ tiết lộ điều người dùng đã chọn giấu.
        partnerId: row.shareLevel === CycleShareLevel.OFF ? null : partnerId,
        daysUntil: days,
        remindMe: row.remindMe,
        remindPartner: row.remindPartner,
      });
    }

    return out;
  }
}

// ---------------------------------------------------------------------------

/** Bản ghi DB → cặp ngày trôi nổi mà `packages/shared` hiểu. */
function toPlain(entry: PeriodEntry): { startDate: string; endDate: string | null } {
  return {
    startDate: msToFloatingDate(entry.startDate.getTime()),
    endDate: entry.endDate ? msToFloatingDate(entry.endDate.getTime()) : null,
  };
}

/** Bản ghi DB → câu trả lời cho chính chủ (có `id` để sửa / xoá). */
function toResponse(entry: PeriodEntry): PeriodEntryResponse {
  const plain = toPlain(entry);
  return {
    id: entry.id,
    startDate: plain.startDate,
    endDate: plain.endDate,
    lengthDays: periodLength(plain.startDate, plain.endDate),
  };
}

/** `YYYY-MM-DD` → `Date` ở 00:00 UTC (ngày trôi nổi, §6.3). */
function toDate(ymd: string): Date {
  const ms = floatingDateToMs(ymd);
  if (!Number.isFinite(ms)) {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Ngày không hợp lệ');
  }
  return new Date(ms);
}

/** Giá trị mặc định dùng khi chưa có gì — để nơi gọi không phải nhớ con số. */
export const CYCLE_DEFAULTS = {
  cycleDays: CYCLE_LENGTH_DEFAULT,
  periodDays: PERIOD_LENGTH_DEFAULT,
} as const;
