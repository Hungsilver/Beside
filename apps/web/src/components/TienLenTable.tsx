import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  autoPick,
  cardLabel,
  checkPlay,
  COMBO_LABELS,
  detectCombo,
  GAME_END_LABELS,
  listPlays,
  suitOf,
  type GameResponse,
  type TienLenAction,
  type TienLenClientState,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCountdown, useGameMove, useResign } from '@/lib/games-api';
import { useLandscape } from '@/lib/use-landscape';
import { CardBack, CardFace } from '@/components/PlayingCard';
import { cardHeight, fanLayout, fanWidth, type FanBox } from '@/lib/fan-layout';

type SortMode = 'rank' | 'suit';

/**
 * Bàn Tiến lên — chiếm trọn màn hình, không nằm trong khung 430px như các màn
 * khác. Ván bài cần bề ngang: 13 lá cạnh nhau ở khổ dọc 390px thì mỗi lá chỉ hở
 * hơn hai chục pixel, nhìn không ra chất mà chạm cũng dễ trượt.
 *
 * Ba thứ quyết định cảm giác chơi, và cả ba đều nằm ở component này:
 *
 *   1. **Chạm một lá là chọn xong cả bộ** (`autoPick`) — bàn có đôi 8 thì chạm
 *      một lá 9 lấy luôn đôi 9. Vuốt ngang để tự nhặt nhiều lá.
 *   2. **Bấm xong thấy ngay** — bài rời tay và rơi xuống bàn ngay lúc bấm, không
 *      đợi mạng. Server vẫn là trọng tài, sai thì trả bài về tay kèm lý do.
 *   3. **Nói trước khi bấm** — luật kiểm ngay tại chỗ bằng chính hàm server dùng,
 *      nên nút "Đánh" chỉ sáng khi bộ đang chọn thật sự đi được.
 */
