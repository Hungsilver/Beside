import { lazy, Suspense, useState } from 'react';
import type { LatLng, PlaceResponse } from '@beside/shared';
import { Spinner } from '@/components/ui';

// MapLibre gần 1MB — chỉ tải khi người dùng thật sự mở phần chọn trên bản đồ.
const CoupleMap = lazy(() => import('@/components/CoupleMap'));

/**
 * Chọn toạ độ cho một địa điểm bằng cách chạm lên bản đồ.
 *
 * Trước đó chỉ lưu được "chỗ tôi đang đứng" — không đặt được hàng rào cho nhà
 * người yêu khi đang ngồi ở quán. Đây là mục ưu tiên Cao trong BACKLOG.
 *
 * Cách làm: bấm để đặt ghim, xem trước ngay vòng hàng rào bán kính mặc định,
 * bấm lại để đổi chỗ, rồi mới xác nhận. Không xác nhận thì không lưu gì cả.
 */
export default function PlacePicker({
  places,
  onPick,
  onCancel,
}: {
  /** Các địa điểm đã có — vẽ mờ để không đặt trùng chỗ. */
  places: PlaceResponse[];
  onPick: (point: LatLng) => void;
  onCancel: () => void;
}) {
  const [point, setPoint] = useState<LatLng | null>(null);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 min-w-11 text-left text-[14px] font-semibold text-ink-500"
        >
          Huỷ
        </button>
        <b className="text-[15px]">Chạm để chọn chỗ</b>
        <button
          type="button"
          disabled={!point}
          onClick={() => point && onPick(point)}
          className="min-h-11 rounded-full bg-love-500 px-4 text-[14px] font-bold text-white disabled:opacity-40"
        >
          Chọn
        </button>
      </header>

      <div className="relative flex-1">
        <Suspense fallback={<Spinner label="Đang mở bản đồ..." />}>
          <CoupleMap
            markers={
              point
                ? [
                    {
                      id: 'draft',
                      label: 'Chỗ mới',
                      point,
                      accuracyM: 0,
                      showAccuracy: false,
                      color: 'rose',
                    },
                  ]
                : []
            }
            // Vẽ sẵn vòng hàng rào của chỗ đang chọn để thấy nó rộng cỡ nào.
            places={[
              ...places.map((p) => ({
                id: p.id,
                name: p.name,
                emoji: p.emoji,
                point: { lat: p.lat, lng: p.lng },
                radiusM: p.radiusM,
                active: false,
              })),
              ...(point
                ? [
                    {
                      id: 'draft',
                      name: 'Chỗ mới',
                      emoji: '📍',
                      point,
                      radiusM: 150,
                      active: true,
                    },
                  ]
                : []),
            ]}
            onPickPoint={setPoint}
          />
        </Suspense>
      </div>

      <p className="border-t border-black/[0.06] px-5 py-3 text-center text-[12.5px] leading-relaxed text-ink-500">
        {point ? (
          <>
            Đã đặt ghim tại{' '}
            <b className="tabular-nums">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </b>
            <br />
            Chạm chỗ khác để đổi, hoặc bấm <b>Chọn</b> để đặt tên.
          </>
        ) : (
          'Chạm lên bản đồ để đặt ghim. Bán kính chỉnh được ở bước sau.'
        )}
      </p>
    </div>
  );
}
