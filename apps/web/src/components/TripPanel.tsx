import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRemaining, type TripResponse } from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { usePlaces } from '@/lib/places-api';
import { useArriveTrip, useCancelTrip, useStartTrip } from '@/lib/trips-api';

/**
 * F13 — "Đang trên đường về".
 *
 * Hai mặt của cùng một chuyến:
 *   • `TripCard` — nằm trong bảng thông tin ở đáy màn Bản đồ. Của mình thì có
 *     nút kết thúc; của người ấy thì chỉ đọc.
 *   • `TripStartSheet` — chọn điểm đến từ Địa điểm quen rồi bắt đầu.
 *
 * Giờ dự kiến do server tính (từ điểm vị trí mới nhất), client chỉ hiển thị.
 * Tính lại ở client sẽ cho hai máy hai con số khác nhau cho cùng một chuyến.
 */

export function TripCard({
  trip,
  mine,
  onEnded,
}: {
  trip: TripResponse;
  mine: boolean;
  onEnded?: () => void;
}) {
  const arrive = useArriveTrip();
  const cancel = useCancelTrip();
  const [error, setError] = useState<string | null>(null);

  const busy = arrive.isPending || cancel.isPending;
  const remaining = remainingMsOf(trip);

  async function end(action: 'arrive' | 'cancel') {
    setError(null);
    try {
      if (action === 'arrive') await arrive.mutateAsync(trip.id);
      else await cancel.mutateAsync(trip.id);
      onEnded?.();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không kết thúc được chuyến');
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-plum-100/70 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[18px]">
          🚗
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[14px]">
            {mine ? 'Bạn đang về' : `${trip.userName} đang về`} {trip.placeEmoji}{' '}
            {trip.placeName}
          </b>
          <p className="mt-0.5 text-[12px] text-ink-500">
            {formatRemaining(remaining)}
            {trip.remainingM !== null && ` · ${formatDistance(trip.remainingM)}`}
          </p>
        </div>
      </div>

      {mine && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void end('cancel')}
            className="min-h-11 flex-1 rounded-full bg-white text-[13px] font-bold text-ink-500 disabled:opacity-50"
          >
            Huỷ chuyến
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void end('arrive')}
            className="min-h-11 flex-[1.4] rounded-full bg-love-500 text-[13.5px] font-bold text-white disabled:opacity-50"
          >
            {arrive.isPending ? 'Đang gửi...' : '✓ Đã tới nơi'}
          </button>
        </div>
      )}

      {!mine && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
          Sẽ tự báo khi {trip.userName} tới nơi — không cần ngồi canh màn hình.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Chọn điểm đến rồi bắt đầu chuyến. */
export function TripStartSheet({ onClose }: { onClose: () => void }) {
  const placesQuery = usePlaces();
  const start = useStartTrip();
  const [error, setError] = useState<string | null>(null);

  const places = placesQuery.data ?? [];

  async function go(placeId: string) {
    setError(null);
    try {
      await start.mutateAsync(placeId);
      onClose();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không bắt đầu được chuyến');
    }
  }

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
        aria-label="Chọn điểm đến"
        className="relative mx-auto flex max-h-[80dvh] w-full max-w-[430px] flex-col rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(35,19,32,0.18)]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-3">
          <b className="text-[15px]">Bạn đang về đâu?</b>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-11 items-center justify-center text-[15px] font-semibold text-ink-500"
          >
            Xong
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
          {placesQuery.isLoading ? (
            <p className="py-8 text-center text-[13px] text-ink-400">Đang tải địa điểm...</p>
          ) : places.length === 0 ? (
            /*
              Không có địa điểm nào thì không có chuyến nào cả: điểm đến BẮT BUỘC
              là một địa điểm đã lưu, vì chính hàng rào ảo của nó là thứ tự phát
              hiện "đã tới nơi".
            */
            <div className="py-8 text-center">
              <p className="text-[13px] leading-relaxed text-ink-500">
                Chưa có địa điểm nào được lưu.
                <br />
                Lưu &ldquo;Nhà&rdquo; hoặc &ldquo;Công ty&rdquo; trước đã nhé.
              </p>
              <Link to="/dia-diem" className="btn-primary mt-4 inline-flex">
                Thêm địa điểm
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {places.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => void go(place.id)}
                    className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink-200 px-4 py-3 text-left disabled:opacity-50"
                  >
                    <span className="text-[22px]" aria-hidden>
                      {place.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px]">{place.name}</b>
                      <span className="mt-0.5 block text-[11.5px] text-ink-400">
                        Bán kính {place.radiusM}m
                      </span>
                    </span>
                    <span className="text-[16px] text-ink-300" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] font-semibold text-love-600">
              {error}
            </p>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
            Người ấy sẽ nhận một thông báo lúc bạn bắt đầu và lúc bạn tới nơi. Ở
            giữa, họ xem được bạn trên bản đồ nếu muốn.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Giờ dự kiến server gửi về, quy ra "còn bao nhiêu mili-giây tính từ bây giờ". */
function remainingMsOf(trip: TripResponse): number | null {
  if (!trip.etaAt) return null;
  const ms = Date.parse(trip.etaAt) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
