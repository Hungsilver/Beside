import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CYCLE_PHASE_LABELS,
  CYCLE_SHARE_DESCRIPTIONS,
  CYCLE_SHARE_LABELS,
  CYCLE_SHARE_LEVELS,
  DISPLAY_TIMEZONE,
  type CyclePhase,
  type CycleSettingsInput,
  type PeriodEntryResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import {
  useAddPeriod,
  useCycleMe,
  useDeletePeriod,
  useSaveCycleSettings,
  useUpdatePeriod,
  useWipeCycle,
} from '@/lib/cycle-api';
import { FormError, Spinner } from '@/components/ui';

/**
 * F14 — Theo dõi chu kỳ kinh nguyệt.
 *
 * Màn này là của MỘT người, không phải của cặp đôi: mặc định người ấy không
 * thấy gì cả, và mọi mức chia sẻ đều do chủ dữ liệu bật lên. Server mới là nơi
 * áp luật đó (xem `partnerView()` trong packages/shared) — ở đây chỉ là giao diện.
 *
 * Cố tình KHÔNG có lịch tháng đầy màu: ở khổ 390px nó vừa chật vừa biến một
 * việc riêng tư thành một bảng thống kê ai cầm máy cũng đọc được. Ba con số
 * quan trọng (đang ở giai đoạn nào · ngày thứ mấy · còn mấy ngày) nằm gọn
 * trong một thẻ.
 */
