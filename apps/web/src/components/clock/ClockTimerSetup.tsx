import { useState } from 'react';
import { TIMER_MAX_MINUTES, TIMER_MIN_MINUTES, TIMER_PRESETS } from '@/lib/clock-prefs';

/**
 * Màn đặt hẹn giờ — chiếm chỗ của mặt số khi CHƯA đặt gì.
 *
 * Vì sao thay hẳn mặt đồng hồ chứ không nhồi các mức bấm nhanh xuống đáy: một
 * mặt số đang hiện `00:00` chẳng nói lên điều gì, nên chỗ của nó lúc này dùng
 * cho việc đang làm thì đúng hơn. Đặt xong là mặt số quay lại và chiếm hết
 * khung như mọi chế độ khác. Các app Flip Clock cũng làm vậy.
 */
export default function ClockTimerSetup({ onStart }: { onStart: (ms: number) => void }) {
  // Giữ ở dạng CHUỖI, không phải số: người dùng phải xoá trắng được ô để gõ lại,
  // mà `0` hay `NaN` thì không biểu diễn được trạng thái "đang xoá".
  const [text, setText] = useState('');

  const typed = Number.parseInt(text, 10);
  const valid =
    Number.isFinite(typed) && typed >= TIMER_MIN_MINUTES && typed <= TIMER_MAX_MINUTES;

  const startTyped = () => {
    if (!valid) return;
    onStart(typed * 60_000);
  };

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-3">
      <p className="text-center text-[12.5px] text-[color:var(--clk-soft)]">
        Hẹn giờ trong bao lâu?
      </p>

      <div className="grid grid-cols-3 gap-2">
        {TIMER_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onStart(m * 60_000)}
            // `10` và `phút` là hai thẻ rời, và Chrome KHÔNG chèn khoảng trắng
            // giữa hai span inline khi dựng tên khả dụng — để mặc thì trình đọc
            // màn hình đọc ra "10phút". Khai tường minh cho chắc.
            aria-label={`${m} phút`}
            className="h-14 rounded-2xl bg-[color:var(--clk-chip)] text-[15px] font-extrabold text-[color:var(--clk-fg)] transition active:scale-[0.97]"
          >
            {m}
            <span className="ml-1 text-[11.5px] font-bold text-[color:var(--clk-soft)]">
              phút
            </span>
          </button>
        ))}
      </div>

      {/*
        Ô gõ số phút tuỳ ý — mức bấm nhanh không bao giờ đủ (`docs/BACKLOG.md`
        12/09). `inputMode="numeric"` để điện thoại mở bàn phím số, và
        `form` + `onSubmit` để nút Enter trên bàn phím ảo cũng bắt đầu được.
      */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTyped();
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={TIMER_MIN_MINUTES}
          max={TIMER_MAX_MINUTES}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Số phút"
          aria-label={`Số phút tuỳ ý, từ ${TIMER_MIN_MINUTES} tới ${TIMER_MAX_MINUTES}`}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-[color:var(--clk-chip)] px-4 text-[15px] font-bold tabular-nums text-[color:var(--clk-fg)] outline-none placeholder:font-normal placeholder:text-[color:var(--clk-faint)]"
        />
        <button
          type="submit"
          disabled={!valid}
          className="h-12 shrink-0 rounded-2xl bg-[color:var(--clk-on-bg)] px-5 text-[14px] font-bold text-[color:var(--clk-on-fg)] transition disabled:opacity-35"
        >
          ▶ Bắt đầu
        </button>
      </form>

      <p className="text-center text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
        Tối đa {TIMER_MAX_MINUTES} phút. Chuông chỉ kêu khi app còn mở — web không đánh
        thức được máy đã tắt màn hình.
      </p>
    </div>
  );
}
