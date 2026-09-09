import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BREAK_OPTIONS,
  DEFAULT_BREAK_MIN,
  DEFAULT_FOCUS_MIN,
  FOCUS_OPTIONS,
  STUDY_PHASE_LABELS,
  type StudyPersonStats,
  type StudySessionResponse,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import {
  useCancelStudy,
  useJoinStudy,
  useLeaveStudy,
  useSecondsLeft,
  useStartStudy,
  useStudyChannel,
  useStudySummary,
} from '@/lib/study-api';
import TabBar from '@/components/TabBar';
import { Screen, Spinner } from '@/components/ui';

export default function StudyScreen() {
  const { user } = useAuth();
  const summary = useStudySummary();
  const session = summary.data?.current ?? null;
  // Nghe ngay cả khi chưa có phiên: người kia bấm bắt đầu là mình thấy liền.
  useStudyChannel();

  const [error, setError] = useState<string | null>(null);

  if (summary.isLoading) return <Spinner label="Đang mở phòng học..." />;

  const myId = user?.id ?? null;

  return (
    <Screen>
      <header className="py-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Ngồi học cùng nhau
        </p>
        <h1 className="text-[24px] font-extrabold tracking-tight">Phòng học</h1>
      </header>

      {error && (
        <p role="alert" className="mb-3 text-[12.5px] font-semibold text-love-600">
          {error}
        </p>
      )}

      {session ? (
        <ActiveRoom session={session} myId={myId} onError={setError} />
      ) : (
        <StartRoom onError={setError} />
      )}

      <Stats people={summary.data?.people ?? []} myId={myId} together={summary.data?.togetherMinutes ?? 0} />

      <div className="flex-1" />
      <div className="h-[100px]" />
      <TabBar />
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function StartRoom({ onError }: { onError: (m: string | null) => void }) {
  const start = useStartStudy();
  const [focusMin, setFocusMin] = useState<number>(DEFAULT_FOCUS_MIN);
  const [breakMin, setBreakMin] = useState<number>(DEFAULT_BREAK_MIN);

  async function begin() {
    onError(null);
    try {
      await start.mutateAsync({ focusMin, breakMin });
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Không mở được phòng học');
    }
  }

  return (
    <section className="card">
      <p className="text-[13.5px] leading-relaxed text-ink-500">
        Bấm bắt đầu là người ấy nhận được thông báo và vào học cùng. Đồng hồ chạy chung
        trên cả hai máy.
      </p>

      <div className="mt-4">
        <span className="text-[11.5px] font-bold text-ink-700">Học bao lâu?</span>
        <div className="mt-2 flex gap-2">
          {FOCUS_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFocusMin(m)}
              aria-pressed={focusMin === m}
              className={`h-11 flex-1 rounded-2xl text-[14px] font-bold transition ${
                focusMin === m ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {m} phút
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="text-[11.5px] font-bold text-ink-700">Nghỉ bao lâu?</span>
        <div className="mt-2 flex gap-2">
          {BREAK_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setBreakMin(m)}
              aria-pressed={breakMin === m}
              className={`h-11 flex-1 rounded-2xl text-[14px] font-bold transition ${
                breakMin === m ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {m} phút
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={start.isPending}
        onClick={() => void begin()}
        className="btn-primary mt-4 w-full disabled:opacity-50"
      >
        {start.isPending ? 'Đang mở phòng...' : '📚 Bắt đầu học'}
      </button>

      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-ink-400">
        Khoá màn hình để khỏi bị phân tâm cũng được — đồng hồ vẫn chạy, hết giờ sẽ có
        thông báo.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ActiveRoom({
  session,
  myId,
  onError,
}: {
  session: StudySessionResponse;
  myId: string | null;
  onError: (m: string | null) => void;
}) {
  const join = useJoinStudy();
  const leave = useLeaveStudy();
  const cancel = useCancelStudy();
  const [confirmStop, setConfirmStop] = useState(false);

  const secondsLeft = useSecondsLeft(session.endsAt);
  const inRoom = myId !== null && session.presentUserIds.includes(myId);
  const focus = session.phase === 'FOCUS';

  const totalSec = (focus ? session.focusMin : session.breakMin) * 60;
  const progress = totalSec > 0 ? Math.min(100, ((totalSec - secondsLeft) / totalSec) * 100) : 0;

  async function act(fn: () => Promise<unknown>, fallback: string) {
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : fallback);
    }
  }

  return (
    <section
      className={`rounded-[var(--radius-hero)] p-5 text-white ${focus ? 'love-gradient' : 'dusk-gradient'}`}
    >
      <p className="text-[12px] font-bold tracking-[1.2px] opacity-90">
        {STUDY_PHASE_LABELS[session.phase].toUpperCase()}
        {session.roundsDone > 0 && ` · CHẶNG ${session.roundsDone + (focus ? 1 : 0)}`}
      </p>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[54px] font-extrabold leading-none tabular-nums tracking-tight">
          {formatClock(secondsLeft)}
        </span>
      </div>

      <div className="mt-4 h-[7px] overflow-hidden rounded-full bg-white/30">
        <i className="block h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
      </div>

      <p className="mt-3 text-[12.5px] opacity-90">
        {session.presentUserIds.length >= 2
          ? '🤝 Cả hai đang cùng học'
          : inRoom
            ? 'Bạn đang học một mình — chờ người ấy vào'
            : 'Người ấy đang học'}
      </p>

      <div className="mt-4 flex gap-2">
        {!inRoom && (
          <button
            type="button"
            disabled={join.isPending}
            onClick={() => void act(() => join.mutateAsync(session.id), 'Không vào được phòng')}
            className="h-11 flex-1 rounded-2xl bg-white text-[14px] font-bold text-love-600 disabled:opacity-50"
          >
            {join.isPending ? 'Đang vào...' : 'Vào học cùng'}
          </button>
        )}

        {inRoom &&
          (confirmStop ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmStop(false)}
                className="h-11 flex-1 rounded-2xl bg-white/25 text-[13px] font-bold"
              >
                Học tiếp
              </button>
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => void act(() => cancel.mutateAsync(session.id), 'Không dừng được')}
                className="h-11 flex-1 rounded-2xl bg-white text-[13px] font-bold text-love-600 disabled:opacity-50"
              >
                Dừng hẳn
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={leave.isPending}
                onClick={() => void act(() => leave.mutateAsync(session.id), 'Không rời được')}
                className="h-11 flex-1 rounded-2xl bg-white/25 text-[13px] font-bold"
              >
                Rời phòng
              </button>
              <button
                type="button"
                onClick={() => setConfirmStop(true)}
                className="h-11 flex-1 rounded-2xl bg-white/25 text-[13px] font-bold"
              >
                Dừng buổi học
              </button>
            </>
          ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Stats({
  people,
  myId,
  together,
}: {
  people: StudyPersonStats[];
  myId: string | null;
  together: number;
}) {
  if (people.length === 0) return null;

  return (
    <section className="card mt-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
        Đã học được
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        {people.map((p) => (
          <div key={p.userId} className="flex items-center gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white ${
                p.userId === myId
                  ? 'bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D]'
                  : 'bg-gradient-to-br from-[#8FB8FF] to-[#4D7DFF]'
              }`}
            >
              {p.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px]">
                {p.userId === myId ? 'Bạn' : p.displayName}
              </b>
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

      {together > 0 && (
        <p className="mt-3 rounded-2xl bg-mint-100 px-3.5 py-2.5 text-[12.5px] text-[#03372A]">
          🤝 Đã ngồi học cùng nhau <b>{formatMinutes(together)}</b>
        </p>
      )}

      <Link to="/" className="btn-ghost mt-3 w-full">
        Về trang chủ
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** `mm:ss`, hoặc `h:mm:ss` khi chặng dài hơn một giờ. */
function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}
