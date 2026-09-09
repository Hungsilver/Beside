import { useEffect, useState } from 'react';
import {
  CARO_SIZE,
  cellAt,
  type CaroClientState,
  type CaroMark,
  type GameResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useGameMove } from '@/lib/games-api';

export default function CaroBoard({
  game,
  myId,
  onError,
}: {
  game: GameResponse;
  myId: string | null;
  onError: (message: string | null) => void;
}) {
  const move = useGameMove(game.id);
  const [aim, setAim] = useState<{ r: number; c: number } | null>(null);

  const state = game.state as CaroClientState;
  const playing = game.status === 'PLAYING';
  const myTurn = playing && game.turnUserId === myId;

  // Đối phương vừa đi thì ô đang ngắm không còn nghĩa gì — bỏ chọn để khỏi lỡ
  // tay xác nhận vào một ô vừa bị chiếm mất.
  useEffect(() => {
    setAim(null);
  }, [game.version]);

  async function place() {
    if (!aim || move.isPending || !myTurn) return;
    onError(null);
    try {
      await move.mutateAsync({ version: game.version, move: aim });
      setAim(null);
    } catch (e) {
      onError(e instanceof ApiRequestError ? e.message : 'Không đi được nước này');
    }
  }

  const winLine = new Set((state.winLine ?? []).map((p) => `${p.r}-${p.c}`));

  return (
    <>
      <section className="mt-2.5 flex items-stretch gap-2">
        {game.players.map((p) => (
          <MarkChip
            key={p.userId}
            name={p.userId === myId ? 'Bạn' : p.displayName}
            mark={state.marks[p.userId]}
            active={playing && game.turnUserId === p.userId}
          />
        ))}
      </section>

      {/*
        Bàn 15×15 trong khoảng 350px ⇒ mỗi ô chỉ ~23px, nhỏ hơn mức 44px mà R2
        bắt buộc. Bù bằng CHẠM HAI BƯỚC: chạm lần một chỉ ngắm, nước đi chỉ được
        gửi khi bấm nút "Đặt quân" cỡ 44px ở dưới. Vừa đủ vùng chạm, vừa chặn
        luôn chuyện đánh nhầm ô — mà cờ thì không có nút hoàn tác.
      */}
      <div
        className="mt-3 grid aspect-square w-full overflow-hidden rounded-2xl border border-ink-200 bg-[#F6E7C8]"
        style={{ gridTemplateColumns: `repeat(${CARO_SIZE}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Bàn cờ caro"
      >
        {Array.from({ length: CARO_SIZE * CARO_SIZE }, (_, i) => {
          const r = Math.floor(i / CARO_SIZE);
          const c = i % CARO_SIZE;
          const mark = cellAt(state.board, r, c);
          const isAim = aim?.r === r && aim?.c === c;
          const isLast = state.lastMove?.r === r && state.lastMove?.c === c;

          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              disabled={!myTurn || mark !== '.'}
              onClick={() => setAim({ r, c })}
              aria-label={`Hàng ${r + 1} cột ${c + 1}${mark !== '.' ? `, quân ${mark}` : ''}`}
              className={`relative flex items-center justify-center border-[0.5px] border-[#D9C39B] text-[15px] font-extrabold leading-none ${
                winLine.has(`${r}-${c}`) ? 'bg-mint-100' : isAim ? 'bg-love-200' : ''
              } ${mark === 'X' ? 'text-love-600' : 'text-[#2F5BD9]'}`}
            >
              {mark !== '.' ? mark : ''}
              {isLast && mark !== '.' && (
                <i className="absolute right-[1px] top-[1px] size-1 rounded-full bg-ink-900/60" />
              )}
            </button>
          );
        })}
      </div>

      {playing && (
        <button
          type="button"
          disabled={!aim || !myTurn || move.isPending}
          onClick={() => void place()}
          className="love-gradient mt-3 flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-bold text-white disabled:opacity-40"
        >
          {move.isPending
            ? 'Đang đi...'
            : aim
              ? `Đặt quân ở ${aim.r + 1}·${aim.c + 1}`
              : myTurn
                ? 'Chạm vào bàn để ngắm'
                : 'Chờ người ấy đi'}
        </button>
      )}
    </>
  );
}

function MarkChip({
  name,
  mark,
  active,
}: {
  name: string;
  mark: CaroMark | undefined;
  active: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 transition ${
        active ? 'bg-love-100 ring-[1.5px] ring-love-300' : 'bg-ink-100'
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white ${
          mark === 'X' ? 'bg-love-500' : 'bg-[#2F5BD9]'
        }`}
      >
        {mark ?? '?'}
      </span>
      <b className="truncate text-[13px]">{name}</b>
    </div>
  );
}
