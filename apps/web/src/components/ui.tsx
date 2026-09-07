import type { InputHTMLAttributes, ReactNode } from 'react';

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
