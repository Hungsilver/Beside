import { type StudyTimelineBlock } from '@beside/shared';
import { buildAxis, formatClock, formatHour, formatShortDuration } from '@/lib/study-format';


/**
 * Dải thời gian hôm nay — học vào những giờ nào.
 *
 * Trả lời một câu mà biểu đồ tuần không trả lời được: "mình học dồn cục lúc
 * nửa đêm hay rải đều trong ngày". Hai hàng riêng cho hai người, cùng một trục,
 * nên nhìn phát ra ngay hai người có ngồi cùng khung giờ hay không.
 */
export default function StudyTimeline({
  blocks,
  myId,
  partnerName,
}: {
  blocks: StudyTimelineBlock[];
  myId: string | null;
  partnerName: string | null;
}) {
  if (blocks.length === 0) return null;

  const mine = blocks.filter((b) => b.userId === myId);
  const theirs = blocks.filter((b) => b.userId !== myId);

  /*
   * Khung giờ hiển thị co theo dữ liệu thật, không phải lúc nào cũng 0–24h.
   *
   * Vẽ đủ 24 tiếng thì một buổi học 50 phút chỉ còn là một vạch 8px trên khung
   * 390px — đúng về tỉ lệ nhưng chẳng đọc được gì. Lùi ra mỗi bên một tiếng cho
   * khối đầu và khối cuối có chỗ thở.
   */
  const earliest = Math.min(...blocks.map((b) => b.startMin));
  const latest = Math.max(...blocks.map((b) => b.endMin));
  const { from, to, span, ticks } = buildAxis(earliest, latest);

  const totalMine = mine.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const totalTheirs = theirs.reduce((s, b) => s + (b.endMin - b.startMin), 0);

  return (
    <section className="card mt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Hôm nay học lúc nào
        </p>
        <span className="text-[11.5px] text-ink-400">
          {formatHour(from)}–{formatHour(to)}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Row
          label="Bạn"
          total={totalMine}
          blocks={mine}
          from={from}
          span={span}
          barClass="bg-gradient-to-r from-[#FF4D7D] to-[#FF9BB3]"
        />
        {partnerName !== null && (
          <Row
            label={partnerName}
            total={totalTheirs}
            blocks={theirs}
            from={from}
            span={span}
            barClass="bg-gradient-to-r from-[#4D7DFF] to-[#8FB8FF]"
          />
        )}
      </div>

      {/*
        Vạch giờ. `justify-between` rải đều bốn nhãn từ mép này sang mép kia,
        nên `buildAxis()` phải đảm bảo khung chia HẾT cho ba khoảng — nếu không
        nhãn cuối nằm ở 100% trong khi giờ nó chỉ tay tới nằm ở 90%, và cả trục
        nói dối.
      */}
      <div className="ml-[52px] mr-[64px] mt-1.5 flex justify-between text-[10.5px] text-ink-300">
        {ticks.map((m) => (
          <span key={m}>{formatHour(m)}</span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Row({
  label,
  total,
  blocks,
  from,
  span,
  barClass,
}: {
  label: string;
  total: number;
  blocks: StudyTimelineBlock[];
  from: number;
  span: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[44px] shrink-0 truncate text-[11px] font-bold text-ink-500">
        {label}
      </span>
      <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-lg bg-ink-100">
        {blocks.map((b) => {
          const left = ((b.startMin - from) / span) * 100;
          const width = ((b.endMin - b.startMin) / span) * 100;
          return (
            <i
              key={`${b.startMin}-${b.endMin}`}
              role="img"
              title={`${formatClock(b.startMin)}–${formatClock(b.endMin)}${
                b.subject ? ` · ${b.subject}` : ''
              }`}
              aria-label={`${label}: ${formatClock(b.startMin)} đến ${formatClock(b.endMin)}`}
              className={`absolute inset-y-0 rounded-[3px] ${barClass}`}
              /* Chặn dưới 2px: một chặng 15 phút trên khung hẹp có thể ra chưa
                 tới 1px và biến mất hẳn — trông như hôm đó không học. */
              style={{ left: `${left}%`, width: `max(2px, ${width}%)` }}
            />
          );
        })}
      </div>
      {/* Dạng NGẮN ("1h40") chứ không "1 giờ 40 phút": cột này rộng 56px, chuỗi
          dài sẽ xuống hai dòng và đẩy cả hàng cao lên. */}
      <span className="w-[56px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-400">
        {total > 0 ? formatShortDuration(total) : '—'}
      </span>
    </div>
  );
}
