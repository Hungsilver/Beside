import { useMemo, useState } from 'react';
import { eventsOverlap, type EventResponse } from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { useMonthEvents } from '@/lib/events-api';
import {
  dayOfKey,
  groupByDay,
  longDayLabel,
  monthGrid,
  MONTH_NAMES,
  monthOfKey,
  timeLabel,
  todayKey,
  WEEKDAY_LABELS,
} from '@/lib/event-display';
import EventSheet from '@/components/EventSheet';
import TabBar from '@/components/TabBar';
import { Screen, Spinner } from '@/components/ui';

export default function CalendarScreen() {
  const { user } = useAuth();
  const today = todayKey();

  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selected, setSelected] = useState<string>(today);
  const [sheet, setSheet] = useState<{ event: EventResponse | null } | null>(null);

  const query = useMonthEvents(cursor.year, cursor.month);
  const events = useMemo(() => query.data ?? [], [query.data]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const dayEvents = byDay.get(selected) ?? [];

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.month + delta;
      if (m < 1) return { year: c.year - 1, month: 12 };
      if (m > 12) return { year: c.year + 1, month: 1 };
      return { year: c.year, month: m };
    });
  }

  function jumpToday() {
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
    setSelected(today);
  }

  return (
    <Screen>
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            Lịch của hai đứa
          </p>
          <h1 className="text-[24px] font-extrabold tracking-tight">
            {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <NavButton label="Tháng trước" onClick={() => shiftMonth(-1)}>
            ‹
          </NavButton>
          <NavButton label="Tháng sau" onClick={() => shiftMonth(1)}>
            ›
          </NavButton>
        </div>
      </header>

      {/* Lưới lịch tháng */}
      <section className="card !p-3">
        <div className="grid grid-cols-7 pb-1.5">
          {WEEKDAY_LABELS.map((w) => (
            <span
              key={w}
              className="text-center text-[11px] font-bold uppercase tracking-wide text-ink-400"
            >
              {w}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((key) => {
            const inMonth = monthOfKey(key) === cursor.month;
            const list = byDay.get(key) ?? [];
            const isToday = key === today;
            const isSelected = key === selected;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={longDayLabel(key)}
                aria-pressed={isSelected}
                className="flex h-11 flex-col items-center justify-center gap-[3px]"
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-[13.5px] tabular-nums transition ${
                    isSelected
                      ? 'bg-love-500 font-bold text-white'
                      : isToday
                        ? 'font-extrabold text-love-600 ring-[1.5px] ring-love-300'
                        : inMonth
                          ? 'font-semibold text-ink-700'
                          : 'text-ink-300'
                  }`}
                >
                  {dayOfKey(key)}
                </span>
                <span className="flex h-1 items-center gap-[3px]">
                  {list.slice(0, 3).map((e) => (
                    <i
                      key={e.id}
                      className={`block size-1 rounded-full ${
                        isSelected
                          ? 'bg-love-300'
                          : e.createdById === user?.id
                            ? 'bg-love-500'
                            : 'bg-[#6A7BFF]'
                      }`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={jumpToday}
          className="min-h-9 text-[12.5px] font-semibold text-love-600"
        >
          Về hôm nay
        </button>
        <p className="flex items-center gap-3 text-[11px] text-ink-400">
          <span className="flex items-center gap-1">
            <i className="size-1.5 rounded-full bg-love-500" /> của bạn
          </span>
          <span className="flex items-center gap-1">
            <i className="size-1.5 rounded-full bg-[#6A7BFF]" /> người ấy
          </span>
        </p>
      </div>

      {/* Danh sách sự kiện của ngày đang chọn */}
      <section className="mt-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">{longDayLabel(selected)}</h2>
          <span className="text-[12px] text-ink-400">
            {dayEvents.length > 0 ? `${dayEvents.length} sự kiện` : 'trống'}
          </span>
        </div>

        {query.isLoading ? (
          <Spinner label="Đang mở lịch..." />
        ) : query.isError ? (
          <p role="alert" className="mt-4 text-[13px] font-semibold text-love-600">
            Không tải được lịch. Kiểm tra kết nối rồi thử lại nhé.
          </p>
        ) : dayEvents.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
            <span className="text-[38px]">🗓️</span>
            <p className="max-w-[240px] text-[13.5px] leading-relaxed text-ink-500">
              Ngày này chưa có gì. Bấm ＋ để thêm một cuộc hẹn.
            </p>
          </div>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-2">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  mine={e.createdById === user?.id}
                  clash={dayEvents.some((o) => o.id !== e.id && eventsOverlap(e, o))}
                  onOpen={() => setSheet({ event: e })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="h-[120px]" />

      {/* Nút thêm — nổi trên thanh tab */}
      <button
        type="button"
        onClick={() => setSheet({ event: null })}
        aria-label="Thêm sự kiện"
        className="love-gradient absolute bottom-[calc(env(safe-area-inset-bottom)+92px)] right-5 z-20 flex size-14 items-center justify-center rounded-full text-[26px] text-white shadow-[0_10px_30px_rgba(234,47,101,0.4)]"
      >
        ＋
      </button>

      <TabBar />

      {sheet && (
        <EventSheet
          dayKey={selected}
          event={sheet.event}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[20px] leading-none text-ink-600"
    >
      {children}
    </button>
  );
}

function EventRow({
  event,
  mine,
  clash,
  onOpen,
}: {
  event: EventResponse;
  mine: boolean;
  clash: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-black/[0.04] bg-white p-3 text-left shadow-[0_2px_8px_rgba(35,19,32,0.05)]"
    >
      <span
        className={`w-1 shrink-0 self-stretch rounded-full ${
          mine ? 'bg-love-500' : 'bg-[#6A7BFF]'
        }`}
      />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-[19px]">
        {event.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="truncate text-[14.5px]">{event.title}</b>
          {event.visibility === 'PRIVATE' && (
            <span className="shrink-0 text-[11px]" title="Việc riêng">
              🔒
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-400">
          <span>{timeLabel(event)}</span>
          <span>· {mine ? 'bạn tạo' : event.createdByName}</span>
          {clash && <span className="font-semibold text-love-600">· trùng giờ</span>}
        </span>
      </span>
      <span className="shrink-0 text-[16px] text-ink-300">›</span>
    </button>
  );
}
