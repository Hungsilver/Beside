import { useEffect, useRef, useState } from 'react';
import { splitClock, spokenTime, type ClockPart } from '@/lib/study-format';

/**
 * Đồng hồ số lật (flip clock).
 *
 * Mỗi tấm thẻ tự lật khi giá trị đổi. Chỉ thẻ nào ĐỔI SỐ mới lật — đó là điểm
 * mấu chốt: lật cả bốn thẻ mỗi giây thì thành đèn nhấp nháy, còn lật đúng thẻ
 * đang đổi mới ra cảm giác đồng hồ cơ.
 *
 * Vì sao không dùng `key` để React tự thay DOM: thay node thì hiệu ứng chạy cho
 * SỐ MỚI nhưng số cũ biến mất ngay lập tức, mất hẳn nửa đầu cú lật (lá trên gập
 * xuống). Phải tự giữ lại số trước đó.
 *
 * Hai kiểu thẻ, xem prop `card`:
 *   · `digit` — mỗi CHỮ SỐ một thẻ. Dùng cho thẻ hồng trong Phòng học.
 *   · `group` — mỗi ĐƠN VỊ một thẻ, hai chữ số lật cùng nhau. Đây là dáng của
 *     đồng hồ lật thật (và của các app Flip Clock), dùng cho module Đồng hồ.
 */
