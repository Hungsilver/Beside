import { type StudyPersonStats } from '@beside/shared';
import { formatMinutes } from '@/lib/study-format';

/**
 * So kè tuần này giữa hai người.
 *
 * "Xếp hạng" giữa đúng hai người thì không phải bảng xếp hạng mà là một trận
 * so kè — nên vẽ thành MỘT thanh chia đôi theo tỉ lệ, không phải hai thanh
 * cạnh nhau. Một thanh đọc ra ngay ai đang hơn; hai thanh thì phải nhẩm.
 *
 * Không tự tính lại từ server: `days[]` của mỗi người đã có sẵn trong bản tổng
 * hợp, cộng ở client là đủ và không tốn thêm lượt gọi nào.
 */
export default function StudyVersus({
  me,
  partner,
}: {
  me: StudyPersonStats;
  partner: StudyPersonStats;
}) {
  const mine = sumMinutes(me);
  const theirs = sumMinutes(partner);
  const total = mine + theirs;

  // Cả hai cùng 0 phút thì không có gì để so — một thanh trống và hai số 0 chỉ
  // làm người ta thấy mình tệ vào đúng thứ Hai đầu tuần.
  if (total === 0) return null;

  const minePct = (mine / total) * 100;
  const diff = Math.abs(mine - theirs);
  const leader = mine === theirs ? null : mine > theirs ? 'me' : 'partner';

  return (
    <section className="card mt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Tuần này
        </p>
        <span className="text-[11.5px] text-ink-400">
          {leader === null
            ? 'Ngang nhau'
            : `Hơn ${formatMinutes(diff)}`}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Side
          name="Bạn"
          minutes={mine}
          streak={me.streakDays}
          crown={leader === 'me'}
          align="left"
        />
        <Side
          name={partner.displayName}
          minutes={theirs}
          streak={partner.streakDays}
          crown={leader === 'partner'}
          align="right"
        />
      </div>

      <div
        role="img"
        aria-label={`Tuần này bạn học ${formatMinutes(mine)}, ${partner.displayName} học ${formatMinutes(theirs)}`}
        className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-ink-100"
      >
        {/* Chặn 4% mỗi bên: phía học ít hơn hẳn vẫn phải còn nhìn thấy được,
            một dải rộng 0px trông như dữ liệu bị thiếu. */}
        <i
          className="block bg-gradient-to-r from-[#FF9BB3] to-[#FF4D7D]"
          style={{ width: `${clampShare(minePct)}%` }}
        />
        <i className="block flex-1 bg-gradient-to-r from-[#4D7DFF] to-[#8FB8FF]" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Side({
  name,
  minutes,
  streak,
  crown,
  align,
}: {
  name: string;
  minutes: number;
  streak: number;
  crown: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`min-w-0 flex-1 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="truncate text-[12px] font-bold text-ink-500">
        {crown ? '👑 ' : ''}
        {name}
      </p>
      <b className="mt-0.5 block text-[16px] leading-tight">{formatMinutes(minutes)}</b>
      {streak > 0 && (
        <span className="mt-0.5 inline-block text-[11px] text-ink-400">🔥 {streak} ngày</span>
      )}
    </div>
  );
}

function sumMinutes(p: StudyPersonStats): number {
  return p.days.reduce((sum, d) => sum + d.minutes, 0);
}

/** Giữ mỗi bên trong khoảng 4–96% để bên yếu thế vẫn hiện ra một vệt. */
function clampShare(pct: number): number {
  if (!Number.isFinite(pct)) return 50;
  return Math.min(96, Math.max(4, pct));
}