export default function TienLenTable({
  game,
  myId,
}: {
  game: GameResponse;
  myId: string | null;
}) {
  const move = useGameMove(game.id);
  const resign = useResign(game.id);
  const landscape = useLandscape();

  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [hintAt, setHintAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  /**
   * Nước vừa bấm, chưa nghe server trả lời.
   *
   * Đây là toàn bộ cách giảm độ trễ ở phía người chơi: bài rời tay NGAY, không
   * chờ hết một vòng mạng. Không giữ ở cache của TanStack Query mà giữ tại chỗ,
   * vì cache còn là nơi socket đổ state thật vào — trộn hai thứ vào một chỗ thì
   * một gói tin đến muộn sẽ xoá mất nước vừa bấm.
   */
  const [sending, setSending] = useState<TienLenAction | null>(null);

  const state = game.state as TienLenClientState;
  const playing = game.status === 'PLAYING';
  const seconds = useCountdown(playing ? game.turnDeadlineAt : null);

  /** Dòng nhắc xoay máy chỉ sống 8 giây đầu — nhắc mãi thì thành phiền. */
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setHintVisible(false), 8000);
    return () => clearTimeout(id);
  }, []);

  // Ván sang trạng thái mới → bỏ chọn, xoá nước đang gửi (nó đã thành sự thật).
  useEffect(() => {
    setSelected([]);
    setSending(null);
    setHintAt(0);
    setError(null);
  }, [game.version]);

  const sendingCards = sending && 'cards' in sending ? sending.cards : null;

  /** Bài trên tay theo con mắt người chơi: lá vừa đánh đã rời tay rồi. */
  const hand = useMemo(() => {
    const left = sendingCards
      ? state.myHand.filter((c) => !sendingCards.includes(c))
      : state.myHand;
    return orderHand(left, sortMode);
  }, [state.myHand, sendingCards, sortMode]);

  /** Bàn giữa theo con mắt người chơi. Bỏ lượt thì bàn được dọn ngay. */
  const pile = useMemo((): { cards: number[]; mine: boolean } | null => {
    if (sending && 'pass' in sending) return null;
    if (sendingCards) return { cards: sendingCards, mine: true };
    if (!state.table) return null;
    return { cards: state.table.cards, mine: state.table.userId === myId };
  }, [sending, sendingCards, state.table, myId]);

  const table = useMemo(
    () => (state.table ? detectCombo(state.table.cards) : null),
    [state.table],
  );

  const myTurn = playing && game.turnUserId === myId;
  /** Còn nước đang gửi thì coi như đã hết lượt — không cho bấm lần hai. */
  const canAct = myTurn && sending === null && !move.isPending;

  /*
   * Mọi bộ đi được ngay lúc này. Dùng cho cả nút "Gợi ý" lẫn câu "bí thật rồi",
   * nên chỉ tính một lần — hàm này dò qua mọi sảnh và đôi thông dựng được từ 13
   * lá, không có memo thì nó chạy lại sau mỗi lần chạm vào một lá bài.
   */
  const plays = useMemo(
    () => (canAct ? listPlays(state.myHand, table, state.mustInclude) : []),
    [canAct, state.myHand, table, state.mustInclude],
  );

  /*
   * Kiểm bằng CHÍNH hàm luật server dùng làm trọng tài, ngay tại chỗ — nút
   * "Đánh" chỉ sáng khi bộ đang chọn thật sự đi được, và khi không đi được thì
   * người chơi đọc được lý do luôn.
   */
  const problem =
    selected.length === 0
      ? null
      : checkPlay(state.myHand, selected, table, state.mustInclude);

  const stuck = canAct && table !== null && plays.length === 0;
  const opponent = game.players.find((p) => p.userId !== myId);
  const opponentName = opponent?.displayName ?? 'Người ấy';
  const rotateHint = playing && landscape.portrait && hintVisible;

  // ------------------------------------------------------------------
  // Chọn bài
  // ------------------------------------------------------------------

  const tap = useCallback(
    (card: number) => {
      if (!canAct) return;
      setError(null);
      buzz();
      setSelected((prev) => {
        if (prev.includes(card)) return prev.filter((c) => c !== card);
        // Đang chọn dở thì chỉ thêm lá — người chơi tự ghép bộ, đừng chen vào.
        if (prev.length > 0) return [...prev, card];
        return autoPick(state.myHand, card, table, state.mustInclude);
      });
    },
    [canAct, state.myHand, table, state.mustInclude],
  );

  const sweep = useCallback((cards: number[]) => {
    setError(null);
    setSelected((prev) => {
      const next = [...prev];
      for (const card of cards) if (!next.includes(card)) next.push(card);
      return next;
    });
  }, []);

  const drag = useCardDrag(canAct, tap, sweep);

  function nextHint() {
    if (plays.length === 0) return;
    const i = hintAt % plays.length;
    buzz();
    setError(null);
    setSelected(plays[i] as number[]);
    setHintAt(i + 1);
  }

  // ------------------------------------------------------------------
  // Đi bài
  // ------------------------------------------------------------------

  async function send(action: TienLenAction) {
    if (!canAct) return;
    setError(null);
    setSending(action);
    // Bài đã rời tay rồi thì không còn gì "đang chọn" nữa.
    setSelected([]);
    buzz();
    try {
      await move.mutateAsync({ version: game.version, move: action });
      // Không xoá `sending` ở đây: state mới về là `game.version` đổi, effect ở
      // trên dọn giúp. Xoá sớm thì bài nhấp nháy quay lại tay một nhịp.
    } catch (e) {
      // Server không nhận → trả bài về tay, kèm lý do.
      setSending(null);
      setError(
        e instanceof ApiRequestError
          ? e.message
          : 'Mất kết nối — nước đi chưa được ghi nhận',
      );
    }
  }

  const playLabel = sending
    ? 'Đang gửi...'
    : !myTurn
      ? 'Chờ người ấy'
      : selected.length > 0
        ? `Đánh ${selected.length} lá`
        : 'Chọn bài';

  return (
    <div className="tl-felt tl-safe fixed inset-0 flex flex-col overflow-hidden text-white">
      {/* --------------------------------------------------------- Thanh trên */}
      <header className="relative z-10 flex shrink-0 items-center gap-1.5 px-2 pt-1.5">
        <Link
          to="/tro-choi"
          aria-label="Về sảnh trò chơi"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[19px] leading-none"
        >
          ‹
        </Link>

        <Clock
          playing={playing}
          myTurn={myTurn}
          paused={playing && game.turnDeadlineAt === null}
          seconds={seconds}
          opponentName={opponentName}
        />

        <IconButton
          label={sortMode === 'rank' ? 'Đang xếp theo bậc' : 'Đang xếp theo chất'}
          onClick={() => setSortMode((m) => (m === 'rank' ? 'suit' : 'rank'))}
        >
          {sortMode === 'rank' ? '⇅' : '♣'}
        </IconButton>
        {landscape.canLock && (
          <IconButton
            label={landscape.immersive ? 'Thoát toàn màn hình' : 'Xoay ngang toàn màn hình'}
            onClick={landscape.toggle}
          >
            {landscape.immersive ? '⤡' : '⤢'}
          </IconButton>
        )}
        {playing && (
          <IconButton label="Đầu hàng" onClick={() => setConfirmResign(true)}>
            🏳️
          </IconButton>
        )}
      </header>

      {/* ------------------------------------------------------------ Mặt bàn */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-hidden px-3 py-1.5">
        <Opponent
          name={opponentName}
          count={state.opponentCount}
          passed={state.opponentPassed}
        />

        {/*
          Nhắc xoay máy — và chỉ nhắc, không dựng tấm chắn "hãy xoay ngang".
          Rất nhiều máy đang bật khoá xoay, người ta xoay cũng không được; chặn
          màn hình lúc đó là khoá luôn ván bài của họ. Nhắc một lần rồi tự biến.
        */}
        {rotateHint && (
          <p className="mt-1 shrink-0 rounded-full bg-black/35 px-3 py-1 text-[11px] text-white/85">
            Xoay ngang máy để lá bài to hơn
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5">
          {pile ? (
            <>
              {/* Khổ ngang chỉ cao 390px — lá trên bàn phải nhỏ lại mới đủ chỗ. */}
              <Pile cards={pile.cards} small={!landscape.portrait} />
              <p className="text-[11px] text-white/55">
                {pile.mine ? 'Bạn vừa đánh' : `${opponentName} vừa đánh`}
              </p>
            </>
          ) : (
            <p className="max-w-[280px] text-center text-[12px] leading-relaxed text-white/60">
              Bàn trống — {myTurn ? 'bạn được ra bài tự do' : `${opponentName} đang ra bài`}
              {state.mustInclude !== null && (
                <>
                  <br />
                  Nước đầu phải có{' '}
                  <b className="text-white">{cardLabel(state.mustInclude)}</b>
                </>
              )}
            </p>
          )}

          {/* Lời nhắn nằm NGAY dưới bàn, không dạt xuống đáy: ở khổ dọc đáy cách
              chỗ đang nhìn cả nửa màn hình, đọc không kịp trước khi hết giờ. */}
          <div className="mt-1 flex h-6 items-center">
            {problem ? (
              <p className="rounded-full bg-love-600/90 px-3 py-1 text-[11.5px] font-bold">
                {problem.message}
              </p>
            ) : stuck ? (
              <p className="rounded-full bg-white/15 px-3 py-1 text-[11.5px]">
                Không có nước nào chặn được — đành bỏ lượt thôi
              </p>
            ) : selected.length > 0 ? (
              <p className="rounded-full bg-mint-400/25 px-3 py-1 text-[11.5px] font-bold">
                {comboName(selected)} · sẵn sàng
              </p>
            ) : null}
          </div>
        </div>
      </main>

      {/* ------------------------------------------------- Bài trên tay + nút */}
      <footer className="relative z-10 flex shrink-0 flex-col gap-2 px-3 pb-1 landscape:flex-row landscape:items-end landscape:gap-3">
        {/*
          KHÔNG dùng `flex-1` ở khổ dọc: lúc đó footer xếp theo CỘT, nên
          `flex: 1 1 0%` ăn vào chiều cao và bóp khung bài về 0 — bài tràn hết
          ra ngoài màn hình. Ở khổ ngang footer xếp theo hàng, `flex-1` mới là
          thứ chia bề ngang cho quạt bài.
        */}
        <div
          ref={drag.ref}
          {...drag.handlers}
          className="tl-hand-box relative min-w-0 touch-none landscape:flex-1"
        >
          <Fan cards={hand} selected={selected} disabled={!canAct} box={drag.box} />
        </div>

        {playing && (
          <div className="flex shrink-0 items-center gap-2 landscape:w-[136px] landscape:flex-col landscape:items-stretch landscape:pb-3">
            <button
              type="button"
              disabled={!canAct || plays.length === 0}
              onClick={nextHint}
              className="h-11 shrink-0 rounded-2xl bg-white/15 px-3 text-[12.5px] font-bold disabled:opacity-35"
            >
              💡 Gợi ý
              {plays.length > 1 ? ` ${(hintAt % plays.length) + 1}/${plays.length}` : ''}
            </button>
            <button
              type="button"
              disabled={!canAct || !state.table}
              onClick={() => void send({ pass: true })}
              className="h-11 flex-1 rounded-2xl bg-white/15 text-[13px] font-bold disabled:opacity-35 landscape:flex-none"
            >
              Bỏ lượt
            </button>
            <button
              type="button"
              disabled={!canAct || selected.length === 0 || problem !== null}
              onClick={() => void send({ cards: selected })}
              className="love-gradient h-11 flex-[1.4] rounded-2xl text-[13.5px] font-bold shadow-[0_6px_18px_rgba(234,47,101,0.45)] disabled:opacity-35 landscape:flex-none"
            >
              {playLabel}
            </button>
          </div>
        )}
      </footer>

      {error && (
        <p
          role="alert"
          className="pointer-events-none absolute inset-x-0 bottom-[38%] z-20 mx-auto w-fit max-w-[86%] rounded-full bg-love-700/95 px-4 py-2 text-center text-[12.5px] font-bold"
        >
          {error}
        </p>
      )}

      {confirmResign && playing && (
        <Overlay>
          <b className="text-[15px]">Chịu thua ván này?</b>
          <p className="mt-1 text-[12.5px] text-white/70">
            Người ấy sẽ được tính một ván thắng.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmResign(false)}
              className="h-11 flex-1 rounded-2xl bg-white/15 text-[13px] font-bold"
            >
              Chơi tiếp
            </button>
            <button
              type="button"
              disabled={resign.isPending}
              onClick={() => {
                setConfirmResign(false);
                void resign.mutateAsync().catch(() => setError('Không đầu hàng được'));
              }}
              className="h-11 flex-1 rounded-2xl bg-love-600 text-[13px] font-bold disabled:opacity-50"
            >
              Chịu thua
            </button>
          </div>
        </Overlay>
      )}

      {!playing && (
        <Overlay>
          <Result game={game} myId={myId} opponentName={opponentName} />
          <Link
            to="/tro-choi"
            className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-white text-[14px] font-bold text-ink-900"
          >
            Về sảnh trò chơi
          </Link>
        </Overlay>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bài trên tay
// ---------------------------------------------------------------------------

/**
 * Xoè bài thành hình quạt.
 *
 * Kích thước lá bài suy ra từ ĐÚNG khoảng trống thật sự có, đo bằng
 * `ResizeObserver` — nên xoay ngang là bài to lên hẳn mà không cần bảng kích
 * thước riêng cho từng khổ máy, và cũng không bao giờ tràn ra ngoài màn hình.
 */
function Fan({
  cards,
  selected,
  disabled,
  box,
}: {
  cards: number[];
  selected: number[];
  disabled: boolean;
  box: FanBox;
}) {
  const n = cards.length;
  if (n === 0 || box.w === 0) return null;

  const metrics = fanLayout(n, box);
  const { cardW, step, lift, baseY, arc, tilt } = metrics;
  const cardH = cardHeight(cardW);
  const left = (box.w - fanWidth(n, metrics)) / 2;
  const half = (n - 1) / 2;

  return (
    <>
      {cards.map((card, i) => {
        const off = i - half;
        const on = selected.includes(card);
        const x = left + step * i;
        const y = baseY + off * off * arc - (on ? lift : 0);

        return (
          <button
            key={card}
            type="button"
            data-card={card}
            disabled={disabled}
            aria-pressed={on}
            aria-label={`Lá ${cardLabel(card)}`}
            className="absolute left-0 top-0 rounded-[7px] transition-transform duration-150 ease-out will-change-transform"
            style={{
              width: cardW,
              height: cardH,
              transform: `translate3d(${x}px, ${y}px, 0) rotate(${off * tilt}deg)`,
              // Thứ tự chồng lớp luôn là thứ tự trên tay: lá đang chọn nổi lên
              // bằng cách NHÔ CAO, không bằng cách đè lên lá bên phải — đè thì
              // nó che mất chỉ số của lá đó.
              zIndex: i,
            }}
          >
            <CardFace
              card={card}
              w={cardW}
              style={
                on ? { boxShadow: '0 6px 20px rgba(255,77,125,0.6), 0 0 0 2px #ff7a9c' } : undefined
              }
            />
          </button>
        );
      })}
    </>
  );
}


/**
 * Chạm và **vuốt** để chọn bài.
 *
 * Vuốt ngang qua nhiều lá là cách chọn nhanh nhất trên điện thoại: khỏi phải
 * ngắm từng lá một khi chúng chồng mép nhau. Vuốt chỉ THÊM chứ không bỏ chọn —
 * ngón tay đi qua một lá đã chọn mà nó tắt đi thì không ai đoán được kết quả.
 *
 * Nhấc tay mà chưa đi qua lá thứ hai thì đó là một cú chạm bình thường, và cú
 * chạm mới là thứ được tự chọn nốt cả bộ.
 */
function useCardDrag(
  enabled: boolean,
  onTap: (card: number) => void,
  onSweep: (cards: number[]) => void,
): {
  ref: (el: HTMLDivElement | null) => (() => void) | undefined;
  box: FanBox;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: () => void;
  };
} {
  const [box, setBox] = useState<FanBox>({ w: 0, h: 0 });
  const trail = useRef<number[]>([]);
  const active = useRef(false);

  // React 19 nhận hàm dọn dẹp trả về từ callback ref, nên `ResizeObserver`
  // được ngắt đúng lúc node bị gỡ — không cần thêm một `useEffect` nữa.
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: width, h: height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Lá bài nằm dưới điểm này.
   *
   * Dò thêm một điểm CAO HƠN 18px khi trượt hụt: quạt bài cong, lá giữa nằm cao
   * hơn hai lá rìa chừng ấy, nên một cú vuốt ngang thẳng băng dọc theo mép dưới
   * sẽ đi lọt phía dưới mấy lá ở giữa và bỏ sót đúng chúng.
   */
  function cardAt(x: number, y: number): number | null {
    for (const probeY of [y, y - 18]) {
      const holder = document.elementFromPoint(x, probeY)?.closest('[data-card]');
      if (!holder) continue;
      const raw = Number(holder.getAttribute('data-card'));
      if (Number.isInteger(raw)) return raw;
    }
    return null;
  }

  return {
    ref,
    box,
    handlers: {
      onPointerDown: (e) => {
        if (!enabled) return;
        const card = cardAt(e.clientX, e.clientY);
        if (card === null) return;
        active.current = true;
        trail.current = [card];
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        if (!active.current) return;
        const card = cardAt(e.clientX, e.clientY);
        if (card === null || trail.current.includes(card)) return;
        trail.current.push(card);
        onSweep(trail.current);
      },
      onPointerUp: (e) => {
        if (!active.current) return;
        active.current = false;
        // Trình duyệt có thể đã tự thu hồi (ngón tay ra khỏi màn hình, cuộc gọi
        // đến) — nhả một lần nữa là ném lỗi.
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        const [first] = trail.current;
        if (trail.current.length === 1 && first !== undefined) onTap(first);
        trail.current = [];
      },
      onPointerCancel: () => {
        active.current = false;
        trail.current = [];
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Các mảnh nhỏ
// ---------------------------------------------------------------------------

/** Bộ bài đang nằm giữa bàn. */
function Pile({ cards, small }: { cards: number[]; small: boolean }) {
  const w = small ? 46 : 58;
  return (
    <div className="flex" aria-label="Bài trên bàn">
      {cards.map((card, i) => (
        <CardFace
          key={card}
          card={card}
          w={w}
          className="tl-drop"
          style={{
            marginLeft: i === 0 ? 0 : -Math.round(w * 0.3),
            animationDelay: `${i * 32}ms`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}

function Opponent({ name, count, passed }: { name: string; count: number; passed: boolean }) {
  return (
    <div className="flex w-full max-w-[420px] shrink-0 items-center gap-2.5 rounded-2xl bg-black/25 px-3 py-1.5">
      <div className="flex shrink-0" aria-hidden>
        {Array.from({ length: Math.min(count, 8) }, (_, i) => (
          <CardBack key={i} w={17} style={{ marginLeft: i === 0 ? 0 : -10 }} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px]">{name}</b>
        <p className="text-[11px] text-white/55">còn {count} lá</p>
      </div>
      {passed && (
        <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold">
          đã bỏ lượt
        </span>
      )}
    </div>
  );
}

/**
 * Đồng hồ lượt.
 *
 * Phải nói rõ khi đồng hồ TẠM DỪNG: một cái đồng hồ đứng im mà không giải thích
 * làm người ta tưởng app hỏng rồi thoát ra — mà thoát ra thì đúng là mất lượt thật.
 */
function Clock({
  playing,
  myTurn,
  paused,
  seconds,
  opponentName,
}: {
  playing: boolean;
  myTurn: boolean;
  paused: boolean;
  seconds: number | null;
  opponentName: string;
}) {
  if (!playing) {
    return (
      <div className="min-w-0 flex-1 text-center text-[12.5px] font-bold text-white/70">
        Ván đã kết thúc
      </div>
    );
  }

  if (paused) {
    return (
      <div className="min-w-0 flex-1 truncate px-1 text-center text-[11px] leading-tight text-white/70">
        <b>⏸ Đồng hồ tạm dừng</b>
        <br />
        {myTurn ? 'Đang nối lại, bạn không mất giờ' : `${opponentName} chưa mở app`}
      </div>
    );
  }

  const shown = seconds ?? 30;
  const urgent = shown <= 10;

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
      <span className="truncate text-[12.5px] font-bold text-white/85">
        {myTurn ? 'Tới lượt bạn' : `Chờ ${opponentName}`}
      </span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums ${
          urgent ? 'tl-urgent bg-love-600' : 'bg-white/15'
        }`}
        aria-label={`Còn ${shown} giây`}
      >
        {shown}
      </span>
    </div>
  );
}

function Result({
  game,
  myId,
  opponentName,
}: {
  game: GameResponse;
  myId: string | null;
  opponentName: string;
}) {
  const draw = game.winnerId === null;
  const mine = game.winnerId === myId;
  return (
    <>
      <span className="text-[38px]">{draw ? '🤝' : mine ? '🎉' : '💐'}</span>
      <b className="mt-1 block text-[17px]">
        {draw ? 'Hoà rồi' : mine ? 'Bạn thắng!' : `${opponentName} thắng`}
      </b>
      <p className="mt-1 text-[12.5px] text-white/70">
        {game.endReason ? GAME_END_LABELS[game.endReason] : 'Đã kết thúc'}
      </p>
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6">
      <div className="w-full max-w-[300px] rounded-3xl bg-[#123a2c] p-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        {children}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[15px] leading-none"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

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

/** Gọi tên bộ đang chọn đúng như người chơi gọi ngoài đời. */
function comboName(cards: number[]): string {
  const combo = detectCombo(cards);
  if (!combo) return `${cards.length} lá`;
  // "đôi 2 lá" là thừa, còn sảnh thì phải nói rõ mấy lá mới biết chặn được gì.
  if (combo.type === 'STRAIGHT') return `sảnh ${combo.len} lá`;
  if (combo.type === 'PAIR_RUN') return `${combo.len} đôi thông`;
  return COMBO_LABELS[combo.type];
}

/** Rung nhẹ khi chạm bài. Máy nào không có thì thôi, không phải lỗi. */
function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
}
