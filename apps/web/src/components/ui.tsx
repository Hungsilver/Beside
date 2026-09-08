import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

/** Bao ngoài toàn màn hình, giới hạn bề rộng khi xem trên PC (Phase 5 sẽ mở rộng). */
export function Screen({
  children,
  variant = 'plain',
}: {
  children: ReactNode;
  variant?: 'plain' | 'dusk';
}) {
  return (
    <div
      className={`min-h-dvh w-full ${variant === 'dusk' ? 'dusk-gradient text-white' : 'bg-canvas'}`}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 safe-top safe-bottom">
        {children}
      </div>
    </div>
  );
}

/**
 * Lớp neo vào đáy **KHUNG NHÌN**, dùng cho thanh tab và các nút nổi góc dưới.
 *
 * Phải là `fixed`, không được `absolute`. Các màn dùng `<Screen>` (`min-h-dvh`)
 * cuộn cả trang, mà `<Screen>` lại không phải phần tử được định vị — nên phần tử
 * `absolute bottom-0` neo vào đáy của **khối chứa ban đầu** (một hình chữ nhật cao
 * đúng một khung nhìn, đặt ở đầu tài liệu), chứ không phải đáy màn hình. Cuộn
 * xuống vài trăm pixel là nó trôi lên mất. Xem `docs/traces/fix-thanh-tab-troi-khi-cuon.md`.
 *
 * `max-w-[430px] mx-auto` để trùng cột nội dung của `<Screen>` khi màn hình rộng
 * hơn điện thoại; ở khổ 390px thì phủ kín chiều ngang y như trước.
 *
 * `pointer-events-none` ở lớp ngoài để khoảng trống của lớp không nuốt thao tác
 * lên nội dung phía dưới — mỗi phần tử con phải tự bật lại `pointer-events-auto`.
 */
export function BottomLayer({
  children,
  className = 'z-30',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] ${className}`}>
      {children}
    </div>
  );
}

/**
 * Ô văn bản nhiều dòng. Cùng nhãn / lỗi / gợi ý như `Field` để hai loại ô nhìn
 * giống hệt nhau, kèm bộ đếm ký tự vì các ô này đều có trần độ dài.
 */
export function TextAreaField({
  label,
  error,
  hint,
  maxLength,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | undefined;
  hint?: string;
}) {
  const id = props.id ?? props.name;
  const errorId = error ? `${id}-error` : undefined;
  const used = String(props.value ?? '').length;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-[12.5px] font-bold text-ink-700">
          {label}
        </label>
        {maxLength !== undefined && (
          <span
            className={`text-[11.5px] tabular-nums ${used > maxLength ? 'font-bold text-love-600' : 'text-ink-400'}`}
          >
            {used}/{maxLength}
          </span>
        )}
      </div>
      <textarea
        {...props}
        id={id}
        // Cố ý KHÔNG đặt `maxLength` lên thẻ: trình duyệt sẽ lặng lẽ chặn phím
        // khi chạm trần, người dùng không hiểu vì sao gõ mà không ra chữ. Để họ
        // gõ quá rồi báo bằng bộ đếm đỏ và thông báo lỗi lúc lưu.
        className="field-input min-h-20 resize-y"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: string;
}) {
  const id = props.id ?? props.name;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-bold text-ink-700">
        {label}
      </label>
      <input
        {...props}
        id={id}
        className="field-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Thông báo lỗi chung của cả biểu mẫu (sai mật khẩu, mất mạng...). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-love-200 bg-love-50 px-4 py-3 text-[13px] font-semibold text-love-700"
    >
      {message}
    </div>
  );
}

export function Spinner({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-love-100 border-t-love-500" />
      <p className="text-[13px] font-semibold text-ink-500">{label}</p>
    </div>
  );
}

export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <div
      className="love-gradient flex items-center justify-center rounded-[20px] shadow-[0_10px_30px_rgba(234,47,101,0.35)]"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      💞
    </div>
  );
}
