/**
 * Bảng màu cho mặt đồng hồ số lật.
 *
 * Đổi màu qua BIẾN CSS (`--flip-top` / `--flip-bottom` / `--flip-ink`) chứ
 * không qua class: `.flip-digit` nằm sâu trong component và được dùng ở cả thẻ
 * hồng của phòng học lẫn lớp phủ toàn màn hình, nên chỗ duy nhất đặt màu được
 * mà không phải sửa component là biến thừa kế xuống.
 */

export interface ClockTheme {
  id: string;
  label: string;
  /** Nửa trên thẻ. */
  top: string;
  /** Nửa dưới thẻ — luôn tối hơn nửa trên để đọc ra "nếp gấp". */
  bottom: string;
  /** Màu chữ số. */
  ink: string;
  /** Nền của lớp phủ toàn màn hình. */
  page: string;
}

export const CLOCK_THEMES: ClockTheme[] = [
  { id: 'ink', label: 'Mực', top: '#332232', bottom: '#150d14', ink: '#ffffff', page: '#0B0710' },
  { id: 'rose', label: 'Hồng', top: '#7a2348', bottom: '#3d0f24', ink: '#ffe9f0', page: '#1a0511' },
  { id: 'deep', label: 'Xanh đêm', top: '#1b3358', bottom: '#0b192e', ink: '#e6f0ff', page: '#050c18' },
  { id: 'paper', label: 'Giấy', top: '#f3ece7', bottom: '#ddd2c8', ink: '#211a16', page: '#efe7df' },
];

export const DEFAULT_THEME_ID = 'ink';

export function findTheme(id: string): ClockTheme {
  return CLOCK_THEMES.find((t) => t.id === id) ?? CLOCK_THEMES[0]!;
}

/**
 * Chủ đề "Giấy" có nền SÁNG, nên mọi thứ vẽ bằng `text-white` sẽ tàng hình.
 * Giao diện hỏi hàm này để biết lật sang mực đen.
 */
export function isLightTheme(theme: ClockTheme): boolean {
  return theme.id === 'paper';
}
