import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomLayer } from '@/components/ui';

/**
 * Bộ phần dùng chung của module Cài đặt.
 *
 * ── Vì sao Cài đặt tách thành nhiều màn ─────────────────────────────────────
 * Bản cũ là MỘT trang cuộn dài với bảy thẻ và bốn nút "Lưu thay đổi" khác nhau.
 * Ở khổ 390px, người dùng không nhìn thấy nút Lưu nào thuộc về ô mình vừa gõ,
 * và không thể liếc một cái là biết app đang bật những gì.
 *
 * Bản này đi theo lối quen thuộc của mọi app điện thoại: một DANH SÁCH nhóm,
 * mỗi hàng nói luôn giá trị hiện tại ở mép phải ("Zalo · 0912…", "Đang bật"),
 * chạm vào thì mở một màn con chỉ làm đúng một việc, có thanh Lưu neo ở đáy.
 */

// ---------------------------------------------------------------------------
// Khung màn con
// ---------------------------------------------------------------------------

export function SubScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Thanh neo ở đáy (thường là nút Lưu). */
  footer?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 safe-top safe-bottom">
        <header className="flex items-center gap-3 py-4">
          <button
            type="button"
            onClick={() => navigate('/cai-dat')}
            aria-label="Quay lại Cài đặt"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
          >
            ‹
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-extrabold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-[12px] text-ink-400">{subtitle}</p>
            )}
          </div>
        </header>

        {/* Chừa chỗ cho thanh Lưu neo ở đáy, để ô cuối cùng không bị che. */}
        <div className={footer ? 'pb-[120px]' : 'pb-10'}>{children}</div>
      </div>

      {footer}
    </div>
  );
}

/**
 * Thanh Lưu neo ở đáy khung nhìn.
 *
 * Nút Lưu chỉ sáng khi THẬT SỰ có thay đổi: bản cũ luôn cho bấm, và bấm khi
 * không sửa gì vẫn hiện "✓ Đã lưu" — một câu nói dối nhỏ khiến người dùng
 * không còn tin vào dấu tích đó nữa.
 *
 * `form` trỏ tới id của biểu mẫu nên nút nằm ngoài `<form>` vẫn submit được —
 * cách duy nhất để vừa neo ở đáy vừa không bị bàn phím ảo đẩy đi.
 */
export function SaveBar({
  formId,
  dirty,
  pending,
  saved,
}: {
  formId: string;
  dirty: boolean;
  pending: boolean;
  saved: boolean;
}) {
  return (
    <BottomLayer className="z-30">
      <div className="pointer-events-auto border-t border-black/[0.06] bg-white/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] backdrop-blur">
        <button
          type="submit"
          form={formId}
          disabled={pending || !dirty}
          className="btn-primary w-full"
        >
          {pending ? 'Đang lưu...' : saved && !dirty ? '✓ Đã lưu' : 'Lưu thay đổi'}
        </button>
      </div>
    </BottomLayer>
  );
}

// ---------------------------------------------------------------------------
// Danh sách
// ---------------------------------------------------------------------------

export function SettingsGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      {label && (
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-ink-400">
          {label}
        </h2>
      )}
      {/*
        Bo góc ở thẻ NGOÀI + `overflow-hidden`: từng hàng bên trong là hình chữ
        nhật phẳng, nhờ đó vạch ngăn chạy hết bề ngang mà góc trên/dưới vẫn tròn.
      */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-black/[0.04] bg-white shadow-[0_2px_8px_rgba(35,19,32,0.06)]">
        {children}
      </div>
    </section>
  );
}

interface RowProps {
  icon: string;
  /** Nền của ô biểu tượng — mỗi nhóm một màu để liếc là nhận ra. */
  tone?: 'love' | 'plum' | 'mint' | 'ink';
  title: string;
  desc?: string;
  /** Giá trị hiện tại, hiện ở mép phải. Nhờ nó không phải mở màn con mới biết. */
  value?: string | null;
}

const TONES: Record<NonNullable<RowProps['tone']>, string> = {
  love: 'bg-love-50',
  plum: 'bg-plum-100',
  mint: 'bg-mint-100',
  ink: 'bg-ink-100',
};

/** Hàng dẫn sang màn khác. */
export function SettingsLink({
  to,
  icon,
  tone = 'love',
  title,
  desc,
  value,
}: RowProps & { to: string }) {
  return (
    <Link to={to} className="flex min-h-[60px] items-center gap-3 px-4 py-3 border-t border-ink-100 first:border-t-0">
      <RowBody icon={icon} tone={tone} title={title} desc={desc} value={value} />
      <span className="shrink-0 text-[16px] text-ink-300" aria-hidden>
        ›
      </span>
    </Link>
  );
}

/** Hàng làm một việc ngay tại chỗ (đăng xuất…). */
export function SettingsAction({
  onClick,
  icon,
  tone = 'ink',
  title,
  desc,
  danger = false,
}: Omit<RowProps, 'value'> & { onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 border-t border-ink-100 px-4 py-3 text-left first:border-t-0"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-2xl text-[18px] ${TONES[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <b className={`block text-[14.5px] ${danger ? 'text-love-600' : ''}`}>{title}</b>
        {desc && <span className="mt-0.5 block text-[11.5px] text-ink-400">{desc}</span>}
      </span>
    </button>
  );
}

function RowBody({ icon, tone = 'love', title, desc, value }: RowProps) {
  return (
    <>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-2xl text-[18px] ${TONES[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14.5px]">{title}</b>
        {/*
          Một dòng, cắt bớt nếu dài: hàng nào cũng cao bằng nhau thì mắt lướt
          dọc danh sách mới nhanh, và phần giá trị ở mép phải không bị chữ mô tả
          xô cho xuống dòng.
        */}
        {desc && (
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-400">{desc}</span>
        )}
      </span>
      {value && (
        <span className="max-w-[38%] shrink-0 truncate text-right text-[12.5px] font-semibold text-ink-500">
          {value}
        </span>
      )}
    </>
  );
}

/**
 * Hàng có công tắc. Đổi là lưu ngay, không có nút Lưu — công tắc mà còn phải
 * bấm Lưu thì người dùng luôn phân vân không biết đã ăn hay chưa.
 */
export function SettingsToggle({
  icon,
  tone = 'love',
  title,
  desc,
  on,
  pending,
  onChange,
}: Omit<RowProps, 'value'> & {
  on: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-100 px-4 py-3.5 first:border-t-0">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-2xl text-[18px] ${TONES[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[14px]">{title}</b>
        {desc && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={pending}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-[46px] shrink-0 rounded-full transition disabled:opacity-50 ${
          on ? 'bg-love-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
            on ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

/** Câu giải thích đặt dưới một nhóm — chữ nhỏ, không viền, như iOS. */
export function GroupNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-ink-400">{children}</p>
  );
}
