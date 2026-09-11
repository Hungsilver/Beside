import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { useUpdatePrivacy } from '@/lib/profile-api';
import { FormError, Spinner } from '@/components/ui';
import { GroupNote, SettingsGroup, SettingsToggle, SubScreen } from './SettingsKit';

/**
 * Quyền riêng tư (F8).
 *
 * Không có nút Lưu: mỗi công tắc gửi đi ngay. Đây là những thứ người dùng bật
 * lúc đang cần ẩn NGAY — bắt bấm thêm nút Lưu là một khoảng thời gian họ tưởng
 * mình đã ẩn mà thực ra chưa.
 *
 * Cài đặt có hiệu lực từ điểm vị trí KẾ TIẾP: server đọc lại quyền riêng tư
 * mỗi lần nhận, không cache (ARCHITECTURE.md §6.2).
 */
export default function PrivacyScreen() {
  const { user, patchUser } = useAuth();
  const updatePrivacy = useUpdatePrivacy(patchUser);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Spinner />;

  const privacy = user.privacy;

  async function toggle(patch: Parameters<typeof updatePrivacy.mutateAsync>[0]) {
    setError(null);
    try {
      await updatePrivacy.mutateAsync(patch);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
    }
  }

  return (
    <SubScreen title="Quyền riêng tư" subtitle="Áp dụng ngay, không cần bấm Lưu">
      <FormError message={error} />

      {/* Trạng thái đang có, nói bằng một câu — để không phải tự ghép ba công tắc
          trong đầu mới biết người ấy đang thấy gì. */}
      <div
        className={`rounded-[var(--radius-card)] px-4 py-3.5 text-[12.5px] font-semibold leading-relaxed ${
          privacy.ghostMode
            ? 'bg-ink-900 text-white'
            : privacy.fuzzRadiusM > 0
              ? 'bg-plum-100 text-[#4A2540]'
              : 'bg-mint-100 text-[#03372A]'
        }`}
      >
        {privacy.ghostMode
          ? '👻 Đang ẩn danh — người ấy không thấy vị trí mới của bạn, và app cũng không lưu lại gì cả.'
          : privacy.fuzzRadiusM > 0
            ? '🎯 Người ấy chỉ thấy bạn trong khoảng 500m, không thấy chỗ đứng chính xác.'
            : privacy.shareLive
              ? '📡 Bình thường — người ấy thấy vị trí của bạn khi bạn đang mở app.'
              : '💤 Đã tắt chia sẻ trực tiếp — người ấy chỉ thấy vị trí lần cuối bạn mở app.'}
      </div>

      <div className="mt-4">
        <SettingsGroup>
          <SettingsToggle
            icon="👻"
            tone="ink"
            title="Chế độ ẩn danh"
            desc="Tạm ẩn hoàn toàn. Server sẽ KHÔNG ghi lại và KHÔNG gửi vị trí của bạn đi."
            on={privacy.ghostMode}
            pending={updatePrivacy.isPending}
            onChange={(v) => void toggle({ ghostMode: v })}
          />
          <SettingsToggle
            icon="📡"
            tone="love"
            title="Chia sẻ vị trí trực tiếp"
            desc="Tắt thì người ấy chỉ thấy vị trí lần cuối bạn mở app."
            on={privacy.shareLive}
            // Đang ẩn danh thì công tắc này vô nghĩa — khoá lại thay vì để người
            // dùng bật lên rồi tưởng mình đang chia sẻ.
            pending={updatePrivacy.isPending || privacy.ghostMode}
            onChange={(v) => void toggle({ shareLive: v })}
          />
          <SettingsToggle
            icon="🎯"
            tone="plum"
            title="Làm mờ vị trí"
            desc="Người ấy chỉ thấy bạn trong bán kính 500m thay vì chính xác."
            on={privacy.fuzzRadiusM > 0}
            pending={updatePrivacy.isPending}
            onChange={(v) => void toggle({ fuzzRadiusM: v ? 500 : 0 })}
          />
        </SettingsGroup>
      </div>

      <GroupNote>
        Ẩn danh cũng dừng ghim toạ độ vào khoảnh khắc mới. Lịch sử vị trí cũ vẫn
        còn — app tự xoá theo hạn lưu trữ.
      </GroupNote>

      <div className="card mt-4">
        <h2 className="text-[14px] font-bold">Beside giữ gì về vị trí của bạn</h2>
        <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-500">
          <li>📍 Chỉ người trong couple của bạn đọc được — kiểm tra ở phía máy chủ</li>
          <li>🧹 Lịch sử vị trí tự xoá sau hạn lưu trữ</li>
          <li>🖼️ Ảnh check-in bị xoá sạch EXIF (kể cả toạ độ GPS) trước khi lưu</li>
          <li>🙈 Nhật ký máy chủ không ghi toạ độ chính xác của ai</li>
        </ul>
      </div>
    </SubScreen>
  );
}