export default function FlipClock({
  seconds,
  parts: given,
  tone = 'light',
  size = 'lg',
  layout = 'row',
  card = 'digit',
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
   * Xếp chồng chỉ có nghĩa ở `fluid`: khổ dọc rộng 390px mà xếp ba thẻ một hàng
   * thì mỗi thẻ còn 130px, trong khi phía trên và dưới thừa cả nửa màn hình.
   */
  layout?: 'row' | 'stack';
  /**
   * Một thẻ mang một chữ số, hay mang cả một đơn vị.
   *
   * `group` làm chữ số to hơn hẳn ở cùng một khung: một thẻ `41` rộng 1.46em
   * trong khi hai thẻ `4` `1` rời rộng 2.05em, nên cỡ chữ tính ngược từ bề
   * ngang khả dụng sẽ lớn hơn ~40%.
   */
  card?: 'digit' | 'group';
  /** Đè nhãn cho trình đọc màn hình. Mặc định là "Còn lại ...". */
  label?: string;
}) {
  const shown = given ?? splitClock(seconds ?? 0);
  const fluid = size === 'fluid';
  const grouped = card === 'group';
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

  /*
   * Thẻ nhóm KHÔNG có dấu hai chấm, chỉ có khe hở.
   *
   * Đồng hồ lật thật không có dấu hai chấm nào — ba khối số rời nhau đã tự đọc
   * ra giờ/phút/giây. Thêm dấu vào chỉ ăn mất ~0.8em bề ngang, tức là cỡ chữ
   * nhỏ đi đúng chừng ấy.
   */
  const withSeparators = !grouped && !stacked;
  const gapClass = fluid
    ? grouped
      ? 'gap-[0.07em]'
      : 'gap-[0.05em]'
    : 'gap-[3px]';

  return (
    <div
      className={
        stacked
          ? `flip-fluid flex select-none flex-col items-center ${grouped ? 'gap-[0.07em]' : 'gap-[0.06em]'} ${digitClass} font-extrabold leading-none tracking-tight`
          : `${fluid ? 'flip-fluid ' : ''}flex select-none items-end justify-center ${fluid && grouped ? 'gap-[0.07em]' : ''} ${digitClass} font-extrabold leading-none tracking-tight`
      }
      // Người khiếm thị nghe "12:34" chứ không phải bốn con số rời rạc.
      role="timer"
      aria-label={label ?? `Còn lại ${spokenTime(seconds ?? 0)}`}
      style={fluid ? fluidStyle(shown, stacked, grouped) : undefined}
    >
      {shown.map((part, groupIndex) => (
        <div key={part.id} className="relative flex items-end">
          {/* Xếp chồng thì bỏ dấu hai chấm: xuống dòng đã tách nhóm rồi, thêm
              dấu vào chỉ làm hàng lệch tâm. */}
          {groupIndex > 0 && withSeparators && (
            <span aria-hidden className={`${sepClass} ${sepColor} font-bold`}>
              :
            </span>
          )}

          {grouped ? (
            // Cả đơn vị trên MỘT thẻ — `09` lật thành `10` trong một cú.
            <div aria-hidden>
              <FlipDigit
                value={part.digits.join('')}
                width={groupWidthEm(part.digits.length)}
              />
            </div>
          ) : (
            <div className={`flex ${gapClass}`} aria-hidden>
              {part.digits.map((d, i) => (
                <FlipDigit key={`${part.id}-${i}`} value={d} />
              ))}
            </div>
          )}

          {/*
            Nhãn đơn vị, CHỈ ở chế độ xếp chồng. Không có dấu hai chấm thì hai
            hàng `18` và `07` có thể đọc thành giờ:phút thay vì phút:giây — mà
            đây là màn hình người ta liếc qua chứ không đọc kỹ.

            Đặt CHỒNG vào góc thẻ chứ không nằm cạnh: nằm cạnh thì nó ăn mất
            khoảng 20% bề ngang, và chữ số — thứ người ta thật sự nhìn — nhỏ đi
            đúng chừng ấy. Góc thẻ thì luôn trống vì chữ số căn giữa.
          */}
          {stacked && (
            <span
              aria-hidden
              className={`pointer-events-none absolute bottom-[0.05em] right-[0.07em] text-[0.09em] font-bold uppercase leading-none tracking-[0.08em] ${
                tone === 'light' ? 'text-white/30' : 'text-ink-300'
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
 * Kích thước một tấm thẻ, tính theo `em` của cỡ chữ đang dùng.
 *
 * Giữ ở đây chứ không nhúng trong CSS vì `fluidStyle()` phải tính ngược từ
 * chúng — hai nơi lệch nhau một chút là đồng hồ tràn ra ngoài mép màn hình.
 */
/** Thẻ một chữ số: rộng `1em`, cao `1.42em`, khe `0.05em`. */
const DIGIT_W = 1.05;
const DIGIT_H = 1.42;
/** Thẻ nhóm: cao `1.2em`, khe `0.07em`. Bề ngang tuỳ số chữ số. */
const GROUP_H = 1.2;
const GROUP_GAP = 0.07;
/** Mỗi dấu hai chấm chiếm ~`0.78em` kể cả đệm hai bên. */
const SEP_W = 0.78;

/**
 * Bề ngang thẻ nhóm theo số chữ số nó mang.
 *
 * Con số đo trên bản dựng thật, không suy từ lý thuyết: ở `font-weight: 800`
 * của phông hệ thống, một chữ số chiếm ~0.70em — bản đầu tính 0.60em và `36`
 * chạm sát hai mép thẻ, trông như chữ bị nhét vào. Cộng 0.30em đệm hai bên.
 *
 * Đếm ngược dài (`100:00:00`) có nhóm ba chữ số nên không được đóng cứng ở
 * một giá trị.
 *
 * Nới thẻ ra KHÔNG làm chữ số nhỏ đi ở khổ dọc: cỡ chữ ở đó bị chặn bởi chiều
 * CAO (`cqh`) chứ không bởi bề ngang, nên thẻ chỉ rộng thêm phần đệm.
 */
function groupWidthEm(digits: number): number {
  return 0.7 * Math.max(1, digits) + 0.3;
}

/**
 * Cỡ chữ cho chế độ toàn màn hình, tính theo SỐ THẺ và KIỂU THẺ đang hiện.
 *
 * Không dùng một `clamp()` cố định: `12:34` có bốn thẻ còn `1:23:45` có sáu,
 * và một cỡ chữ vừa cho bốn thẻ sẽ tràn ra ngoài mép khi sang sáu. Tính ngược
 * từ bề ngang khả dụng nên đồng hồ luôn vừa khung, ở cả dọc lẫn ngang.
 *
 * Trả về HAI giá trị:
 *   · `--flip-vp` đo theo khung nhìn — bản dự phòng cho trình duyệt cũ.
 *   · `--flip-cq` đo theo KHUNG CHỨA (`cqw`/`cqh`) — bản dùng thật.
 *
 * Vì sao phải có bản thứ hai: phần giữa màn hình co lại khi hàng nút của chế độ
 * hẹn giờ hiện ra, mà `vh` thì không biết chuyện đó — đồng hồ giữ nguyên cỡ và
 * tràn đè lên các nút. Đơn vị theo khung chứa co đúng theo chỗ còn lại.
 */
function fluidStyle(
  parts: ClockPart[],
  stacked: boolean,
  grouped: boolean,
): React.CSSProperties {
  let widthEm: number;
  let heightEm: number;

  if (grouped) {
    const widths = parts.map((p) => groupWidthEm(p.digits.length));
    if (stacked) {
      const rows = Math.max(1, parts.length);
      // Nhãn đơn vị nằm CHỒNG trong góc thẻ nên không chiếm thêm bề ngang nào.
      widthEm = Math.max(...widths, 1);
      heightEm = rows * GROUP_H + (rows - 1) * GROUP_GAP;
    } else {
      widthEm =
        widths.reduce((sum, w) => sum + w, 0) + Math.max(0, parts.length - 1) * GROUP_GAP;
      heightEm = GROUP_H;
    }
  } else if (stacked) {
    const rows = Math.max(1, parts.length);
    const widest = Math.max(...parts.map((p) => p.digits.length), 1);
    widthEm = widest * DIGIT_W;
    heightEm = rows * DIGIT_H + (rows - 1) * 0.06;
  } else {
    const digits = parts.reduce((sum, p) => sum + p.digits.length, 0);
    const separators = Math.max(0, parts.length - 1);
    widthEm = digits * DIGIT_W + separators * SEP_W;
    heightEm = DIGIT_H;
  }

  const w = (97 / widthEm).toFixed(2);
  const h = (94 / heightEm).toFixed(2);

  return {
    // `vh` dự phòng phải DÈ DẶT hơn: nó đo cả màn hình chứ không riêng phần
    // giữa, nên lấy đúng 94% sẽ tràn ra ngoài hai thanh trên/dưới.
    '--flip-vp': `min(${w}vw, ${(Number(h) * 0.7).toFixed(2)}vh, ${MAX_FLUID_PX}px)`,
    '--flip-cq': `min(${w}cqw, ${h}cqh, ${MAX_FLUID_PX}px)`,
  } as React.CSSProperties;
}

/**
 * Trần cỡ chữ ở chế độ linh hoạt.
 *
 * Điện thoại không bao giờ chạm tới con số này (bị chặn bởi `vw`/`vh` trước);
 * nó chỉ để trên máy tính bảng hay màn hình rộng đồng hồ không phình tới mức
 * lố. 300px là khoảng cao bằng một tấm thẻ flip clock để bàn thật.
 */
const MAX_FLUID_PX = 300;

/**
 * Thời gian lật, phải khớp `animation-duration + delay` của `.flip-flap-*`
 * (210ms + 210ms). Cộng thêm một chút để lá cuối kịp về đúng chỗ trước khi
 * component gỡ nó đi.
 */
const FLIP_MS = 450;

function FlipDigit({ value, width }: { value: string; width?: number }) {
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
     * trạng thái đang lật. Đồng hồ chạy suốt lúc khoá màn hình nên tình huống
     * này là chuyện thường, không phải hiếm gặp.
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
    <span
      className={width === undefined ? 'flip-digit' : 'flip-digit is-group'}
      style={width === undefined ? undefined : ({ '--flip-cw': `${width}em` } as React.CSSProperties)}
    >
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
