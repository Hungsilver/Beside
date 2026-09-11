import { useState } from 'react';
import { MAX_TASK_TITLE_LEN, type StudyTaskResponse } from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/lib/study-api';

/**
 * Việc cần làm — danh sách riêng của mình, không chia sẻ.
 *
 * Việc CHƯA XONG không biến mất lúc nửa đêm (server trả cả việc cũ chưa xong),
 * nhưng phải nói rõ nó là nợ từ hôm trước. Nằm lẫn trong danh sách hôm nay mà
 * không đánh dấu thì người ta tưởng mình vừa đặt ra nó sáng nay.
 */
export default function StudyTasks({ tasks }: { tasks: StudyTaskResponse[] }) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : fallback);
    }
  }

  async function add() {
    const value = title.trim();
    if (value.length === 0) return;
    // Xoá ô NGAY, không chờ server: ô còn chữ sau khi bấm trông như bị kẹt, và
    // người dùng sẽ bấm lần nữa — thành hai việc giống hệt nhau.
    setTitle('');
    await run(() => create.mutateAsync({ title: value }), 'Không thêm được việc này');
  }

  return (
    <section className="card mt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Việc cần làm
        </p>
        {tasks.length > 0 && (
          <span className="text-[11.5px] text-ink-400">
            {done.length}/{tasks.length} xong
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={title}
          maxLength={MAX_TASK_TITLE_LEN}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Bàn phím ảo trên điện thoại chỉ có phím "xong" — không có nút nào
            // khác để gửi, nên Enter phải nhận.
            if (e.key === 'Enter') void add();
          }}
          placeholder="Thêm việc cho hôm nay..."
          aria-label="Việc cần làm mới"
          className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
        />
        <button
          type="button"
          disabled={create.isPending || title.trim().length === 0}
          onClick={() => void add()}
          aria-label="Thêm việc"
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-love-100 text-[20px] font-bold text-love-700 disabled:opacity-40"
        >
          +
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
          Chưa có việc nào. Viết ra ba việc trước khi bấm học — hết giờ sẽ biết mình đã đi
          tới đâu.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {[...open, ...done].map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={update.isPending}
                aria-pressed={t.done}
                onClick={() =>
                  void run(
                    () => update.mutateAsync({ id: t.id, done: !t.done }),
                    'Không đổi được trạng thái',
                  )
                }
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={`flex size-[22px] shrink-0 items-center justify-center rounded-lg border-[1.5px] text-[13px] font-bold text-white transition ${
                    t.done ? 'border-love-500 bg-love-500' : 'border-ink-300'
                  }`}
                >
                  {t.done ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[14px] ${
                      t.done ? 'text-ink-400 line-through' : ''
                    }`}
                  >
                    {t.title}
                  </span>
                  {t.carriedOver && (
                    <span className="block text-[11px] text-ink-400">
                      còn lại từ {formatDayShort(t.day)}
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                disabled={remove.isPending}
                onClick={() =>
                  void run(() => remove.mutateAsync(t.id), 'Không xoá được việc này')
                }
                aria-label={`Xoá việc ${t.title}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-[14px] text-ink-300 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** `2026-09-10` → `10/09`. Khoá hỏng thì trả nguyên chuỗi. */
function formatDayShort(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
}
