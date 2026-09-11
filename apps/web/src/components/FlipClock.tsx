import { useEffect, useRef, useState } from 'react';
import { splitClock, spokenTime, type ClockPart } from '@/lib/study-format';

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
  parts: given,
  tone = 'light',
  size = 'lg',
  layout = 'row',
  label,
}: {
  /**
   * Số giây còn lại, cho đồng hồ ĐẾM NGƯỢC. Số âm được kẹp về 0.
   * Bỏ qua khi đã truyền `parts` sẵn.
   */
  seconds?: number;
  /**
   * Các nhóm chữ số dựng sẵn — dùng cho đồng hồ xem GIỜ HIỆN TẠI, thứ không
   * quy ra "số giây còn lại" được.
   */
  parts?: ClockPart[];
  /** `light` cho nền màu đậm (chữ trắng), `dark` cho nền trắng. */
  tone?: 'light' | 'dark';
  /** `fluid` = phình theo khung nhìn, dành cho chế độ toàn màn hình. */
  size?: 'lg' | 'sm' | 'fluid';
  /**
   * `row` = nằm ngang một hàng. `stack` = mỗi nhóm một hàng, xếp chồng.
   *
   * Xếp chồng chỉ có nghĩa ở `fluid`: khổ dọc rộng 390px mà xếp sáu thẻ một
   * hàng thì mỗi thẻ còn 45px, trong khi phía trên và dưới thừa cả nửa màn hình.
   */
  layout?: 'row' | 'stack';
  /** Đè nhãn cho trình đọc màn hình. Mặc định là "Còn lại ...". */
  label?: string;
}) {
  const shown = given ?? splitClock(seconds ?? 0);
  const fluid = size === 'fluid';
  // Xếp chồng chỉ áp dụng ở cỡ linh hoạt — hai cỡ cố định luôn nằm trong một
  // thẻ hẹp, dựng đứng ở đó chỉ làm vỡ bố cục xung quanh.
  const stacked = fluid && layout === 'stack';

  const digitClass = fluid ? '' : size === 'lg' ? 'text-[56px]' : 'text-[26px]';
  const sepClass = fluid
    ? 'px-[0.06em] pb-[0.1em] text-[0.7em]'
    : size === 'lg'
      ? 'text-[40px] px-[3px] pb-[6px]'
      : 'text-[20px] px-[2px] pb-[3px]';
  const sepColor = tone === 'light' ? 'text-white/70' : 'text-ink-400';

  return (
    <div
      className={
        stacked
          ? `flex flex-col items-center gap-[0.08em] ${digitClass} font-extrabold leading-none tracking-tight`
          : `flex items-end justify-center ${digitClass} font-extrabold leading-none tracking-tight`
      }
      // Người khiếm thị nghe "12:34" chứ không phải bốn con số rời rạc.
      role="timer"
      aria-label={label ?? `Còn lại ${spokenTime(seconds ?? 0)}`}
      style={fluid ? { fontSize: fluidFontSize(shown, stacked) } : undefined}
    >
      {shown.map((part, groupIndex) => (
        <div key={part.id} className="flex items-end">
          {/* Xếp chồng thì bỏ dấu hai chấm: xuống dòng đã tách nhóm rồi, thêm
              dấu vào chỉ làm hàng lệch tâm. */}
          {groupIndex > 0 && !stacked && (
            <span aria-hidden className={`${sepClass} ${sepColor} font-bold`}>
              :
            </span>
          )}
          <div className={`flex ${fluid ? 'gap-[0.05em]' : 'gap-[3px]'}`} aria-hidden>
            {part.digits.map((d, i) => (
              <FlipDigit key={`${part.id}-${i}`} value={d} />
            ))}
          </div>

          {/*
            Nhãn đơn vị, CHỈ ở chế độ xếp chồng. Không có dấu hai chấm thì hai
            hàng `18` và `07` có thể đọc thành giờ:phút thay vì phút:giây — mà
            đây là màn hình người ta liếc qua chứ không đọc kỹ.
          */}
          {stacked && (
            <span
              aria-hidden
              className={`ml-[0.1em] pb-[0.3em] text-[0.13em] font-bold uppercase tracking-[0.1em] ${
                tone === 'light' ? 'text-white/35' : 'text-ink-300'
              }`}
            >
              {UNIT_LABEL[part.id]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

const UNIT_LABEL: Record<ClockPart['id'], string> = {
  h: 'giờ',
  m: 'phút',
  s: 'giây',
};

/**
 * Cỡ chữ cho chế độ toàn màn hình, tính theo SỐ THẺ đang hiện.
 *
 * Không dùng một `clamp()` cố định: `12:34` có bốn thẻ còn `1:23:45` có sáu,
 * và một cỡ chữ vừa cho bốn thẻ sẽ tràn ra ngoài mép khi sang sáu. Tính ngược
 * từ chiều rộng khả dụng nên đồng hồ luôn vừa khung, ở cả dọc lẫn ngang.
 *
 * Mỗi thẻ rộng `1em` cộng khe `0.05em`; mỗi dấu hai chấm chiếm khoảng `0.82em`
 * kể cả đệm hai bên. Chặn thêm theo chiều cao (`vh`) để lúc xoay ngang đồng hồ
 * không cao quá khung.
 */
function fluidFontSize(parts: ClockPart[], stacked: boolean): string {
  if (stacked) {
    // Mỗi hàng hai thẻ; chiều CAO mới là thứ giới hạn. `1.42` là tỉ lệ cao/rộng
    // của một thẻ, `0.08` là khe giữa hai hàng.
    const rows = Math.max(1, parts.length);
    const widest = Math.max(...parts.map((p) => p.digits.length), 1);
    // Trừ hao 0.45em cho nhãn đơn vị bên phải, nếu không cụm số bị đẩy lệch tâm.
    const byWidth = (92 / (widest * 1.05 + 0.38)).toFixed(2);
    const byHeight = (64 / (rows * 1.42 + (rows - 1) * 0.08)).toFixed(2);
    return `min(${byWidth}vw, ${byHeight}vh, 220px)`;
  }

  const digits = parts.reduce((sum, p) => sum + p.digits.length, 0);
  const separators = Math.max(0, parts.length - 1);
  const widthEm = digits * 1.05 + separators * 0.82;
  const byWidth = (92 / widthEm).toFixed(2);
  return `min(${byWidth}vw, 46vh, 220px)`;
}

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
