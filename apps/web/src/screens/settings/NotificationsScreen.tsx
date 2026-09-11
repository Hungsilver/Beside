import { usePush } from '@/lib/push-api';
import { FormError } from '@/components/ui';
import { GroupNote, SettingsGroup, SettingsToggle, SubScreen } from './SettingsKit';

/**
 * Thông báo đẩy (F7).
 *
 * Ba thứ phải cùng đúng mới nhận được thông báo: trình duyệt có hỗ trợ · người
 * dùng đã cho phép · máy chủ có khoá VAPID. Người dùng hay nhầm giữa chúng,
 * nên mỗi trạng thái phải nói rõ đang thiếu cái nào và làm gì tiếp theo.
 */
const COPY: Record<string, { desc: string; hint?: string }> = {
  checking: { desc: 'Đang kiểm tra...' },
  unsupported: {
    desc: 'Trình duyệt này không hỗ trợ thông báo đẩy.',
    hint: 'Thử mở bằng Chrome hoặc Safari bản mới.',
  },
  'need-install': {
    desc: 'iPhone cần cài app vào màn hình chính trước.',
    hint: 'Safari → nút Chia sẻ → "Thêm vào màn hình chính", rồi mở Beside từ biểu tượng đó.',
  },
  'server-off': {
    desc: 'Máy chủ chưa bật thông báo đẩy (thiếu khoá VAPID).',
    hint: 'Đây là việc của người quản trị máy chủ, không phải của bạn.',
  },
  denied: {
    desc: 'Bạn đã chặn thông báo cho trang này.',
    hint: 'Mở lại trong phần cài đặt trang web của trình duyệt, rồi tải lại Beside.',
  },
  off: { desc: 'Nhắc trước mỗi cuộc hẹn, và báo khi người ấy tới nơi.' },
  on: { desc: 'Đang bật trên thiết bị này.' },
};

export default function NotificationsScreen() {
  const push = usePush();
  const copy = COPY[push.state] ?? COPY.checking!;
  const canToggle = push.state === 'on' || push.state === 'off';

  return (
    <SubScreen title="Thông báo" subtitle="Cài riêng cho từng thiết bị">
      <FormError message={push.error} />

      <SettingsGroup>
        <SettingsToggle
          icon="📣"
          tone="mint"
          title="Thông báo đẩy"
          desc={copy.desc}
          on={push.state === 'on'}
          pending={push.busy || !canToggle}
          onChange={(v) => void (v ? push.enable() : push.disable())}
        />
      </SettingsGroup>

      {copy.hint && <GroupNote>{copy.hint}</GroupNote>}

      {push.state === 'on' && (
        <button
          type="button"
          disabled={push.busy}
          onClick={() => void push.sendTest()}
          className="btn-ghost mt-4 w-full"
        >
          Gửi thử một thông báo
        </button>
      )}

      <div className="card mt-4">
        <h2 className="text-[14px] font-bold">Bạn sẽ được báo khi</h2>
        <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-500">
          <li>💌 Người ấy vừa đăng một khoảnh khắc mới</li>
          <li>📍 Người ấy tới hoặc rời một địa điểm quen</li>
          <li>📅 Sắp tới giờ một cuộc hẹn chung</li>
          <li>💞 Sắp tới một mốc kỷ niệm</li>
          <li>⏳ Hết một chặng học trong phòng học chung</li>
        </ul>
      </div>

      <GroupNote>
        Thông báo được bật/tắt riêng cho MỖI thiết bị. Bật trên điện thoại không
        có nghĩa là máy tính cũng nhận được.
      </GroupNote>
    </SubScreen>
  );
}
