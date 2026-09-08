import { useEffect, useState, type FormEvent } from 'react';
import {
  createEventSchema,
  EVENT_EMOJIS,
  EVENT_NOTE_MAX,
  EVENT_TITLE_MAX,
  REMIND_LABELS,
  REMIND_OPTIONS,
  type CreateEventInput,
  type EventResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/lib/events-api';
import { defaultTimes, isoToVnWall, vnWallToIso } from '@/lib/event-display';
import { FormError } from '@/components/ui';

/**
 * Tấm trượt từ dưới lên để tạo/sửa một sự kiện.
 *
 * Dựng bằng div chứ không phải `<dialog>`: Safari trên iOS 16 (vẫn còn nhiều
 * máy dùng) chưa hỗ trợ `showModal()` đầy đủ, và bàn phím ảo hay đẩy hỏng layout
 * của dialog gốc.
 */
export default function EventSheet({
  dayKey,
  event,
  onClose,
}: {
  /** Ngày đang chọn trên lịch — dùng làm giá trị mặc định khi tạo mới. */
  dayKey: string;
  /** Có giá trị = đang sửa; `null` = tạo mới. */
  event: EventResponse | null;
  onClose: () => void;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const initial = event ? fromEvent(event) : blankForm(dayKey);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Bấm vào một sự kiện khác trong khi tấm trượt đang mở → nạp lại nội dung.
  useEffect(() => {
    setForm(event ? fromEvent(event) : blankForm(dayKey));
    setError(null);
    setFieldErrors({});
    setConfirmDelete(false);
  }, [event, dayKey]);

  // Khoá cuộn nền để bàn phím ảo không đẩy cả trang.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Esc để đóng — bàn phím ngoài trên iPad và mọi trình duyệt máy tính.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const busy = create.isPending || update.isPending || remove.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setFieldErrors({});

    const input = toInput(form);
    if (!input) {
      setError('Chưa điền đủ ngày giờ');
      return;
    }

    // Kiểm tra bằng CHÍNH schema server dùng — sai thì báo ngay tại chỗ,
    // không phải chờ một vòng mạng mới biết.
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      const map: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_');
        (map[key] ??= []).push(issue.message);
      }
      setFieldErrors(map);
      setError(Object.values(map)[0]?.[0] ?? 'Thông tin chưa hợp lệ');
      return;
    }

    try {
      if (event) await update.mutateAsync({ id: event.id, input: parsed.data });
      else await create.mutateAsync(parsed.data);
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors ?? {});
        setError(err.message);
      } else {
        setError('Không lưu được, thử lại nhé');
      }
    }
  }

  async function doDelete() {
    if (!event || busy) return;
    try {
      await remove.mutateAsync(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không xoá được');
    }
  }

  const canEdit = !event || event.canEdit;

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
          <b className="text-[15px]">{event ? 'Sửa sự kiện' : 'Sự kiện mới'}</b>
          <button
            type="submit"
            form="event-form"
            disabled={busy || !canEdit}
            className="min-h-11 rounded-full bg-love-500 px-4 text-[14px] font-bold text-white disabled:opacity-45"
          >
            {busy ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>

        <form id="event-form" onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          <FormError message={error} />

          {!canEdit && (
            <p className="rounded-2xl bg-ink-100 px-4 py-3 text-[12.5px] text-ink-500">
              Sự kiện này do {event?.createdByName} tạo — bạn xem được nhưng không sửa được.
            </p>
          )}

          {/* Emoji + tên */}
          <div className="flex items-start gap-2.5">
            <select
              value={form.emoji}
              onChange={(e) => setForm({ ...form, emoji: e.target.value })}
              disabled={!canEdit}
              aria-label="Biểu tượng"
              className="h-12 w-16 shrink-0 rounded-2xl border-[1.5px] border-ink-200 bg-white text-center text-[20px]"
            >
              {EVENT_EMOJIS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
            <div className="min-w-0 flex-1">
              <input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value.slice(0, EVENT_TITLE_MAX) })
                }
                disabled={!canEdit}
                placeholder="Hai đứa mình đi đâu?"
                className="h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
              />
              <FieldHint errors={fieldErrors.title} />
            </div>
          </div>

          {/* Cả ngày */}
          <Row label="Cả ngày">
            <Toggle
              on={form.allDay}
              disabled={!canEdit}
              label="Cả ngày"
              onChange={(v) => setForm({ ...form, allDay: v })}
            />
          </Row>

          {/* Bắt đầu */}
          <div>
            <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">Bắt đầu</span>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                disabled={!canEdit}
                className="h-12 flex-1 rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
              />
              {!form.allDay && (
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  disabled={!canEdit}
                  className="h-12 w-[112px] rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
                />
              )}
            </div>
            <FieldHint errors={fieldErrors.startDate ?? fieldErrors.startAt} />
          </div>

          {/* Kết thúc */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-ink-700">Kết thúc</span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setForm({ ...form, hasEnd: !form.hasEnd })}
                className="min-h-8 text-[12.5px] font-semibold text-love-600"
              >
                {form.hasEnd ? 'Bỏ giờ kết thúc' : '+ Thêm giờ kết thúc'}
              </button>
            </div>
            {form.hasEnd && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  disabled={!canEdit}
                  className="h-12 flex-1 rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
                />
                {!form.allDay && (
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    disabled={!canEdit}
                    className="h-12 w-[112px] rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
                  />
                )}
              </div>
            )}
            <FieldHint errors={fieldErrors.endDate ?? fieldErrors.endAt} />
          </div>

          {/* Nhắc trước */}
          <div>
            <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">Nhắc trước</span>
            <select
              value={form.remind === null ? 'none' : String(form.remind)}
              onChange={(e) =>
                setForm({
                  ...form,
                  remind: e.target.value === 'none' ? null : Number(e.target.value),
                })
              }
              disabled={!canEdit}
              className="h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3 text-[14px] outline-none focus:border-love-400"
            >
              <option value="none">Không nhắc</option>
              {REMIND_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {REMIND_LABELS[m]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-ink-400">
              Thông báo đẩy chưa bật — phần nhắc lịch sẽ chạy ở bước sau.
            </p>
          </div>

          {/* Ghi chú */}
          <div>
            <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">Ghi chú</span>
            <textarea
              value={form.note}
              onChange={(e) =>
                setForm({ ...form, note: e.target.value.slice(0, EVENT_NOTE_MAX) })
              }
              disabled={!canEdit}
              rows={3}
              placeholder="Địa chỉ, cần mang gì, dặn dò..."
              className="w-full resize-none rounded-2xl border-[1.5px] border-ink-200 px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-love-400"
            />
          </div>

          {/* Việc riêng */}
          <Row
            label="Việc riêng"
            hint={
              form.visibility === 'PRIVATE'
                ? 'Chỉ mình bạn thấy sự kiện này'
                : 'Người ấy cũng thấy sự kiện này'
            }
          >
            <Toggle
              on={form.visibility === 'PRIVATE'}
              disabled={!canEdit}
              label="Việc riêng"
              onChange={(v) => setForm({ ...form, visibility: v ? 'PRIVATE' : 'SHARED' })}
            />
          </Row>

          {event?.canEdit &&
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
                  onClick={() => void doDelete()}
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
                Xoá sự kiện
              </button>
            ))}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <b className="block text-[14px]">{label}</b>
        {hint && <p className="mt-0.5 text-[11.5px] text-ink-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-[46px] shrink-0 rounded-full transition disabled:opacity-40 ${
        on ? 'bg-love-500' : 'bg-ink-200'
      }`}
    >
      <span
        className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

function FieldHint({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="mt-1 text-[12px] font-semibold text-love-600">
      {errors[0]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Form ↔ dữ liệu API
// ---------------------------------------------------------------------------

interface FormState {
  emoji: string;
  title: string;
  note: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  hasEnd: boolean;
  endDate: string;
  endTime: string;
  remind: number | null;
  visibility: 'SHARED' | 'PRIVATE';
}

function blankForm(dayKey: string): FormState {
  const { startTime, endTime } = defaultTimes();
  return {
    emoji: '📅',
    title: '',
    note: '',
    allDay: false,
    startDate: dayKey,
    startTime,
    hasEnd: true,
    endDate: dayKey,
    endTime,
    remind: 60,
    visibility: 'SHARED',
  };
}

function fromEvent(e: EventResponse): FormState {
  const start = e.allDay
    ? { date: e.startAt.slice(0, 10), time: '09:00' }
    : isoToVnWall(e.startAt);
  const end = e.endAt
    ? e.allDay
      ? { date: e.endAt.slice(0, 10), time: '10:00' }
      : isoToVnWall(e.endAt)
    : null;

  return {
    emoji: e.emoji,
    title: e.title,
    note: e.note ?? '',
    allDay: e.allDay,
    startDate: start.date,
    startTime: start.time,
    hasEnd: end !== null,
    endDate: end?.date ?? start.date,
    endTime: end?.time ?? start.time,
    remind: e.remindMinBefore,
    visibility: e.visibility,
  };
}

function toInput(f: FormState): CreateEventInput | null {
  const common = {
    title: f.title,
    note: f.note.trim() === '' ? undefined : f.note,
    emoji: f.emoji,
    remindMinBefore: f.remind,
    visibility: f.visibility,
  };

  if (f.allDay) {
    if (!f.startDate) return null;
    return {
      ...common,
      allDay: true,
      startDate: f.startDate,
      endDate: f.hasEnd && f.endDate ? f.endDate : undefined,
    } as CreateEventInput;
  }

  const startAt = vnWallToIso(f.startDate, f.startTime);
  if (!startAt) return null;
  const endAt = f.hasEnd ? vnWallToIso(f.endDate, f.endTime) : null;
  if (f.hasEnd && !endAt) return null;

  return {
    ...common,
    allDay: false,
    startAt,
    endAt: endAt ?? undefined,
  } as CreateEventInput;
}
