import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BREAK_OPTIONS,
  DEFAULT_BREAK_MIN,
  DEFAULT_FOCUS_MIN,
  DEFAULT_LONG_BREAK_MIN,
  FOCUS_OPTIONS,
  LONG_BREAK_OPTIONS,
  MAX_SUBJECT_LEN,
  ROUNDS_PER_LONG_BREAK,
  STUDY_PHASE_LABELS,
  STUDY_SUBJECT_PRESETS,
  normalizeSubject,
  type StudyCheerCode,
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
import FlipClock from '@/components/FlipClock';
import StudyCheerBar, { CheerToast } from '@/components/StudyCheer';
import StudyDDays from '@/components/StudyDDays';
import StudyNoise from '@/components/StudyNoise';
import StudyNotes from '@/components/StudyNotes';
import StudyStats from '@/components/StudyStats';
import StudyTasks from '@/components/StudyTasks';
import StudyTimeline from '@/components/StudyTimeline';
import StudyVersus from '@/components/StudyVersus';
import TabBar from '@/components/TabBar';
import { useNoise } from '@/lib/use-noise';
import { Screen, Spinner } from '@/components/ui';

export default function StudyScreen() {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const summary = useStudySummary();
  const session = summary.data?.current ?? null;
  // Nghe ngay cả khi chưa có phiên: người kia bấm bắt đầu là mình thấy liền.
  const channel = useStudyChannel(myId);
  // Đặt ở màn, không ở `ActiveRoom`: phiên kết thúc thì `ActiveRoom` bị gỡ khỏi
  // cây, và tiếng nền sẽ tắt phụt ngay giữa lúc người ta đang nghỉ.
  const noise = useNoise();

  const [error, setError] = useState<string | null>(null);

  if (summary.isLoading) return <Spinner label="Đang mở phòng học..." />;

  const people = summary.data?.people ?? [];
  const me = people.find((p) => p.userId === myId) ?? null;
  const partner = people.find((p) => p.userId !== myId) ?? null;

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
        <ActiveRoom
          session={session}
          myId={myId}
          onError={setError}
          onCheer={channel.sendCheer}
          canCheer={channel.connected}
        />
      ) : (
        <StartRoom onError={setError} lastSubject={lastSubjectOf(me)} />
      )}

      <StudyNoise noise={noise} />

      {/*
        Thứ tự trên màn là thứ tự người ta cần tới: hỏi về chặng vừa xong (chỉ
        hiện ngay sau khi học) → việc đang làm dở → mốc đang đếm ngược → thống
        kê. Thống kê đứng cuối vì nó để nhìn lại, không phải để hành động.
      */}
      <StudyNotes
        pending={summary.data?.pendingNote ?? null}
        recent={summary.data?.recentNotes ?? []}
      />

      <StudyTasks tasks={summary.data?.tasks ?? []} />

      <StudyDDays
        ddays={summary.data?.ddays ?? []}
        myId={myId}
        partnerName={partner?.displayName ?? null}
      />

      {me && partner && <StudyVersus me={me} partner={partner} />}

      <StudyTimeline
        blocks={summary.data?.timeline ?? []}
        myId={myId}
        partnerName={partner?.displayName ?? null}
      />

      <StudyStats
        me={me}
        partner={partner}
        togetherMinutes={summary.data?.togetherMinutes ?? 0}
      />

      <Link to="/" className="btn-ghost mt-3.5 w-full">
        Về trang chủ
      </Link>

      <div className="flex-1" />
      <div className="h-[100px]" />
      <CheerToast cheer={channel.cheer} />
      <TabBar />
    </Screen>
  );
}

/**
 * Môn học nhiều phút nhất tuần qua — dùng làm gợi ý điền sẵn.
 *
 * Người ta ôn một môn trong nhiều buổi liền, nên đoán "vẫn môn cũ" đúng nhiều
 * hơn sai. Vẫn sửa được, chỉ là đỡ phải gõ.
 */
function lastSubjectOf(me: StudyPersonStats | null): string | null {
  return me?.subjects.find((s) => s.subject !== null)?.subject ?? null;
}

// ---------------------------------------------------------------------------

