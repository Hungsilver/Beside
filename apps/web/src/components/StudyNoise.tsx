import { NOISE_PRESETS, type NoiseControls } from '@/lib/use-noise';

/**
 * Tiếng ồn nền — ba preset tổng hợp bằng Web Audio, không tải tệp nào.
 *
 * Ẩn hẳn khi trình duyệt không có Web Audio: một nút bấm vào không kêu gì còn
 * tệ hơn là không có nút.
 */
export default function StudyNoise({ noise }: { noise: NoiseControls }) {
  if (!noise.supported) return null;

  return (
    <section className="card mt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Tiếng nền
        </p>
        {noise.playing !== null && (
          <button
            type="button"
            onClick={noise.stop}
            className="-mr-1 h-9 rounded-full px-3 text-[12.5px] font-bold text-love-600"
          >
            Tắt tiếng
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        {NOISE_PRESETS.map((p) => {
          const on = noise.playing === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => noise.toggle(p.id)}
              className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold transition ${
                on
                  ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300'
                  : 'bg-ink-100 text-ink-600'
              }`}
            >
              <span aria-hidden className="text-[16px]">
                {p.emoji}
              </span>
              {p.label}
            </button>
          );
        })}
      </div>

      {noise.playing !== null && (
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden className="text-[14px]">
            🔈
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(noise.volume * 100)}
            onChange={(e) => noise.setVolume(Number(e.target.value) / 100)}
            aria-label="Âm lượng tiếng nền"
            className="h-11 min-w-0 flex-1 accent-love-500"
          />
          <span className="w-[34px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-400">
            {Math.round(noise.volume * 100)}%
          </span>
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
        Tiếng chỉ kêu khi app đang mở trên màn hình — khoá máy là trình duyệt tắt nó đi.
        Đồng hồ thì vẫn chạy tiếp.
      </p>
    </section>
  );
}
