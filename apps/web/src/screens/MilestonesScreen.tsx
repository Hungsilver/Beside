import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createMilestoneSchema,
  MAX_CUSTOM_MILESTONES,
  MILESTONE_EMOJIS,
  MILESTONE_TITLE_MAX,
  type CreateMilestoneInput,
  type MilestoneItem,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useLoveSummary } from '@/lib/couple-api';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useUpdateMilestone,
} from '@/lib/milestones-api';
import { FormError, Screen, Spinner } from '@/components/ui';

export default function MilestonesScreen() {
  const loveQuery = useLoveSummary();
  const query = useMilestones();
  const [editing, setEditing] = useState<MilestoneItem | 'new' | null>(null);

  const items = query.data ?? [];
  const love = loveQuery.data;
  const customCount = items.filter((i) => i.id !== null).length;

  return (
    <Screen>
      <header className="flex items-center gap-3 py-4">
        <Link
          to="/"
          aria-label="Quay lại"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
        >
          ‹
        </Link>
        <h1 className="text-[22px] font-extrabold tracking-tight">Ngày yêu</h1>
      </header>

      {/* Bộ đếm lớn */}
      {love && (
        <section className="love-gradient relative overflow-hidden rounded-[var(--radius-hero)] p-5 text-white shadow-[0_18px_48px_rgba(139,92,246,0.16)]">
          <p className="text-[12px] font-bold tracking-[1.2px] opacity-90">
            CHÚNG MÌNH ĐÃ BÊN NHAU
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[54px] font-extrabold leading-none tabular-nums tracking-tight">
              {love.daysTogether.toLocaleString('vi-VN')}
            </span>
            <span className="text-[16px] font-bold opacity-90">ngày</span>
          </div>
          <p className="mt-1.5 text-[12.5px] opacity-90">
            {love.years} năm {love.months} tháng {love.days} ngày
          </p>
        </section>
      )}

      <div className="mt-4 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">Sắp tới</h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          disabled={customCount >= MAX_CUSTOM_MILESTONES}
          className="min-h-9 text-[12.5px] font-bold text-love-600 disabled:opacity-40"
        >
          + Thêm mốc riêng
        </button>
      </div>

      {query.isLoading ? (
        <Spinner label="Đang tính..." />
      ) : query.isError ? (
        <p role="alert" className="mt-4 text-[13px] font-semibold text-love-600">
          Không tải được danh sách. Kiểm tra kết nối rồi thử lại nhé.
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="text-[38px]">💖</span>
          <p className="max-w-[250px] text-[13.5px] leading-relaxed text-ink-500">
            Chưa có mốc nào trong 400 ngày tới. Thêm một mốc riêng để không quên
            ngày quan trọng.
          </p>
        </div>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id ?? item.title}-${item.date}`}>
              <MilestoneRow item={item} onEdit={() => item.id && setEditing(item)} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 rounded-2xl bg-ink-100 px-4 py-3 text-[11.5px] leading-relaxed text-ink-600">
        Mốc ngày, kỷ niệm hằng năm và sinh nhật được tính tự động từ ngày yêu và
        ngày sinh trong hồ sơ. Muốn đổi thì sửa ở màn <b>Cài đặt</b>.
      </p>

      <div className="h-8" />

      {editing && (
        <MilestoneSheet
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function MilestoneRow({ item, onEdit }: { item: MilestoneItem; onEdit: () => void }) {
  const editable = item.id !== null;
  const soon = item.daysLeft <= 7;

  const body = (
    <>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-[20px] ${
          soon ? 'bg-love-100' : 'bg-ink-100'
        }`}
      >
        {item.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px]">{item.title}</b>
        <span className="mt-0.5 block text-[12px] text-ink-400">
          {formatDate(item.date)}
          {item.subtitle && ` · ${item.subtitle}`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <b
          className={`block text-[15px] tabular-nums ${
            soon ? 'text-love-600' : 'text-ink-700'
          }`}
        >
          {countdown(item.daysLeft)}
        </b>
        {item.daysLeft > 0 && (
          <span className="text-[11px] text-ink-400">còn lại</span>
        )}
      </span>
    </>
  );

  const className = `flex w-full items-center gap-3 rounded-[var(--radius-card)] border bg-white p-3.5 text-left shadow-[0_2px_8px_rgba(35,19,32,0.05)] ${
    soon ? 'border-love-200' : 'border-black/[0.04]'
  }`;

  // Mốc tự sinh không bấm được — không có gì để sửa, và nút bấm không làm gì
  // là kiểu giao diện gây bực nhất.
  return editable ? (
    <button type="button" onClick={onEdit} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function MilestoneSheet({
  item,
  onClose,
}: {
  item: MilestoneItem | null;
  onClose: () => void;
}) {
  const create = useCreateMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();

  const [title, setTitle] = useState(item?.title ?? '');
  const [emoji, setEmoji] = useState(item?.emoji ?? '💖');
  const [date, setDate] = useState(item?.date.slice(0, 10) ?? '');
  const [yearly, setYearly] = useState(item?.subtitle?.startsWith('Tròn') ?? true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const parsed = createMilestoneSchema.safeParse({ title, emoji, date, yearly });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Thông tin chưa hợp lệ');
      return;
    }

    try {
      const input: CreateMilestoneInput = parsed.data;
      if (item?.id) await update.mutateAsync({ id: item.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div className="relative mx-auto max-h-[88%] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white pb-[max(env(safe-area-inset-bottom),20px)] shadow-[0_-8px_40px_rgba(35,19,32,0.18)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.05] bg-white/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-left text-[14px] font-semibold text-ink-500"
          >
            Huỷ
          </button>
          <b className="text-[15px]">{item ? 'Sửa mốc' : 'Mốc mới'}</b>
          <button
            type="submit"
            form="milestone-form"
            disabled={busy}
            className="min-h-11 rounded-full bg-love-500 px-4 text-[14px] font-bold text-white disabled:opacity-45"
          >
            {busy ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>

        <form id="milestone-form" onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          <FormError message={error} />

          <div className="flex items-start gap-2.5">
            <select
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label="Biểu tượng"
              className="h-12 w-16 shrink-0 rounded-2xl border-[1.5px] border-ink-200 bg-white text-center text-[20px]"
            >
              {MILESTONE_EMOJIS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MILESTONE_TITLE_MAX))}
              placeholder="Ngày cưới, lần đầu đi Đà Lạt..."
              className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">Ngày</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <b className="block text-[14px]">Lặp lại hằng năm</b>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">
                {yearly
                  ? 'Năm nào cũng nhắc lại vào đúng ngày này'
                  : 'Chỉ xảy ra một lần — qua rồi sẽ không hiện nữa'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={yearly}
              aria-label="Lặp lại hằng năm"
              onClick={() => setYearly((v) => !v)}
              className={`relative h-7 w-[46px] shrink-0 rounded-full transition ${
                yearly ? 'bg-love-500' : 'bg-ink-200'
              }`}
            >
              <span
                className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
                  yearly ? 'left-[21px]' : 'left-[3px]'
                }`}
              />
            </button>
          </div>

          {item?.id &&
            (confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-12 flex-1 rounded-2xl bg-ink-100 text-[14px] font-bold text-ink-600"
                >
                  Thôi
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void remove
                      .mutateAsync(item.id as string)
                      .then(onClose)
                      .catch(() => setError('Không xoá được'))
                  }
                  className="min-h-12 flex-1 rounded-2xl bg-love-600 text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {remove.isPending ? 'Đang xoá...' : 'Xoá hẳn'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-12 w-full rounded-2xl border-[1.5px] border-love-200 text-[14px] font-bold text-love-600"
              >
                Xoá mốc này
              </button>
            ))}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function countdown(daysLeft: number): string {
  if (daysLeft === 0) return 'Hôm nay';
  if (daysLeft === 1) return 'Ngày mai';
  return `${daysLeft} ngày`;
}

/**
 * Ngày trôi nổi → "11/11/2025".
 * Đọc theo UTC, KHÔNG đổi múi giờ — cùng quy ước với sự kiện cả ngày (§6.3).
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
