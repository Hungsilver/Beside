import { useEffect, useRef } from 'react';
import { CLOCK_THEMES } from '@/lib/clock-themes';
import {
  NIGHT_FROM_HOUR,
  NIGHT_TO_HOUR,
  type ClockPrefs,
} from '@/lib/clock-prefs';
import type { NoiseControls } from '@/lib/use-noise';
import { NOISE_PRESETS } from '@/lib/use-noise';
import { Slider, Switch } from './ClockBits';

/**
 * Bảng cài đặt trượt lên từ đáy.
 *
 * Mọi thứ KHÔNG phải mặt đồng hồ đều nằm ở đây, kể cả những công tắc trước đây
 * bày thành chip dưới đáy màn (`Giây`, `12 giờ`). Đó là điểm chính của bản này:
 * màn hình chỉ còn mặt số + một hàng tab, còn cài đặt thì mở ra khi cần và đóng
 * lại ngay.
 *
 * Nền mờ phía sau BẮT CHẠM để đóng — người ta mở bảng ra xem rồi muốn quay lại
 * nhìn đồng hồ, và không ai muốn phải ngắm trúng một nút ✕ nhỏ.
 */
export default function ClockSheet({
  prefs,
  setPrefs,
  brightness,
  setBrightness,
  noise,
  onClose,
}: {
  prefs: ClockPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<ClockPrefs>>;
  brightness: number;
  setBrightness: (v: number) => void;
  noise: NoiseControls;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc đóng bảng chứ không thoát hẳn đồng hồ. Không cần chặn lan truyền:
  // `ClockScreen` tự gỡ listener Esc của nó khi bảng này đang mở.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Đưa tiêu điểm vào bảng để bàn phím ngoài lăn được ngay, không phải Tab qua
  // hết mấy nút phía sau.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng cài đặt"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Cài đặt đồng hồ"
        aria-modal="true"
        tabIndex={-1}
        className="tl-pop relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-[color:var(--clk-bg)] px-4 pb-4 pt-2 text-[color:var(--clk-fg)] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] outline-none"
        // Tai thỏ / thanh chỉ dẫn dưới đáy: bảng dán vào mép dưới nên phải tự
        // chừa chỗ, nếu không hàng công tắc cuối nằm ngay dưới thanh gạt của iOS.
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/* Tay nắm — dấu hiệu quen mắt rằng đây là một bảng kéo lên được. */}
        <div className="flex justify-center py-2">
          <i aria-hidden className="block h-1 w-10 rounded-full bg-[color:var(--clk-chip)]" />
        </div>

        {/*
          Nút "Xong" tường minh, giống mọi bảng khác trong app (`CommentSheet`,
          `PostDetailSheet`). Nền mờ phía sau cũng đóng được, nhưng bảng này cao
          tới 82% màn hình nên dải mờ còn chạm được chỉ là một vệt hẹp trên đỉnh
          — không đủ để làm đường ra duy nhất.
        */}
        <div className="flex items-center justify-between pb-1">
          <b className="text-[15px]">Cài đặt đồng hồ</b>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 items-center justify-center px-2 text-[15px] font-semibold text-[color:var(--clk-soft)]"
          >
            Xong
          </button>
        </div>

        <Section title="Màn hình">
          <Slider icon="🔅" label="Độ sáng" value={brightness} onChange={setBrightness} />
          <Switch
            label="🔢 Hiện giây"
            on={prefs.showSeconds}
            onClick={() => setPrefs((p) => ({ ...p, showSeconds: !p.showSeconds }))}
          />
          <Switch
            label="🕛 Đồng hồ 12 giờ"
            on={prefs.hour12}
            onClick={() => setPrefs((p) => ({ ...p, hour12: !p.hour12 }))}
          />
          <Switch
            label="📅 Hiện ngày & thứ"
            on={prefs.showDate}
            onClick={() => setPrefs((p) => ({ ...p, showDate: !p.showDate }))}
          />
          <Switch
            label="🔋 Hiện mức pin"
            hint="Chrome trên Android có; Safari và Firefox không trả lời — lúc đó phần này tự ẩn."
            on={prefs.showBattery}
            onClick={() => setPrefs((p) => ({ ...p, showBattery: !p.showBattery }))}
          />
        </Section>

        <Section title="Chủ đề">
          <div className="flex gap-2">
            {CLOCK_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-label={`Chủ đề ${t.label}`}
                aria-pressed={prefs.themeId === t.id}
                onClick={() => setPrefs((p) => ({ ...p, themeId: t.id }))}
                className={`h-11 flex-1 overflow-hidden rounded-xl text-[11.5px] font-bold ring-offset-2 transition ${
                  prefs.themeId === t.id ? 'ring-2 ring-[color:var(--clk-fg)]' : ''
                }`}
                style={{
                  background: `linear-gradient(${t.top} 0 50%, ${t.bottom} 50% 100%)`,
                  color: t.ink,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Âm thanh">
          <Slider
            icon="🔊"
            label="Âm lượng tiếng nền"
            value={noise.volume}
            onChange={noise.setVolume}
          />
          {noise.supported ? (
            <div className="flex gap-2">
              {NOISE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={noise.playing === p.id}
                  onClick={() => noise.toggle(p.id)}
                  // Nhãn ở đây dài hơn nút tròn thường (`Ồn trắng`), nên chữ nhỏ
                  // hơn và `whitespace-nowrap` — xuống dòng thì chữ tràn khỏi
                  // nút cao 44px.
                  className={`h-11 flex-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-bold transition ${
                    noise.playing === p.id
                      ? 'bg-[color:var(--clk-on-bg)] text-[color:var(--clk-on-fg)]'
                      : 'bg-[color:var(--clk-chip)] text-[color:var(--clk-soft)]'
                  }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
              Trình duyệt này không có Web Audio nên không phát được tiếng nền.
            </p>
          )}
          <Switch
            label="🔈 Tiếng lật"
            on={prefs.tickSound}
            onClick={() => setPrefs((p) => ({ ...p, tickSound: !p.tickSound }))}
          />
          <p className="text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
            Tiếng nền tắt khi khoá màn hình — trình duyệt treo bộ trộn âm thanh lúc app
            bị ẩn. Đồng hồ thì vẫn chạy tiếp.
          </p>
        </Section>

        <Section title="Để máy lâu trên bàn">
          <Switch
            label="💡 Giữ màn hình sáng"
            on={prefs.keepAwake}
            onClick={() => setPrefs((p) => ({ ...p, keepAwake: !p.keepAwake }))}
          />
          <Switch
            label="🌙 Tự tối ban đêm"
            on={prefs.autoNight}
            onClick={() => setPrefs((p) => ({ ...p, autoNight: !p.autoNight }))}
          />
          <Switch
            label="🛡 Chống lưu ảnh"
            on={prefs.antiBurnIn}
            onClick={() => setPrefs((p) => ({ ...p, antiBurnIn: !p.antiBurnIn }))}
          />
          <p className="text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
            Chế độ đêm tự làm tối từ {NIGHT_FROM_HOUR}h tới {NIGHT_TO_HOUR}h — nó chỉ đặt
            sàn, kéo sáng lên lúc nào cũng được. Chống lưu ảnh dịch đồng hồ vài pixel mỗi
            phút để màn OLED không in vệt chữ số. "Độ sáng" là một lớp phủ đen: web không
            chỉnh được đèn nền của máy.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[color:var(--clk-chip)] py-3 first-of-type:border-t-0">
      <h2 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[1.4px] text-[color:var(--clk-faint)]">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