export default function CycleScreen() {
  const navigate = useNavigate();
  const query = useCycleMe();

  if (query.isLoading) return <Spinner label="Đang mở..." />;

  const data = query.data;

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-12 safe-top safe-bottom">
        <header className="flex items-center gap-3 py-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Quay lại"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
          >
            ‹
          </button>
          <h1 className="text-[20px] font-extrabold tracking-tight">Chu kỳ của bạn</h1>
        </header>

        {query.isError && (
          <FormError
            message={
              query.error instanceof ApiRequestError
                ? query.error.message
                : 'Không tải được dữ liệu'
            }
          />
        )}

        {data && (data.enabled ? <Tracker data={data} /> : <Intro />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Màn giới thiệu khi chưa bật theo dõi. Nói thẳng luật riêng tư TRƯỚC. */
function Intro() {
  const add = useAddPeriod();
  const [error, setError] = useState<string | null>(null);

  async function startToday() {
    setError(null);
    try {
      await add.mutateAsync({ startDate: todayVn() });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không ghi được');
    }
  }

  return (
    <>
      <section className="dusk-gradient rounded-[var(--radius-hero)] p-6 text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)]">
        <span className="text-[34px]" aria-hidden>
          🌙
        </span>
        <h2 className="mt-2 text-[19px] font-extrabold">Theo dõi chu kỳ</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-white/90">
          Ghi lại ngày bắt đầu mỗi kỳ, app sẽ tự tính độ dài chu kỳ trung bình và
          nhắc trước khi kỳ tới đến.
        </p>
      </section>

      <section className="card mt-4">
        <h3 className="text-[14px] font-bold">Riêng tư trước đã</h3>
        <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-500">
          <li>🔒 Mặc định <b>người ấy không thấy gì cả</b></li>
          <li>👀 Muốn chia sẻ thì bạn chọn mức: chỉ báo giai đoạn, hoặc đầy đủ</li>
          <li>🧹 Xoá là xoá thật — có nút xoá sạch mọi dữ liệu chu kỳ</li>
          <li>⚕️ Đây là công cụ ghi chép, <b>không phải biện pháp tránh thai</b></li>
        </ul>
      </section>

      <FormError message={error} />

      <button
        type="button"
        disabled={add.isPending}
        onClick={() => void startToday()}
        className="btn-primary mt-4 w-full"
      >
        {add.isPending ? 'Đang ghi...' : 'Hôm nay là ngày đầu kỳ'}
      </button>
      <p className="mt-2 text-center text-[11.5px] leading-relaxed text-ink-400">
        Không phải hôm nay? Bật theo dõi rồi ghi lại ngày đúng ở mục “Các kỳ đã ghi”.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

function Tracker({ data }: { data: NonNullable<ReturnType<typeof useCycleMe>['data']> }) {
  const add = useAddPeriod();
  const update = useUpdatePeriod();
  const [error, setError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState(todayVn());

  const { prediction, entries } = data;
  const open = entries.find((e) => e.endDate === null) ?? null;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không lưu được');
    }
  }

  return (
    <>
      {/* Thẻ trạng thái */}
      <section className={`rounded-[var(--radius-hero)] p-6 text-white shadow-[0_10px_30px_rgba(139,92,246,0.22)] ${phaseGradient(prediction.phase)}`}>
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-white/80">
          {CYCLE_PHASE_LABELS[prediction.phase]}
        </p>
        <p className="mt-1.5 text-[30px] font-extrabold leading-none">
          {prediction.dayOfCycle !== null ? `Ngày ${prediction.dayOfCycle}` : 'Chưa có dữ liệu'}
        </p>
        <p className="mt-2 text-[13px] text-white/90">
          {prediction.daysUntilNext === null
            ? 'Ghi kỳ đầu tiên để bắt đầu dự đoán'
            : prediction.daysUntilNext > 0
              ? `Kỳ tới dự kiến ${formatDay(prediction.nextStartDate)} · còn ${prediction.daysUntilNext} ngày`
              : prediction.daysUntilNext === 0
                ? `Kỳ tới dự kiến là hôm nay`
                : `Đã trễ ${Math.abs(prediction.daysUntilNext)} ngày so với dự kiến`}
        </p>
        <p className="mt-3 text-[11px] text-white/75">
          Dựa trên {prediction.basedOnCycles > 0 ? `${prediction.basedOnCycles} chu kỳ đã ghi` : 'giá trị mặc định'} ·
          chu kỳ {prediction.cycleDays} ngày · kỳ {prediction.periodDays} ngày
        </p>
      </section>

      <FormError message={error} />

      {/* Ghi nhanh */}
      <section className="card mt-4">
        <h3 className="text-[14px] font-bold">Ghi lại</h3>

        {open && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() =>
              void run(() =>
                update.mutateAsync({
                  id: open.id,
                  input: { startDate: open.startDate, endDate: todayVn() },
                }),
              )
            }
            className="btn-primary mt-3 w-full"
          >
            {update.isPending ? 'Đang lưu...' : 'Kỳ này đã kết thúc hôm nay'}
          </button>
        )}

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">
            Ngày bắt đầu kỳ mới
          </span>
          <input
            type="date"
            value={newStart}
            max={todayVn()}
            onChange={(e) => setNewStart(e.target.value)}
            className="field-input"
          />
        </label>

        <button
          type="button"
          disabled={add.isPending || !newStart}
          onClick={() => void run(() => add.mutateAsync({ startDate: newStart }))}
          className="btn-ghost mt-2.5 w-full"
        >
          {add.isPending ? 'Đang ghi...' : '+ Thêm kỳ mới'}
        </button>
      </section>

      <HistoryCard entries={entries} />
      <ShareCard settings={data.settings} />
      <DangerCard />

      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-400">
        Dự đoán chỉ dựa trên lịch sử bạn ghi lại, sai số có thể vài ngày.
        <br />
        <b>Không dùng làm biện pháp tránh thai.</b>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

function HistoryCard({ entries }: { entries: PeriodEntryResponse[] }) {
  const del = useDeletePeriod();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section className="card mt-4">
      <h3 className="text-[14px] font-bold">Các kỳ đã ghi</h3>
      <ul className="mt-2 flex flex-col">
        {entries.slice(0, 12).map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 border-t border-ink-100 py-2.5 first:border-t-0"
          >
            <span className="text-[16px]" aria-hidden>
              {e.endDate === null ? '🩸' : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[13.5px]">{formatDay(e.startDate)}</b>
              <span className="text-[11.5px] text-ink-400">
                {e.endDate === null
                  ? 'đang diễn ra'
                  : `${e.lengthDays} ngày · tới ${formatDay(e.endDate)}`}
              </span>
            </div>

            {confirmId === e.id ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="min-h-11 px-2 text-[12px] font-bold text-ink-500"
                >
                  Thôi
                </button>
                <button
                  type="button"
                  disabled={del.isPending}
                  onClick={() => void del.mutateAsync(e.id).finally(() => setConfirmId(null))}
                  className="min-h-11 px-2 text-[12px] font-bold text-love-600"
                >
                  Xoá
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(e.id)}
                aria-label={`Xoá kỳ ngày ${formatDay(e.startDate)}`}
                className="flex size-11 shrink-0 items-center justify-center text-[13px] text-ink-400"
              >
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ShareCard({ settings }: { settings: CycleSettingsInput }) {
  const save = useSaveCycleSettings();
  const [error, setError] = useState<string | null>(null);

  async function patch(next: Partial<CycleSettingsInput>) {
    setError(null);
    try {
      await save.mutateAsync({ ...settings, ...next });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không lưu được');
    }
  }

  return (
    <section className="card mt-4">
      <h3 className="text-[14px] font-bold">Người ấy thấy gì</h3>
      <FormError message={error} />

      <div className="mt-2.5 flex flex-col gap-2">
        {CYCLE_SHARE_LEVELS.map((level) => {
          const on = settings.shareLevel === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => void patch({ shareLevel: level })}
              disabled={save.isPending}
              aria-pressed={on}
              className={`rounded-2xl border-[1.5px] px-4 py-3 text-left transition ${
                on ? 'border-love-400 bg-love-50' : 'border-ink-200 bg-white'
              }`}
            >
              <b className={`block text-[13.5px] ${on ? 'text-love-700' : ''}`}>
                {CYCLE_SHARE_LABELS[level]}
              </b>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-500">
                {CYCLE_SHARE_DESCRIPTIONS[level]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col">
        <ToggleRow
          label="Nhắc tôi trước 1 ngày"
          on={settings.remindMe}
          pending={save.isPending}
          onChange={(v) => void patch({ remindMe: v })}
        />
        <ToggleRow
          label="Nhắc người ấy trước 1 ngày"
          hint={
            settings.shareLevel === 'OFF'
              ? 'Cần bật chia sẻ thì mới nhắc người ấy được'
              : undefined
          }
          on={settings.remindPartner}
          pending={save.isPending || settings.shareLevel === 'OFF'}
          onChange={(v) => void patch({ remindPartner: v })}
        />
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  pending,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  pending: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-100 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px]">{label}</b>
        {hint && <p className="mt-0.5 text-[11.5px] text-ink-400">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
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

// ---------------------------------------------------------------------------

function DangerCard() {
  const wipe = useWipeCycle();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mt-5 rounded-[var(--radius-card)] border border-love-200 bg-love-50 p-4">
      <h3 className="text-[13.5px] font-bold text-love-700">Xoá dữ liệu chu kỳ</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-700">
        Xoá toàn bộ các kỳ đã ghi và cài đặt chia sẻ. Không thể khôi phục.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 min-h-12 w-full rounded-full border-[1.5px] border-love-300 bg-white text-[13.5px] font-bold text-love-600"
        >
          Xoá sạch dữ liệu chu kỳ
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn-ghost flex-1"
          >
            Thôi
          </button>
          <button
            type="button"
            disabled={wipe.isPending}
            onClick={() => void wipe.mutateAsync().finally(() => setConfirming(false))}
            className="min-h-12 flex-1 rounded-full bg-love-600 px-4 text-[14px] font-bold text-white disabled:opacity-55"
          >
            {wipe.isPending ? 'Đang xoá...' : 'Xoá hết'}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Nền của thẻ trạng thái, đổi theo giai đoạn để liếc là nhận ra. */
function phaseGradient(phase: CyclePhase): string {
  switch (phase) {
    case 'PERIOD':
      return 'love-gradient';
    case 'FERTILE':
      return 'bg-gradient-to-br from-[#7239e0] to-[#b14be8]';
    case 'UNKNOWN':
      return 'bg-gradient-to-br from-[#8e7a8b] to-[#5a4257]';
    default:
      return 'dusk-gradient';
  }
}

/** Hôm nay theo giờ VN, dạng `YYYY-MM-DD` cho ô `<input type="date">`. */
function todayVn(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TIMEZONE });
}

/** `2026-09-11` → `11/09/2026`. Ngày trôi nổi nên KHÔNG đổi múi giờ (§6.3). */
function formatDay(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}
