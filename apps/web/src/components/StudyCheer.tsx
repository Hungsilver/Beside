import { useEffect, useState } from 'react';
import { STUDY_CHEERS, type StudyCheerCode, type StudyCheerEvent } from '@beside/shared';

/**
 * Cổ vũ thời gian thực giữa hai người đang học.
 *
 * Bốn mã cố định, không phải ô nhập chữ: app đã chốt không có chat trong app
 * (§7.3), và một khung chat hiện ra giữa lúc đang học thì phá đúng thứ phòng
 * học phục vụ. Bốn cái chạm là đủ nói "tớ vẫn ở đây".
 *
 * Không có thông báo đẩy. Cổ vũ chỉ có nghĩa khi người kia đang ngồi đó và
 * đang mở app — rung máy của người đã cất điện thoại đi học là làm phiền.
 */
export default function StudyCheerBar({
  onSend,
  disabled,
}: {
  /** Trả `false` khi bị chặn vì bấm quá nhanh hoặc socket đang rớt. */
  onSend: (code: StudyCheerCode) => boolean;
  disabled: boolean;
}) {
  const [sent, setSent] = useState<StudyCheerCode | null>(null);

  useEffect(() => {
    if (sent === null) return;
    const id = window.setTimeout(() => setSent(null), 2000);
    return () => window.clearTimeout(id);
  }, [sent]);

  return (
    <div className="mt-4">
      <p className="text-[11.5px] font-semibold opacity-80">Gửi cho người ấy</p>
      <div className="mt-2 flex gap-2">
        {STUDY_CHEERS.map((c) => (
          <button
            key={c.code}
            type="button"
            disabled={disabled || sent !== null}
            onClick={() => {
              if (onSend(c.code)) setSent(c.code);
            }}
            aria-label={c.label}
            className={`flex h-11 flex-1 items-center justify-center rounded-2xl text-[18px] transition disabled:opacity-40 ${
              sent === c.code ? 'bg-white' : 'bg-white/25'
            }`}
          >
            {c.emoji}
          </button>
        ))}
      </div>
      <p className="mt-1.5 h-4 text-[11px] opacity-75">
        {disabled
          ? 'Mất kết nối — thử lại khi có sóng'
          : sent !== null
            ? 'Đã gửi rồi đó 💫'
            : ''}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Hình cổ vũ nổi lên giữa màn hình khi nhận được.
 *
 * Đặt `fixed` + `pointer-events-none`: nó nổi trên mọi thứ nhưng không nuốt cú
 * chạm nào — người đang học bấm nút giữa lúc hình bay lên vẫn phải trúng.
 */
export function CheerToast({ cheer }: { cheer: StudyCheerEvent | null }) {
  if (!cheer) return null;
  const preset = STUDY_CHEERS.find((c) => c.code === cheer.code);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+72px)] z-50 flex justify-center px-4"
    >
      {/* `key` bám theo mốc thời gian để hai lời cổ vũ liên tiếp chạy lại hiệu
          ứng từ đầu, thay vì đứng im vì React thấy cùng một node. */}
      <div
        key={cheer.at}
        className="tl-pop flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[0_10px_30px_rgba(35,19,32,0.22)]"
      >
        <span aria-hidden className="text-[22px]">
          {preset?.emoji ?? '💫'}
        </span>
        <span className="text-[13.5px] font-bold">
          {cheer.fromName}: {preset?.label ?? 'Cố lên!'}
        </span>
      </div>
    </div>
  );
}
