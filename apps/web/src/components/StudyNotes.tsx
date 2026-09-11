import { useState } from 'react';
import { MAX_NOTE_LEN, type StudyNoteResponse } from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useSetLogNote } from '@/lib/study-api';
import { dayLabel, formatMinutes } from '@/lib/study-format';

/**
 * Nhật ký một dòng cho từng chặng học đã xong.
 *
 * Hai phần tách bạch: một câu hỏi cho chặng VỪA XONG mà chưa kịp ghi, và danh
 * sách những dòng đã ghi. Gộp chung thành một ô sửa được ở mọi dòng thì câu hỏi
 * chìm nghỉm — mà đúng lúc chặng vừa kết thúc mới là lúc người ta còn nhớ mình
 * đã làm được gì.
 */
export default function StudyNotes({
  pending,
  recent,
}: {
  /** Chặng vừa xong chưa ghi nhật ký. `null` = không có gì để hỏi. */
  pending: StudyNoteResponse | null;
  recent: StudyNoteResponse[];
}) {
  // Bỏ qua chỉ sống trong phiên xem này: server vẫn coi là chưa ghi, nên tải
  // lại trang thì câu hỏi quay lại — đúng ý, "để lát nữa ghi" chứ không phải
  // "đừng bao giờ hỏi nữa".
  const [skipped, setSkipped] = useState<string | null>(null);

  const ask = pending && pending.logId !== skipped ? pending : null;
  if (!ask && recent.length === 0) return null;

  return (
    <>
      {ask && <NotePrompt log={ask} onSkip={() => setSkipped(ask.logId)} />}

      {recent.length > 0 && (
        <section className="card mt-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            Nhật ký học
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {recent.map((n) => (
              <li key={n.logId} className="border-l-[3px] border-love-200 pl-3">
                <p className="text-[11.5px] text-ink-400">
                  {dayLabel(n.day)} · {formatMinutes(n.minutes)}
                  {n.subject ? ` · ${n.subject}` : ''}
                </p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function NotePrompt({ log, onSkip }: { log: StudyNoteResponse; onSkip: () => void }) {
  const save = useSetLogNote();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = note.trim();
    if (value.length === 0) return;
    setError(null);
    try {
      await save.mutateAsync({ logId: log.logId, note: value });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không lưu được ghi chú');
    }
  }

  return (
    <section className="mt-3.5 rounded-[var(--radius-card)] bg-plum-100 p-[18px]">
      <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-plum-600">
        Chặng vừa xong
      </p>
      <b className="mt-1 block text-[15px]">Bạn vừa làm được gì?</b>
      <p className="mt-0.5 text-[12px] text-ink-500">
        {formatMinutes(log.minutes)}
        {log.subject ? ` · ${log.subject}` : ''} · chặng {log.round}
      </p>

      <textarea
        value={note}
        maxLength={MAX_NOTE_LEN}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Xong 12 bài tích phân từng phần"
        aria-label="Ghi chú cho chặng vừa học"
        className="mt-3 w-full resize-none rounded-2xl border-[1.5px] border-transparent bg-white px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-plum-300"
      />
      <p className="mt-1 text-right text-[11px] text-ink-400">
        {note.length}/{MAX_NOTE_LEN}
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="h-11 flex-1 rounded-2xl bg-white/70 text-[13.5px] font-bold text-ink-600"
        >
          Để lát
        </button>
        <button
          type="button"
          disabled={save.isPending || note.trim().length === 0}
          onClick={() => void submit()}
          className="h-11 flex-1 rounded-2xl bg-plum-500 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          {save.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      )}
    </section>
  );
}
