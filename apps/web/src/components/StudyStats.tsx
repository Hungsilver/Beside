import { useState } from 'react';
import {
  DAILY_GOAL_OPTIONS,
  MAX_DAILY_GOAL_MIN,
  type StudyPersonStats,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useSetStudyGoal } from '@/lib/study-api';
import { dayLabel, formatMinutes, weekdayLabel } from '@/lib/study-format';

/**
 * Thống kê phòng học: vòng tiến độ hôm nay · biểu đồ 7 ngày · phân bổ theo môn.
 *
 * Ba khối này trả lời ba câu hỏi khác nhau và không thay nhau được: "hôm nay
 * còn thiếu bao nhiêu", "tuần này học đều hay dồn cục", "thời gian đổ vào môn
 * nào". Một con số tổng không nói được câu nào trong ba câu đó.
 */
export default function StudyStats({
  me,
  partner,
  togetherMinutes,
}: {
  /** Thống kê của chính mình. `null` khi tài khoản chưa nằm trong danh sách. */
  me: StudyPersonStats | null;
  partner: StudyPersonStats | null;
  togetherMinutes: number;
}) {
  if (!me && !partner) return null;

  return (
    <>
      {me && <GoalCard me={me} />}
      {me && <WeekChart me={me} partner={partner} />}
      {me && me.subjects.length > 0 && <SubjectBreakdown person={me} />}
      <Totals me={me} partner={partner} togetherMinutes={togetherMinutes} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mục tiêu mỗi ngày
// ---------------------------------------------------------------------------

function GoalCard({ me }: { me: StudyPersonStats }) {
  const setGoal = useSetStudyGoal();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goal = me.goalMin;
  // Chia cho 0 khi chưa đặt mục tiêu — chặn ở đây chứ không ở chỗ vẽ vòng.
  const ratio = goal > 0 ? Math.min(1, me.todayMinutes / goal) : 0;
  const remaining = Math.max(0, goal - me.todayMinutes);

  async function save(minutes: number) {
    setError(null);
    try {
      await setGoal.mutateAsync({ dailyGoalMin: minutes });
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không lưu được mục tiêu');
    }
  }

  return (
    <section className="card mt-3.5">
      <div className="flex items-center gap-4">
        <ProgressRing ratio={ratio} label={goal > 0 ? `${Math.round(ratio * 100)}%` : '—'} />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            Hôm nay
          </p>
          <b className="mt-0.5 block text-[20px] leading-tight">
            {formatMinutes(me.todayMinutes)}
          </b>
          <p className="mt-0.5 text-[12px] text-ink-500">
            {goal === 0
              ? 'Chưa đặt mục tiêu ngày'
              : remaining === 0
                ? `Đã đạt mục tiêu ${formatMinutes(goal)} 🎉`
                : `Còn ${formatMinutes(remaining)} nữa là đủ ${formatMinutes(goal)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={goal === 0 ? 'Đặt mục tiêu mỗi ngày' : 'Sửa mục tiêu mỗi ngày'}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[15px]"
        >
          🎯
        </button>
      </div>

      {editing && (
        <div className="mt-3 border-t border-black/[0.05] pt-3">
          <span className="text-[11.5px] font-bold text-ink-700">
            Mục tiêu mỗi ngày (tối đa {MAX_DAILY_GOAL_MIN / 60} giờ)
          </span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DAILY_GOAL_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={setGoal.isPending}
                onClick={() => void save(m)}
                aria-pressed={goal === m}
                className={`h-11 rounded-2xl text-[13.5px] font-bold transition disabled:opacity-50 ${
                  goal === m
                    ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300'
                    : 'bg-ink-100 text-ink-600'
                }`}
              >
                {m === 0 ? 'Tắt' : formatMinutes(m)}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Vòng tiến độ vẽ bằng `conic-gradient` — một vòng tròn không đáng kéo SVG vào. */
function ProgressRing({ ratio, label }: { ratio: number; label: string }) {
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return (
    <div
      role="img"
      aria-label={`Tiến độ ${label}`}
      className="relative grid size-[62px] shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-love-500) ${safe * 360}deg, var(--color-ink-100) 0deg)`,
      }}
    >
      <span className="grid size-[48px] place-items-center rounded-full bg-white text-[12.5px] font-extrabold">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ 7 ngày
// ---------------------------------------------------------------------------

function WeekChart({
  me,
  partner,
}: {
  me: StudyPersonStats;
  partner: StudyPersonStats | null;
}) {
  /*
   * Thang đo CHUNG cho cả hai người. Mỗi người một thang riêng thì hai cột cao
   * bằng nhau lại đang là 20 phút và 3 tiếng — nhìn vào hiểu ngược hoàn toàn.
   */
  const peak = Math.max(
    1,
    ...me.days.map((d) => d.minutes),
    ...(partner?.days ?? []).map((d) => d.minutes),
  );

  return (
    <section className="card mt-3.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          7 ngày qua
        </p>
        <span className="text-[11.5px] text-ink-400">cao nhất {formatMinutes(peak)}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-1.5">
        {me.days.map((d, i) => {
          const theirs = partner?.days[i]?.minutes ?? 0;
          const isToday = i === me.days.length - 1;
          return (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-[86px] w-full items-end justify-center gap-[3px]">
                <Bar
                  heightPct={Math.round((d.minutes / peak) * 100)}
                  minutes={d.minutes}
                  className="bg-gradient-to-t from-[#FF4D7D] to-[#FF9BB3]"
                  title={`Bạn · ${dayLabel(d.day)} · ${formatMinutes(d.minutes)}`}
                />
                {partner && (
                  <Bar
                    heightPct={Math.round((theirs / peak) * 100)}
                    minutes={theirs}
                    className="bg-gradient-to-t from-[#4D7DFF] to-[#8FB8FF]"
                    title={`${partner.displayName} · ${dayLabel(d.day)} · ${formatMinutes(theirs)}`}
                  />
                )}
              </div>
              <span
                className={`text-[10.5px] ${isToday ? 'font-extrabold text-ink-900' : 'text-ink-400'}`}
              >
                {weekdayLabel(d.day)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-4 text-[11.5px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-full bg-[#FF4D7D]" /> Bạn
        </span>
        {partner && (
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-full bg-[#4D7DFF]" /> {partner.displayName}
          </span>
        )}
      </div>
    </section>
  );
}

function Bar({
  heightPct,
  minutes,
  className,
  title,
}: {
  heightPct: number;
  minutes: number;
  className: string;
  title: string;
}) {
  return (
    <i
      role="img"
      title={title}
      aria-label={title}
      className={`block w-full max-w-[14px] rounded-t-[4px] ${minutes > 0 ? className : 'bg-ink-100'}`}
      /*
        Ngày không học vẫn để lại vạch 3px: cột biến mất hẳn trông như lỗi hiển
        thị chứ không như "hôm đó nghỉ".
      */
      style={{ height: minutes > 0 ? `max(6px, ${heightPct}%)` : '3px' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Phân bổ theo môn
// ---------------------------------------------------------------------------

function SubjectBreakdown({ person }: { person: StudyPersonStats }) {
  const total = person.subjects.reduce((sum, s) => sum + s.minutes, 0);
  if (total === 0) return null;

  return (
    <section className="card mt-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
        Bạn học môn gì
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        {person.subjects.slice(0, 6).map((s) => {
          const pct = Math.round((s.minutes / total) * 100);
          return (
            <div key={s.subject ?? '__khong_ten__'}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="min-w-0 flex-1 truncate text-[13.5px]">
                  {s.subject ?? 'Không đặt tên'}
                </b>
                <span className="shrink-0 text-[12px] text-ink-500">
                  {formatMinutes(s.minutes)} · {pct}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                <i
                  className="block h-full rounded-full bg-gradient-to-r from-[#FF4D7D] to-[#B14BE8]"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tổng cộng
// ---------------------------------------------------------------------------

function Totals({
  me,
  partner,
  togetherMinutes,
}: {
  me: StudyPersonStats | null;
  partner: StudyPersonStats | null;
  togetherMinutes: number;
}) {
  const people = [me, partner].filter((p): p is StudyPersonStats => p !== null);
  if (people.length === 0) return null;

  return (
    <section className="card mt-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
        Tổng cộng
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        {people.map((p) => (
          <div key={p.userId} className="flex items-center gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white ${
                p === me
                  ? 'bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D]'
                  : 'bg-gradient-to-br from-[#8FB8FF] to-[#4D7DFF]'
              }`}
            >
              {p.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px]">{p === me ? 'Bạn' : p.displayName}</b>
              <p className="text-[11.5px] text-ink-500">
                Hôm nay {formatMinutes(p.todayMinutes)} · tổng {formatMinutes(p.totalMinutes)}
              </p>
            </div>
            {p.streakDays > 0 && (
              <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[11.5px] font-bold text-ink-600">
                🔥 {p.streakDays} ngày
              </span>
            )}
          </div>
        ))}
      </div>

      {togetherMinutes > 0 && (
        <p className="mt-3 rounded-2xl bg-mint-100 px-3.5 py-2.5 text-[12.5px] text-[#03372A]">
          🤝 Đã ngồi học cùng nhau <b>{formatMinutes(togetherMinutes)}</b>
        </p>
      )}
    </section>
  );
}
