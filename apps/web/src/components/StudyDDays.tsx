import { useState } from 'react';
import {
  MAX_DDAYS_PER_USER,
  MAX_DDAY_TITLE_LEN,
  formatDDayBadge,
  formatDaysLeft,
  type StudyDDayResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCreateDDay, useDeleteDDay } from '@/lib/study-api';

/**
 * Mốc đếm ngược — "còn 12 ngày nữa thi".
 *
 * Mốc của cả hai người đều hiện. Mốc của mình xoá được, mốc của người ấy thì
 * không: đó là thứ người ta tự đặt ra cho mình, mình chỉ nên nhìn thấy để biết
 * mà nhường lúc người ta cần yên tĩnh.
 *
 * Số ngày do SERVER tính. Máy người dùng có thể lệch giờ hoặc sai múi giờ, mà
 * "còn mấy ngày nữa thi" thì không được phép sai.
 */
export default function StudyDDays({
  ddays,
  myId,
  partnerName,
}: {
  ddays: StudyDDayResponse[];
  myId: string | null;
  partnerName: string | null;
}) {
  const create = useCreateDDay();
  const remove = useDeleteDDay();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mineCount = ddays.filter((d) => d.userId === myId).length;
  const full = mineCount >= MAX_DDAYS_PER_USER;

  async function add() {
    setError(null);
    try {
      await create.mutateAsync({ title: title.trim(), date });
      setTitle('');
      setDate('');
      setAdding(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không lưu được mốc này');
    }
  }

  async function drop(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không xoá được mốc này');
    }
  }

  return (
    <section className="card mt-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Đếm ngược
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setError(null);
          }}
          disabled={full && !adding}
          aria-expanded={adding}
          className="-mr-1 h-9 rounded-full px-3 text-[12.5px] font-bold text-love-600 disabled:text-ink-300"
        >
          {adding ? 'Đóng' : full ? `Đủ ${MAX_DDAYS_PER_USER} mốc` : '+ Thêm mốc'}
        </button>
      </div>

      {ddays.length === 0 && !adding && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-400">
          Chưa có mốc nào. Đặt ngày thi hoặc hạn nộp bài để thấy nó đếm ngược mỗi lần mở
          phòng học.
        </p>
      )}

      {ddays.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {ddays.map((d) => {
            const mine = d.userId === myId;
            // Đã qua thì lùi hẳn về sau: nó chỉ còn là dấu vết, không phải thứ
            // đang thúc người ta học.
            const past = d.daysLeft < 0;
            const soon = d.daysLeft >= 0 && d.daysLeft <= 7;
            return (
              <li key={d.id} className="flex items-center gap-3">
                <span
                  className={`flex h-11 min-w-[62px] shrink-0 items-center justify-center rounded-2xl px-2 text-[13px] font-extrabold tabular-nums ${
                    past
                      ? 'bg-ink-100 text-ink-400'
                      : soon
                        ? 'love-gradient text-white'
                        : 'bg-love-50 text-love-700'
                  }`}
                >
                  {formatDDayBadge(d.daysLeft)}
                </span>

                <div className="min-w-0 flex-1">
                  <b className={`block truncate text-[13.5px] ${past ? 'text-ink-400' : ''}`}>
                    {d.title}
                  </b>
                  <p className="text-[11.5px] text-ink-500">
                    {formatDate(d.date)} · {formatDaysLeft(d.daysLeft)}
                    {!mine && partnerName ? ` · của ${partnerName}` : ''}
                  </p>
                </div>

                {mine && (
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => void drop(d.id)}
                    aria-label={`Xoá mốc ${d.title}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] text-ink-400 disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-3 border-t border-black/[0.05] pt-3">
          <label htmlFor="dday-title" className="text-[11.5px] font-bold text-ink-700">
            Mốc gì?
          </label>
          <input
            id="dday-title"
            type="text"
            value={title}
            maxLength={MAX_DDAY_TITLE_LEN}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thi cuối kỳ Giải tích"
            className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
          />

          <label htmlFor="dday-date" className="mt-3 block text-[11.5px] font-bold text-ink-700">
            Ngày nào?
          </label>
          <input
            id="dday-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
          />

          <button
            type="button"
            // Ngày rỗng vẫn gửi đi thì server trả lỗi định dạng — chặn ở đây để
            // người dùng không phải đọc một câu lỗi kỹ thuật cho việc bỏ trống ô.
            disabled={create.isPending || title.trim().length === 0 || date.length === 0}
            onClick={() => void add()}
            className="btn-primary mt-3 w-full disabled:opacity-50"
          >
            {create.isPending ? 'Đang lưu...' : 'Lưu mốc'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** `2026-09-11` → `11/09/2026`. Khoá hỏng thì trả nguyên chuỗi. */
function formatDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}
