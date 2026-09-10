import { useEffect, useRef } from 'react';
import {
  MAP_RANGE_PRESETS,
  toDayInput,
  type MapRangeId,
  type MapRangeState,
  type ResolvedMapRange,
} from '@/lib/map-filter';

/**
 * Dải chip lọc thời gian cho ghim check-in trên bản đồ.
 *
 * Nằm ngay dưới thanh trạng thái, cuộn ngang được — ở khung 390px sáu chip
 * không xếp vừa một hàng, mà xuống hai hàng thì ăn mất một dải bản đồ.
 *
 * Chip "Chọn ngày" mở thêm một thẻ nhỏ có hai ô ngày. Thẻ đó chỉ hiện khi
 * người dùng đang thực sự ở chế độ tự chọn — không để nó chiếm chỗ thường trực.
 */
export default function MapTimeFilter({
  state,
  onChange,
  resolved,
  pinCount,
  loading,
}: {
  state: MapRangeState;
  onChange: (next: MapRangeState) => void;
  resolved: ResolvedMapRange;
  pinCount: number;
  loading: boolean;
}) {
  const custom = state.id === 'custom';
  const firstDateRef = useRef<HTMLInputElement | null>(null);

  // Vừa chuyển sang "Chọn ngày" mà chưa có ngày nào → điền sẵn hôm nay cho cả
  // hai ô. Người dùng chỉ phải sửa một đầu thay vì gõ từ con số không.
  useEffect(() => {
    if (!custom || state.customFrom || state.customTo) return;
    const today = toDayInput(Date.now());
    onChange({ ...state, customFrom: today, customTo: today });
  }, [custom, state, onChange]);

  function pick(id: MapRangeId) {
    onChange({ ...state, id });
    if (id === 'custom') {
      // Mở bàn phím / bảng chọn ngày ngay, đỡ một cú chạm.
      window.setTimeout(() => firstDateRef.current?.focus(), 60);
    }
  }

  return (
    <div className="pointer-events-auto mt-2">
      <div
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Lọc khoảnh khắc theo thời gian"
      >
        {MAP_RANGE_PRESETS.map((preset) => {
          const on = preset.id === state.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => pick(preset.id)}
              aria-pressed={on}
              className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-bold shadow-[0_2px_8px_rgba(35,19,32,0.12)] transition ${
                on ? 'bg-love-500 text-white' : 'bg-white/95 text-ink-700 backdrop-blur'
              }`}
            >
              {preset.id === 'custom' ? `📅 ${preset.label}` : preset.label}
            </button>
          );
        })}
      </div>

      {custom && (
        <div className="mt-1.5 rounded-2xl bg-white/95 p-2.5 shadow-[0_4px_16px_rgba(35,19,32,0.18)] backdrop-blur">
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                Từ ngày
              </span>
              <input
                ref={firstDateRef}
                type="date"
                value={state.customFrom}
                max={state.customTo || undefined}
                onChange={(e) => onChange({ ...state, customFrom: e.target.value })}
                className="h-11 w-full rounded-xl border-[1.5px] border-ink-200 bg-white px-2.5 text-[13px]"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                Đến ngày
              </span>
              <input
                type="date"
                value={state.customTo}
                min={state.customFrom || undefined}
                onChange={(e) => onChange({ ...state, customTo: e.target.value })}
                className="h-11 w-full rounded-xl border-[1.5px] border-ink-200 bg-white px-2.5 text-[13px]"
              />
            </label>
          </div>

          {resolved.error && (
            <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-love-600">
              {resolved.error}
            </p>
          )}
        </div>
      )}

      {/*
        Câu tóm tắt: người dùng phải biết bản đồ đang hiện BAO NHIÊU ghim trong
        khoảng nào — không có nó thì "không thấy ảnh nào" dễ bị hiểu là app hỏng
        chứ không phải là khoảng thời gian không có khoảnh khắc nào.
      */}
      {!resolved.error && (
        <p className="mt-1.5 inline-block rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-ink-500 shadow-sm">
          {loading
            ? 'Đang lọc khoảnh khắc...'
            : pinCount === 0
              ? `Không có khoảnh khắc nào · ${resolved.label}`
              : `${pinCount} khoảnh khắc · ${resolved.label}`}
        </p>
      )}
    </div>
  );
}