function StartRoom({
  onError,
  lastSubject,
}: {
  onError: (m: string | null) => void;
  lastSubject: string | null;
}) {
  const start = useStartStudy();
  const [focusMin, setFocusMin] = useState<number>(DEFAULT_FOCUS_MIN);
  const [breakMin, setBreakMin] = useState<number>(DEFAULT_BREAK_MIN);
  const [longBreakMin, setLongBreakMin] = useState<number>(DEFAULT_LONG_BREAK_MIN);
  const [subject, setSubject] = useState<string>(lastSubject ?? '');

  async function begin() {
    onError(null);
    try {
      await start.mutateAsync({
        focusMin,
        breakMin,
        longBreakMin,
        subject: normalizeSubject(subject),
      });
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
        <label htmlFor="study-subject" className="text-[11.5px] font-bold text-ink-700">
          Học gì?
        </label>
        <input
          id="study-subject"
          type="text"
          value={subject}
          maxLength={MAX_SUBJECT_LEN}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Bỏ trống cũng được"
          className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
        />

        {/*
          Danh sách gợi ý cuộn ngang: 12 môn xếp thành lưới trên khung 390px sẽ
          chiếm gần nửa màn, đẩy nút "bắt đầu" xuống dưới nếp gấp.
        */}
        <div className="-mx-[18px] mt-2 flex gap-2 overflow-x-auto px-[18px] pb-1">
          {STUDY_SUBJECT_PRESETS.map((p) => {
            const active = normalizeSubject(subject) === p.label;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                // Bấm lại chính môn đang chọn thì bỏ chọn — không cần nút xoá riêng.
                onClick={() => setSubject(active ? '' : p.label)}
                className={`h-11 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition ${
                  active
                    ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300'
                    : 'bg-ink-100 text-ink-600'
                }`}
              >
                {p.emoji} {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
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

      <div className="mt-3">
        <span className="text-[11.5px] font-bold text-ink-700">
          Nghỉ dài sau {ROUNDS_PER_LONG_BREAK} chặng
        </span>
        <div className="mt-2 flex gap-2">
          {LONG_BREAK_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLongBreakMin(m)}
              aria-pressed={longBreakMin === m}
              className={`h-11 flex-1 rounded-2xl text-[14px] font-bold transition ${
                longBreakMin === m
                  ? 'bg-love-100 text-love-700 ring-[1.5px] ring-love-300'
                  : 'bg-ink-100 text-ink-600'
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
  onCheer,
  canCheer,
}: {
  session: StudySessionResponse;
  myId: string | null;
  onError: (m: string | null) => void;
  onCheer: (code: StudyCheerCode) => boolean;
  canCheer: boolean;
}) {
  const join = useJoinStudy();
  const leave = useLeaveStudy();
  const cancel = useCancelStudy();
  const [confirmStop, setConfirmStop] = useState(false);

  const secondsLeft = useSecondsLeft(session.endsAt);
  const inRoom = myId !== null && session.presentUserIds.includes(myId);
  const focus = session.phase === 'FOCUS';

  // Chặng nghỉ DÀI dùng mốc khác — lấy nhầm `breakMin` thì thanh tiến độ chạy
  // hết trong 5 phút rồi đứng im suốt 10 phút còn lại.
  const phaseMin = focus
    ? session.focusMin
    : session.longBreak
      ? session.longBreakMin
      : session.breakMin;
  const totalSec = phaseMin * 60;
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
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold tracking-[1.2px] opacity-90">
          {(session.longBreak ? 'Nghỉ dài' : STUDY_PHASE_LABELS[session.phase]).toUpperCase()}
          {session.roundsDone > 0 && ` · CHẶNG ${session.roundsDone + (focus ? 1 : 0)}`}
        </p>
        {session.subject && (
          <span className="min-w-0 truncate rounded-full bg-white/25 px-2.5 py-1 text-[11.5px] font-bold">
            {session.subject}
          </span>
        )}
      </div>

      <div className="mt-3">
        <FlipClock seconds={secondsLeft} />
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

      {/* Chỉ có nghĩa khi có người kia ở đầu bên kia để mà nhận. */}
      {session.presentUserIds.length >= 2 && (
        <StudyCheerBar onSend={onCheer} disabled={!canCheer} />
      )}

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
