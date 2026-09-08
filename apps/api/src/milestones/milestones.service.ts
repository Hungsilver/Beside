import { Injectable } from '@nestjs/common';
import { MilestoneKind as PrismaMilestoneKind } from '@prisma/client';
import {
  buildUpcomingMilestones,
  ERROR_CODES,
  MAX_CUSTOM_MILESTONES,
  type CreateMilestoneInput,
  type MilestoneItem,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Danh sách mốc sắp tới — trộn mốc tự sinh với mốc tự thêm.
   *
   * Toàn bộ phép tính nằm ở `buildUpcomingMilestones` trong `packages/shared`:
   * một hàm thuần, nhận `now` làm tham số nên unit test được mọi biên (năm
   * nhuận, đúng hôm nay, mốc đã qua) mà không cần DB.
   */
  async upcoming(userId: string, now: Date = new Date()): Promise<MilestoneItem[]> {
    const ctx = await this.locations.getContext(userId);

    const [couple, custom] = await Promise.all([
      this.prisma.couple.findUnique({
        where: { id: ctx.coupleId },
        select: {
          anniversaryAt: true,
          members: { select: { displayName: true, birthday: true } },
        },
      }),
      this.prisma.milestone.findMany({
        where: { coupleId: ctx.coupleId, kind: PrismaMilestoneKind.CUSTOM },
        orderBy: { date: 'asc' },
      }),
    ]);

    if (!couple) {
      throw AppError.notFound(ERROR_CODES.NOT_IN_COUPLE, 'Bạn chưa ghép đôi với ai cả');
    }

    return buildUpcomingMilestones(
      {
        anniversaryAt: couple.anniversaryAt,
        members: couple.members,
        custom: custom.map((m) => ({
          id: m.id,
          title: m.title,
          emoji: m.emoji,
          date: m.date,
          yearly: m.yearly,
        })),
      },
      now,
    );
  }

  async create(userId: string, input: CreateMilestoneInput): Promise<MilestoneItem[]> {
    const ctx = await this.locations.getContext(userId);

    const count = await this.prisma.milestone.count({
      where: { coupleId: ctx.coupleId, kind: PrismaMilestoneKind.CUSTOM },
    });
    if (count >= MAX_CUSTOM_MILESTONES) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Tối đa ${MAX_CUSTOM_MILESTONES} mốc tự thêm — xoá bớt mốc cũ trước nhé`,
      );
    }

    await this.prisma.milestone.create({
      data: {
        coupleId: ctx.coupleId,
        title: input.title,
        // Ngày trôi nổi: `new Date("2025-11-11")` được hiểu là 00:00 UTC, đúng
        // quy ước đang dùng cho sự kiện cả ngày (§6.3).
        date: new Date(`${input.date}T00:00:00.000Z`),
        kind: PrismaMilestoneKind.CUSTOM,
        emoji: input.emoji,
        yearly: input.yearly,
      },
    });

    return this.upcoming(userId);
  }

  async update(
    userId: string,
    milestoneId: string,
    input: CreateMilestoneInput,
  ): Promise<MilestoneItem[]> {
    const ctx = await this.locations.getContext(userId);
    const existing = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, coupleId: ctx.coupleId, kind: PrismaMilestoneKind.CUSTOM },
      select: { id: true },
    });
    if (!existing) throw this.notFound();

    await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title: input.title,
        date: new Date(`${input.date}T00:00:00.000Z`),
        emoji: input.emoji,
        yearly: input.yearly,
      },
    });

    return this.upcoming(userId);
  }

  async remove(userId: string, milestoneId: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);
    const existing = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, coupleId: ctx.coupleId, kind: PrismaMilestoneKind.CUSTOM },
      select: { id: true },
    });
    if (!existing) throw this.notFound();

    await this.prisma.milestone.delete({ where: { id: milestoneId } });
  }

  private notFound(): AppError {
    return AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mốc kỷ niệm này');
  }
}
