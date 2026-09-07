import { Injectable } from '@nestjs/common';
import type { MessagingApp as PrismaMessagingApp } from '@prisma/client';
import {
  buildMessagingUrl,
  ERROR_CODES,
  MESSAGING_APP_LABELS,
  parsePrivacy,
  ymdInTimeZone,
  type MessagingApp,
  type Privacy,
  type SelfUser,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { toSelfUser } from './user.mapper';

export interface UpdateProfileData {
  displayName?: string;
  birthday?: Date | null;
  messagingApp?: MessagingApp;
  messagingHandle?: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string): Promise<SelfUser> {
    return toSelfUser(await this.getOrThrow(userId));
  }

  /**
   * Cập nhật cài đặt riêng tư (F8).
   *
   * Ghi nhận từng phần: người dùng gạt một công tắc thì chỉ gửi công tắc đó,
   * các giá trị còn lại giữ nguyên. Có hiệu lực NGAY ở lần gửi vị trí kế tiếp
   * vì LocationsService đọc lại quyền riêng tư mỗi lần, không cache.
   */
  async updatePrivacy(userId: string, patch: Partial<Privacy>): Promise<SelfUser> {
    const current = await this.getOrThrow(userId);
    const merged: Privacy = { ...parsePrivacy(current.privacy), ...patch };

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { privacy: merged },
    });
    return toSelfUser(updated);
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<SelfUser> {
    const current = await this.getOrThrow(userId);

    // Người dùng có thể chỉ đổi app HOẶC chỉ đổi số — phải trộn với giá trị đang
    // lưu rồi mới kiểm tra được cặp (app, handle) có hợp lệ với nhau không.
    const nextApp = data.messagingApp ?? (current.messagingApp as MessagingApp);
    const nextHandle =
      data.messagingHandle !== undefined
        ? data.messagingHandle
        : current.messagingHandle;

    if (nextHandle !== null && buildMessagingUrl({ app: nextApp, handle: nextHandle }) === null) {
      throw AppError.validation({
        messagingHandle: [this.handleHint(nextApp)],
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.birthday !== undefined
          ? { birthday: data.birthday ? this.toDateOnlyUtc(data.birthday) : null }
          : {}),
        ...(data.messagingApp !== undefined
          ? { messagingApp: data.messagingApp as PrismaMessagingApp }
          : {}),
        ...(data.messagingHandle !== undefined
          ? { messagingHandle: data.messagingHandle }
          : {}),
      },
    });

    return toSelfUser(updated);
  }

  // ------------------------------------------------------------------

  /** Câu gợi ý cụ thể theo từng app, thay vì "dữ liệu không hợp lệ" chung chung. */
  private handleHint(app: MessagingApp): string {
    switch (app) {
      case 'MESSENGER':
        return `${MESSAGING_APP_LABELS[app]}: nhập username Facebook — bắt đầu bằng chữ cái, 5–50 ký tự (chữ, số, dấu chấm). Đây KHÔNG phải số điện thoại.`;
      default:
        return `${MESSAGING_APP_LABELS[app]}: nhập số điện thoại Việt Nam, ví dụ 0912345678`;
    }
  }

  /** Cột `birthday` là DATE — chuẩn hoá theo ngày lịch giờ VN để không lệch một ngày. */
  private toDateOnlyUtc(date: Date): Date {
    const { year, month, day } = ymdInTimeZone(date);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private async getOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.unauthorized(
        ERROR_CODES.UNAUTHENTICATED,
        'Tài khoản không còn tồn tại',
      );
    }
    return user;
  }
}
