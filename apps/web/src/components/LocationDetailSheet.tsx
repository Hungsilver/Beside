import { useEffect } from 'react';
import { DISPLAY_TIMEZONE, type PartnerLocationEvent } from '@beside/shared';
import Avatar from '@/components/Avatar';
import CoordinateCard from '@/components/CoordinateCard';

/**
 * Chi tiết vị trí của người ấy — mở ra khi chạm vào chấm vị trí trên bản đồ.
 *
 * Cùng mục đích với `PostDetailSheet`: thứ người dùng cần ngay lúc nhìn thấy
 * chấm đó là "chính xác chỗ nào" và "đi tới đó thế nào", mà bản đồ trong app
 * thì không chỉ đường được (ARCHITECTURE.md §3.2 — MapLibre + OpenFreeMap,
 * không có dữ liệu dẫn đường). Nên ở đây đưa thẳng toạ độ và một nút sang
 * Google Maps.
 *
 * ⚠️ Vị trí có thể đã bị LÀM MỜ theo cài đặt riêng tư của người gửi (F8).
 * Lúc đó phải nói rõ, nếu không người xem sẽ tin vào một toạ độ lệch tới vài
 * trăm mét và tưởng người kia đang đứng đúng chỗ đó.
 */
export default function LocationDetailSheet({
  point,
  name,
  avatarUrl,
  distanceM,
  isLive,
  onClose,
}: {
  point: PartnerLocationEvent;
  name: string;
  avatarUrl: string | null;
  /** Khoảng cách tới mình, `null` khi chưa biết vị trí của mình. */
  distanceM: number | null;
  isLive: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết vị trí"
        className="relative mx-auto flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(35,19,32,0.18)]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-3">
          <b className="text-[15px]">Vị trí của {name}</b>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-11 items-center justify-center text-[15px] font-semibold text-ink-500"
          >
            Xong
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3.5">
          <div className="flex items-center gap-3">
            <Avatar
              url={avatarUrl}
              name={name}
              size={44}
              fallbackClassName="bg-gradient-to-br from-[#9BC4FF] to-[#6A7BFF] text-white"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="truncate text-[15px]">{name}</b>
                {isLive && (
                  <span className="flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-[#03372A]">
                    <i className="size-1.5 animate-pulse rounded-full bg-[#03A47B]" />
                    Trực tiếp
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-ink-400">
                Lúc {formatClock(point.ts)} · {formatWhenShort(point.ts)}
              </p>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <Stat
              label="Khoảng cách"
              value={distanceM === null ? '—' : formatDistance(distanceM)}
            />
            <Stat label="Sai số" value={`${Math.round(point.accuracyM)} m`} />
            <Stat
              label={point.speedMps !== null ? 'Tốc độ' : 'Pin'}
              value={
                point.speedMps !== null
                  ? `${Math.round(point.speedMps * 3.6)} km/h`
                  : point.battery !== null
                    ? `${point.battery}%`
                    : '—'
              }
            />
          </div>

          <div className="mt-3.5">
            <CoordinateCard
              point={{ lat: point.lat, lng: point.lng }}
              title={`Vị trí lúc ${formatClock(point.ts)}`}
              note={
                point.fuzzed
                  ? `${name} đang bật làm mờ vị trí — toạ độ này chỉ là khu vực gần đúng, không phải chỗ đứng chính xác.`
                  : null
              }
            />
          </div>

          <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-ink-400">
            Chỉ đường mở bằng Google Maps ở ứng dụng ngoài — bản đồ trong app không
            dẫn đường được.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-love-50 px-2 py-2.5 text-center">
      <p className="text-[11px] text-ink-400">{label}</p>
      <b className="mt-0.5 block text-[14.5px]">{value}</b>
    </div>
  );
}

/** Giờ:phút theo giờ Việt Nam (R2: DB lưu UTC, hiển thị theo Asia/Ho_Chi_Minh). */
function formatClock(ts: number): string {
  if (!Number.isFinite(ts)) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatWhenShort(ts: number, now: number = Date.now()): string {
  const min = Math.round((now - ts) / 60_000);
  // Lệch đồng hồ giữa máy và server cho ra số âm — "-2 phút trước" là vô nghĩa.
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
