import { useEffect, useRef, useState } from 'react';
import { splitClock, spokenTime } from '@/lib/study-format';

/**
 * Đồng hồ số lật (flip clock) cho phòng học.
 *
 * Mỗi chữ số là một tấm thẻ tự lật khi giá trị đổi. Chỉ thẻ nào ĐỔI SỐ mới lật
 * — đó là điểm mấu chốt: lật cả bốn thẻ mỗi giây thì thành đèn nhấp nháy, còn
 * lật đúng thẻ đang đổi mới ra cảm giác đồng hồ cơ.
 *
 * Vì sao không dùng `key` để React tự thay DOM: thay node thì hiệu ứng chạy cho
 * SỐ MỚI nhưng số cũ biến mất ngay lập tức, mất hẳn nửa đầu cú lật (lá trên gập
 * xuống). Phải tự giữ lại số trước đó.
 */
export default function FlipClock({
  seconds,
  tone = 'light',
  size = 'lg',
}: {
  /** Số giây còn lại. Số âm được kẹp về 0. */
  seconds: number;
  /** `light` cho nền màu đậm (chữ trắng), `dark` cho nền trắng. */
  tone?: 'light' | 'dark';
  size?: 'lg' | 'sm';
}) {
  const parts = splitClock(seconds);
  const digitClass = size === 'lg' ? 'text-[56px]' : 'text-[26px]';
  const sepClass =
    size === 'lg' ? 'text-[40px] px-[3px] pb-[6px]' : 'text-[20px] px-[2px] pb-[3px]';
  const sepColor = tone === 'light' ? 'text-white/70' : 'text-ink-400';

  return (
    <div
      className={`flex items-end justify-center ${digitClass} font-extrabold leading-none tracking-tight`}
      // Người khiếm thị nghe "12:34" chứ không phải bốn con số rời rạc.
      role="timer"
      aria-label={`Còn lại ${spokenTime(seconds)}`}
    >
      {parts.map((part, groupIndex) => (
        <div key={part.id} className="flex items-end">
          {groupIndex > 0 && (
            <span aria-hidden className={`${sepClass} ${sepColor} font-bold`}>
              :
            </span>
          )}
          <div className="flex gap-[3px]" aria-hidden>
            {part.digits.map((d, i) => (
              <FlipDigit key={`${part.id}-${i}`} value={d} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Thời gian lật, phải khớp `animation-duration + delay` của `.flip-flap-*`. */
const FLIP_MS = 620;

function FlipDigit({ value }: { value: string }) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === current) return;

    // Giảm chuyển động: đổi số thẳng, không dựng lá lật nào cả.
    if (prefersReducedMotion()) {
      setCurrent(value);
      setPrevious(null);
      return;
    }

    setPrevious(current);
    setCurrent(value);

    /*
     * Hẹn giờ thay cho `onAnimationEnd`: khi tab bị ẩn trình duyệt treo
     * animation, sự kiện kết thúc không bao giờ tới và tấm thẻ sẽ kẹt lại ở
     * trạng thái đang lật. Đồng hồ học chạy suốt lúc khoá màn hình nên tình
     * huống này là chuyện thường, không phải hiếm gặp.
     */
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPrevious(null), FLIP_MS);
    // `current` cố tình không nằm trong danh sách phụ thuộc: thêm vào thì mỗi
    // lần lật xong hiệu ứng lại tự kích hoạt lần nữa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <span className="flip-digit">
      {/* Hai nửa TĨNH — nửa trên đã là số mới, nửa dưới còn giữ số cũ. */}
      <span className="flip-half-top">
        <i>{current}</i>
      </span>
      <span className="flip-half-bottom">
        <i>{previous ?? current}</i>
      </span>

      {previous !== null && (
        <>
          <span className="flip-flap-top">
            <i>{previous}</i>
          </span>
          <span className="flip-flap-bottom">
            <i>{current}</i>
          </span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  // `matchMedia` không có trong môi trường kiểm thử/SSR — hỏi trước khi gọi.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
