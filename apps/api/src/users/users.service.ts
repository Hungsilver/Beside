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
import { StorageService } from '../common/storage/storage.service';
import { AppError } from '../common/errors/app-error';
import { avatarKey, ImageProcessor, type AvatarSize } from '../posts/image.processor';
import { toSelfUser } from './user.mapper';

export interface UpdateProfileData {
  displayName?: string;
  birthday?: Date | null;
  messagingApp?: MessagingApp;
  messagingHandle?: string | null;
  bio?: string | null;
  address?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageProcessor,
  ) {}

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
        // `null` là XOÁ, `undefined` là không đụng tới — phân biệt ngay ở đây,
        // nếu không thì gõ trắng rồi lưu sẽ không xoá được nội dung cũ.
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
      },
    });

    return toSelfUser(updated);
  }

  // ------------------------------------------------------ ảnh đại diện

  /**
   * Đặt ảnh đại diện mới.
   *
   * Thứ tự có chủ đích: **ghi tệp lên kho trước, cập nhật DB sau**. Nếu làm
   * ngược lại mà việc ghi kho hỏng giữa chừng, DB sẽ trỏ tới một ảnh không tồn
   * tại và người dùng thấy ô ảnh vỡ. Theo thứ tự này, hỏng ở bước ghi kho thì
   * DB chưa đổi — người dùng vẫn giữ ảnh cũ, chỉ là lần đổi này thất bại.
   *
   * Ảnh cũ được xoá SAU khi DB đã trỏ sang ảnh mới. Xoá hụt cũng không sao:
   * đó chỉ là vài chục KB nằm lại trong kho, không ai chạm tới được nữa.
   */
  async setAvatar(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<SelfUser> {
    const current = await this.getOrThrow(userId);
    const processed = await this.images.processAvatar(file);

    await Promise.all(
      processed.files.map((f) => this.storage.put(f.key, f.body, f.contentType)),
    );

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarId: processed.avatarId },
    });

    await this.deleteAvatarFiles(current.avatarId);
    return toSelfUser(updated);
  }

  /** Gỡ ảnh đại diện, quay về hiển thị chữ cái đầu của tên. */
  async removeAvatar(userId: string): Promise<SelfUser> {
    const current = await this.getOrThrow(userId);
    if (!current.avatarId) return toSelfUser(current);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarId: null },
    });

    await this.deleteAvatarFiles(current.avatarId);
    return toSelfUser(updated);
  }

  /**
   * Lấy tệp ảnh đại diện để truyền cho trình duyệt.
   *
   * Quyền kiểm tra ở ĐÂY (R3 — tầng service, không tin client): chỉ xem được
   * ảnh của chính mình hoặc của người cùng couple. Không dựa vào chuyện URL
   * khó đoán — id người dùng có thể lộ ra từ nhiều chỗ khác.
   *
   * Cố ý KHÔNG dùng `LocationsService.getContext`: hàm đó ném lỗi khi chưa ghép
   * đôi, mà người chưa ghép đôi vẫn phải xem được ảnh của chính mình.
   */
  async avatarStream(
    viewerId: string,
    ownerId: string,
    size: AvatarSize,
    /**
     * Phiên bản ảnh mà URL yêu cầu (`?v=`).
     *
     * Phải khớp với ảnh đang dùng, nếu không trả 404. Bỏ qua tham số này thì
     * một URL cũ sẽ phục vụ ảnh MỚI — mà header đang là `immutable`, nghĩa là
     * mình hứa "nội dung của URL này không bao giờ đổi". Hứa rồi đổi nội dung
     * là cách chắc chắn nhất để trình duyệt hiện ảnh sai và không ai gỡ được.
     */
    version?: string,
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, avatarId: true, coupleId: true },
    });

    if (!owner?.avatarId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Người này chưa đặt ảnh đại diện');
    }
    if (version !== undefined && version !== owner.avatarId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Ảnh đại diện này không còn nữa');
    }

    if (owner.id !== viewerId) {
      const viewer = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { coupleId: true },
      });
      // `null === null` phải bị coi là KHÔNG cùng couple: hai người đều chưa
      // ghép đôi thì không có quan hệ gì với nhau cả.
      if (!viewer?.coupleId || viewer.coupleId !== owner.coupleId) {
        throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Người này chưa đặt ảnh đại diện');
      }
    }

    const file = await this.storage.getStream(avatarKey(owner.avatarId, size));
    if (!file) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Người này chưa đặt ảnh đại diện');
    }
    return file;
  }

  /** Xoá tệp của một ảnh đại diện cũ. Hỏng thì bỏ qua — không chặn luồng chính. */
  private async deleteAvatarFiles(avatarId: string | null): Promise<void> {
    if (!avatarId) return;
    try {
      await this.storage.deleteMany([avatarKey(avatarId, 'md'), avatarKey(avatarId, 'thumb')]);
    } catch {
      // Rác trong kho không đáng để người dùng thấy lỗi.
    }
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
