export interface FanBox {
  w: number;
  h: number;
}

export interface FanMetrics {
  /** Bề rộng một lá bài, px. Chiều cao = `w * 1.4`. */
  cardW: number;
  /** Khoảng cách giữa hai lá liền nhau — cũng chính là bề ngang lộ ra. */
  step: number;
  /** Lá đang chọn nhô lên bấy nhiêu px. */
  lift: number;
  /** Mép trên của lá giữa, tính từ đỉnh khung. */
  baseY: number;
  /** Hệ số cong: lá thứ `i` tụt xuống `arc * off²` với `off = i - (n-1)/2`. */
  arc: number;
  /** Mỗi lá nghiêng thêm bấy nhiêu độ so với lá trước. */
  tilt: number;
}

/**
 * Khoảng nhô lên của lá đang chọn.
 *
 * Đúng bằng chiều cao phần chỉ số ở góc lá: nhờ vậy lá đang chọn luôn khoe được
 * trọn số của nó lên phía trên lá kế bên, mà **không cần** nâng thứ tự chồng lớp
 * — nâng lớp thì lá đang chọn lại che mất chỉ số của lá bên phải nó.
 */
const LIFT = 22;
/** Hai lá ngoài cùng thấp hơn lá giữa bấy nhiêu — cho ra dáng nan quạt. */
const ARC_DROP = 15;
/**
 * Sàn cứng cho bề ngang lộ ra. Dưới mức này thì ngón tay không còn nhắm trúng
 * lá nào nữa.
 *
 * Cố tình để thấp hơn `WANT_STEP` khá nhiều: thu lá lại chỉ đổi được thêm chừng
 * ấy pixel hở ra (`step = (W - cardW) / (n-1)`, mẫu số là 12), nên siết chặt quá
 * là đánh đổi tệ — bài nhỏ đi hẳn mà chỗ hở gần như không rộng thêm.
 */
const MIN_STEP = 16;
/**
 * Bề ngang lộ ra MONG MUỐN: đủ để đọc trọn số ở góc lá, kể cả "10" — hai chữ số
 * là trường hợp rộng nhất. Thiếu chỗ thì thà thu nhỏ lá còn hơn để lá to mà bị
 * lá bên cạnh che mất chính con số cần nhìn.
 */
const WANT_STEP = 26;
/** Tỉ lệ lá bài thật (63 × 88 mm). */
const RATIO = 1.4;

/**
 * Lá bài to đến đâu, chồng lên nhau bao nhiêu.
 *
 * Tách khỏi component vì đây là toàn bộ phần dễ vỡ của quạt bài: sai một chút
 * là 13 lá tràn ra ngoài màn hình, hoặc chồng khít tới mức chạm lá nào cũng
 * trúng lá bên cạnh. Là hàm thuần nên test được thẳng, không cần dựng trình duyệt.
 *
 * Ưu tiên theo thứ tự: (1) lá nằm gọn trong khung, (2) mỗi lá hở đủ để đọc
 * được số ở góc, (3) hở đủ để chạm trúng, (4) còn dư chỗ thì lá to lên.
 */
export function fanLayout(n: number, box: FanBox): FanMetrics {
  let cardW = Math.round(clamp((box.h - LIFT - ARC_DROP - 4) / RATIO, 40, 76));

  // Bước 1: thu lá cho tới khi mỗi lá hở đủ để ĐỌC ĐƯỢC, sàn 40px.
  if (n > 1) {
    cardW = Math.min(cardW, Math.max(40, Math.round(box.w - WANT_STEP * (n - 1))));
  }

  // Bước 2: khung vẫn hẹp thì hạ tiếp xuống mức đủ để CHẠM TRÚNG. Sàn 28px là
  // chỗ dừng — dưới nữa thì bài nhỏ tới mức vô dụng, thà để chồng khít hơn.
  if (n > 1 && cardW + MIN_STEP * (n - 1) > box.w) {
    cardW = Math.max(28, Math.round(box.w - MIN_STEP * (n - 1)));
  }

  const half = (n - 1) / 2;
  /*
   * Neo quạt bài xuống ĐÁY khung, đừng thả nó lên đỉnh.
   *
   * Lá bài nhỏ đi khi khung hẹp, mà khung thì cao cố định — treo ở đỉnh là để
   * lại một mảng trống giữa bài và hàng nút, còn tay người cầm máy thì ở dưới.
   */
  const baseY = Math.max(LIFT, box.h - cardHeight(cardW) - ARC_DROP - 2);

  return {
    cardW,
    baseY,
    step: n > 1 ? Math.max(0, Math.min(cardW * 0.78, (box.w - cardW) / (n - 1))) : 0,
    lift: LIFT,
    arc: n > 2 ? ARC_DROP / (half * half) : 0,
    tilt: Math.min(1.8, 24 / n),
  };
}

export function cardHeight(w: number): number {
  return Math.round(w * RATIO);
}

/** Tổng bề ngang quạt bài chiếm chỗ, để căn giữa. */
export function fanWidth(n: number, m: FanMetrics): number {
  return n === 0 ? 0 : m.cardW + m.step * (n - 1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
