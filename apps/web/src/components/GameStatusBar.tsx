import { GAME_END_LABELS, TURN_MS, type GameResponse } from '@beside/shared';

/**
 * Dòng trạng thái của một ván — chỗ duy nhất trên màn hình giải thích chuyện gì
 * đang xảy ra. Dùng chung cho cả cờ caro lẫn tiến lên.
 *
 * Phải nói rõ khi đồng hồ TẠM DỪNG: một cái đồng hồ đứng im mà không nói vì sao
 * làm người ta tưởng app hỏng rồi thoát ra — mà thoát ra thì đúng là mất lượt thật.
 */
export default function GameStatusBar({
  game,
  myId,
  seconds,
  opponentName,
}: {
  game: GameResponse;
  myId: string | null;
  /** Giây còn lại; `null` = đồng hồ đang tạm dừng. */
  seconds: number | null;
  opponentName: string;
}) {
  const myTurn = game.status === 'PLAYING' && game.turnUserId === myId;

  if (game.status !== 'PLAYING') {
    const label = game.endReason ? GAME_END_LABELS[game.endReason] : 'Đã kết thúc';
    const mine = game.winnerId === myId;
    const draw = game.winnerId === null;

    return (
      <div
        className={`mt-2.5 rounded-2xl px-4 py-3 text-center ${
          draw ? 'bg-ink-100' : mine ? 'bg-mint-100' : 'bg-love-50'
        }`}
      >
        <b className="text-[15px]">
          {draw ? '🤝 Hoà rồi' : mine ? '🎉 Bạn thắng!' : `${opponentName} thắng`}
        </b>
        <p className="mt-0.5 text-[12px] text-ink-500">{label}</p>
      </div>
    );
  }

  if (game.turnDeadlineAt === null) {
    return (
      <div className="mt-2.5 rounded-2xl bg-ink-100 px-4 py-3 text-center">
        <b className="text-[13.5px]">⏸ Đồng hồ đang tạm dừng</b>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
          {myTurn
            ? 'Đang nối lại — bạn không bị mất giờ đâu.'
            : `${opponentName} chưa mở app. Đồng hồ chỉ chạy khi người tới lượt đang xem.`}
        </p>
      </div>
    );
  }

  const shown = seconds ?? Math.round(TURN_MS / 1000);
  const urgent = shown <= 10;

  return (
    <div
      className={`mt-2.5 flex items-center justify-between rounded-2xl px-4 py-3 ${
        myTurn ? 'bg-love-100' : 'bg-ink-100'
      }`}
    >
      <b className="text-[13.5px]">
        {myTurn ? 'Tới lượt bạn' : `Đang chờ ${opponentName}`}
        {game.lastMoveAuto && ' · nước trước hết giờ'}
      </b>
      <span
        className={`text-[17px] font-extrabold tabular-nums ${
          urgent ? 'text-love-600' : 'text-ink-600'
        }`}
        aria-label={`Còn ${shown} giây`}
      >
        {shown}s
      </span>
    </div>
  );
}
