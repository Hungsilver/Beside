import { useEffect, useMemo, useState } from 'react';
import {
  cardLabel,
  checkPlay,
  detectCombo,
  hasAnswer,
  isRedSuit,
  rankOf,
  RANK_LABELS,
  SUIT_LABELS,
  suitOf,
  type GameResponse,
  type TienLenClientState,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useGameMove } from '@/lib/games-api';

type SortMode = 'rank' | 'suit';

export default function TienLenTable({
  game,
  myId,
  onError,
}: {
  game: GameResponse;
  myId: string | null;
  onError: (message: string | null) => void;
}) {
  const move = useGameMove(game.id);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('rank');

  const state = game.state as TienLenClientState;
  const playing = game.status === 'PLAYING';
  const myTurn = playing && game.turnUserId === myId;

  // Ván vừa đổi trạng thái → bỏ chọn. Không làm thì các lá vừa đánh xong vẫn
  // hiện "đang chọn" dù chúng đã rời khỏi tay.
  useEffect(() => {
    setSelected([]);
  }, [game.version]);

  const table = useMemo(
    () => (state.table ? detectCombo(state.table.cards) : null),
    [state.table],
  );

  const hand = useMemo(() => orderHand(state.myHand, sortMode), [state.myHand, sortMode]);

  /*
   * Kiểm bằng CHÍNH hàm luật server dùng làm trọng tài, ngay tại chỗ.
   *
   * Nhờ vậy nút "Đánh" chỉ sáng khi bộ đang chọn thật sự đi được, và khi không
   * đi được thì người chơi đọc được lý do luôn — không phải bấm rồi chờ một
   * vòng mạng mới biết mình sai ở đâu.
   */
  const problem =
    selected.length === 0
      ? null
      : checkPlay(state.myHand, selected, table, state.mustInclude);

  /*
   * Bí thật thì nói thẳng, đừng bắt người ta ngồi mò rồi hết giờ.
   *
   * `hasAnswer` dò qua mọi sảnh và đôi thông dựng được từ 13 lá, nên bọc memo:
   * không thì nó chạy lại sau mỗi lần chạm vào một lá bài.
   */
  const stuck = useMemo(
    () => myTurn && table !== null && !hasAnswer(state.myHand, table),
    [myTurn, table, state.myHand],
  );

  function toggle(card: number) {
    if (!myTurn) return;
    onError(null);
    setSelected((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card],
    );
  }

  async function play() {
    if (!myTurn || move.isPending || selected.length === 0 || problem) return;
    onError(null);
    try {
      await move.mutateAsync({ version: game.version, move: { cards: selected } });
      setSelected([]);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Không đánh được bộ này');
    }
  }

  async function pass() {
    if (!myTurn || move.isPending) return;
    onError(null);
    try {
      await move.mutateAsync({ version: game.version, move: { pass: true } });
      setSelected([]);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Không bỏ lượt được');
    }
  }

  const opponent = game.players.find((p) => p.userId !== myId);

  return (
    <>
      {/* Bài đối phương: CHỈ số lá. Bài thật không bao giờ rời server. */}
      <section className="mt-2.5 flex items-center gap-3 rounded-2xl bg-ink-100 px-4 py-3">
        <div className="flex" aria-hidden>
          {Array.from({ length: Math.min(state.opponentCount, 8) }, (_, i) => (
            <i
              key={i}
              className="h-8 w-4 rounded-[3px] border border-white/70 bg-gradient-to-br from-[#8FB8FF] to-[#4D7DFF]"
              style={{ marginLeft: i === 0 ? 0 : -8 }}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px]">{opponent?.displayName ?? 'Người ấy'}</b>
          <p className="text-[11.5px] text-ink-500">còn {state.opponentCount} lá</p>
        </div>
        {state.opponentPassed && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-ink-600">
            đã bỏ lượt
          </span>
        )}
      </section>

      {/* Bàn giữa */}
      <section className="mt-3 flex min-h-[104px] flex-col items-center justify-center rounded-2xl bg-[#EAF3EC] px-4 py-4">
        {state.table ? (
          <>
            <div className="flex">
              {state.table.cards.map((card, i) => (
                <PlayingCard key={card} card={card} style={{ marginLeft: i === 0 ? 0 : -14 }} />
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-500">
              {state.table.userId === myId ? 'Bạn vừa đánh' : 'Người ấy vừa đánh'}
            </p>
          </>
        ) : (
          <p className="text-center text-[12.5px] leading-relaxed text-ink-500">
            Bàn trống — {myTurn ? 'bạn được ra bài tự do' : 'người ấy đang ra bài'}
            {state.mustInclude !== null && (
              <>
                <br />
                Nước đầu phải có <b>{cardLabel(state.mustInclude)}</b>
              </>
            )}
          </p>
        )}
      </section>

      {/* Lý do không đánh được — nói ngay, không bắt bấm rồi mới biết */}
      {problem && (
        <p className="mt-2 text-center text-[12px] font-semibold text-love-600">
          {problem.message}
        </p>
      )}
      {!problem && stuck && (
        <p className="mt-2 text-center text-[12px] text-ink-500">
          Không có nước nào chặn được — đành bỏ lượt thôi.
        </p>
      )}

      {/* Bài trên tay: xoè quạt, chồng mép nhau */}
      <section className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] text-ink-400">Bài của bạn · {hand.length} lá</span>
          <button
            type="button"
            onClick={() => setSortMode((m) => (m === 'rank' ? 'suit' : 'rank'))}
            className="h-9 rounded-full bg-ink-100 px-3 text-[11.5px] font-bold text-ink-600"
          >
            {sortMode === 'rank' ? '↕ Theo bậc' : '↕ Theo chất'}
          </button>
        </div>

        {/*
          13 lá chồng mép nhau chiếm ~332px — vừa khổ 390px nhưng tràn ở máy
          360px, nên cho phép cuộn ngang thay vì để bài lòi ra khỏi màn hình.
        */}
        <div
          className="-mx-5 flex justify-center overflow-x-auto px-5 pt-4"
          role="group"
          aria-label="Bài trên tay"
        >
          {hand.map((card, i) => {
            const on = selected.includes(card);
            return (
              <button
                key={card}
                type="button"
                disabled={!myTurn}
                onClick={() => toggle(card)}
                aria-pressed={on}
                aria-label={`Lá ${cardLabel(card)}`}
                /*
                 * Lá rộng 44px nhưng chỉ lộ ra 24px vì chồng mép — vùng CHẠM vẫn
                 * đủ 44px theo R2, phần bị che nằm dưới lá kế bên.
                 */
                className={`relative h-16 w-11 shrink-0 rounded-lg border bg-white shadow-[0_1px_4px_rgba(35,19,32,0.15)] transition-transform ${
                  on ? '-translate-y-3.5 border-love-500 ring-[1.5px] ring-love-300' : 'border-ink-200'
                }`}
                // Lá đang chọn phải nổi lên TRÊN các lá bên phải, nếu không phần
                // nhô lên của nó bị lá kế tiếp che mất.
                style={{ marginLeft: i === 0 ? 0 : -20, zIndex: on ? 100 + i : i }}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>
      </section>

      {playing && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!myTurn || !state.table || move.isPending}
            onClick={() => void pass()}
            className="h-12 flex-1 rounded-2xl bg-ink-100 text-[14px] font-bold text-ink-600 disabled:opacity-40"
          >
            Bỏ lượt
          </button>
          <button
            type="button"
            disabled={!myTurn || selected.length === 0 || problem !== null || move.isPending}
            onClick={() => void play()}
            className="love-gradient h-12 flex-[1.4] rounded-2xl text-[15px] font-bold text-white disabled:opacity-40"
          >
            {move.isPending
              ? 'Đang đánh...'
              : myTurn
                ? selected.length > 0
                  ? `Đánh ${selected.length} lá`
                  : 'Chọn bài để đánh'
                : 'Chờ người ấy'}
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function PlayingCard({ card, style }: { card: number; style?: React.CSSProperties }) {
  return (
    <span
      className="relative h-16 w-11 shrink-0 rounded-lg border border-ink-200 bg-white shadow-[0_1px_4px_rgba(35,19,32,0.15)]"
      style={style}
    >
      <CardFace card={card} />
    </span>
  );
}

function CardFace({ card }: { card: number }) {
  const red = isRedSuit(card);
  return (
    <span
      className={`flex size-full flex-col items-center justify-center leading-none ${
        red ? 'text-[#D8232A]' : 'text-ink-900'
      }`}
    >
      <b className="text-[15px]">{RANK_LABELS[rankOf(card)]}</b>
      <span className="mt-0.5 text-[13px]">{SUIT_LABELS[suitOf(card)]}</span>
    </span>
  );
}

/**
 * Xếp bài trên tay.
 *
 * Theo bậc là mặc định (dễ thấy đôi, sám, tứ quý). Theo chất giúp nhìn ra sảnh
 * — hai cách xếp phục vụ hai kiểu tìm bộ khác nhau, nên phải có cả hai.
 */
function orderHand(cards: number[], mode: SortMode): number[] {
  const out = [...cards];
  if (mode === 'rank') return out.sort((a, b) => a - b);
  return out.sort((a, b) => suitOf(a) - suitOf(b) || a - b);
}
