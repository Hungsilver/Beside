import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bombCards,
  cardLabel,
  checkPlay,
  COMBO_LABELS,
  companions,
  detectCombo,
  GAME_END_LABELS,
  INSTANT_WIN_LABELS,
  listPlays,
  RANK_TWO,
  rankOf,
  suggestHighlight,
  suitOf,
  tableCombo,
  THREE_SPADE,
  TURN_MS,
  type Combo,
  type GameResponse,
  type TienLenAction,
  type TienLenClientState,
  type TienLenPlay,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCountdown, useGameMove, useResign } from '@/lib/games-api';
import { useLandscape } from '@/lib/use-landscape';
import { CardBack, CardFace } from '@/components/PlayingCard';
import { cardHeight, fanLayout, fanWidth, type FanBox } from '@/lib/fan-layout';

type SortMode = 'rank' | 'suit';

/** Lá bài đang được tô kiểu gì trong quạt bài. */
type Tone = 'on' | 'hint' | 'keep' | 'dim' | 'plain';

/** Nhiều nhất bấy nhiêu bộ cũ còn nhìn thấy trong chồng bài — sâu hơn thì rối. */
const PILE_DEPTH = 4;

/**
 * Bàn Tiến lên — chiếm trọn màn hình, không nằm trong khung 430px như các màn
 * khác. Ván bài cần bề ngang: 13 lá cạnh nhau ở khổ dọc 390px thì mỗi lá chỉ hở
 * hơn hai chục pixel, nhìn không ra chất mà chạm cũng dễ trượt.
 *
 * Bốn thứ quyết định cảm giác chơi, và cả bốn đều nằm ở component này:
 *
 *   1. **Bàn giữ nguyên cả vòng** — bộ mới đè lên bộ cũ chứ không xoá nó đi, nên
 *      lúc nào cũng nhìn lại được mình vừa chặn cái gì (`PileStack`).
 *   2. **Chạm một lá là thấy ghép được với lá nào** — `companions()` tô sáng
 *      những lá còn ghép tiếp được; không tự chọn hộ, người chơi vẫn cầm quyền.
 *   3. **Hàng nút nằm ngay trên quạt bài** — đúng tầm ngón cái, và nó sáng lên
 *      khi tới lượt nên không phải đi tìm xem đang chờ ai.
 *   4. **Bấm xong thấy ngay** — bài rời tay và rơi xuống bàn ngay lúc bấm, không
 *      đợi mạng. Server vẫn là trọng tài, sai thì trả bài về tay kèm lý do.
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

  /**
   * Chồng bài giữa bàn theo con mắt người chơi.
   *
   * Bỏ lượt là vòng khép lại nên bàn sạch ngay; còn đánh bài thì bộ vừa bấm được
   * **chồng thêm** lên, không thay thế bộ cũ.
   */
  const pile = useMemo((): TienLenPlay[] => {
    if (sending && 'pass' in sending) return [];
    if (sendingCards) return [...state.pile, { userId: myId ?? '', cards: sendingCards }];
    return state.pile;
  }, [sending, sendingCards, state.pile, myId]);

  /** Bộ phải chặn — luôn đọc từ state THẬT, vì đây là thứ luật dựa vào. */
  const table = useMemo(() => tableCombo(state.pile), [state.pile]);

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

  /**
   * Lá nào sáng, lá nào mờ.
   *
   * Ba cảnh khác nhau, và chúng cố tình KHÔNG giống nhau:
   *
   *   - **Đã chạm một lá** → sáng những lá còn ghép tiếp được với nó. Đây là thứ
   *     thay cho nút "gợi ý" cũ: người chơi tự ráp bộ, màn hình chỉ nói cho họ
   *     biết lá nào ráp được.
   *   - **Chưa chạm gì, đang phải chặn** → sáng những lá chặn được, và tô RIÊNG
   *     (`keep`) những lá đang nằm trong tứ quý / đôi thông. Phá hàng chặt để ăn
   *     một con rác là nước cờ tệ, nên nó phải nhìn khác hẳn.
   *   - **Chưa chạm gì, được ra bài tự do** → không tô gì cả. Lúc đó chỉ người
   *     chơi mới biết họ định đi bộ nào; tô sáng cả tay bài chỉ là nhiễu.
   */
  const focus = useMemo((): { hint: Set<number>; keep: Set<number>; dim: boolean } => {
    if (!canAct) return { hint: new Set(), keep: new Set(), dim: false };

    if (selected.length > 0) {
      return {
        hint: new Set(companions(state.myHand, selected, table, state.mustInclude)),
        keep: new Set(),
        dim: false,
      };
    }

    if (table) {
      const { playable, reserved } = suggestHighlight(state.myHand, table, state.mustInclude);
      return { hint: new Set(playable), keep: new Set(reserved), dim: playable.length > 0 };
    }

    // Ra bài tự do: chỉ nhắc khẽ hàng chặt đang cầm, không tô sáng gì thêm.
    return { hint: new Set(), keep: new Set(bombCards(state.myHand)), dim: false };
  }, [canAct, selected, state.myHand, table, state.mustInclude]);

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

  /**
   * Chạm một lá = chọn ĐÚNG lá đó.
   *
   * Bản cũ tự nhặt nốt cả bộ (`autoPick`). Nghe thì tiện, nhưng nó quyết hộ
   * người chơi: bàn có đôi 8, chạm một lá 9 là mất luôn đôi 9 dù có khi họ chỉ
   * định xem lá đó ghép được với gì. Giờ chạm là chọn, còn phần "ghép được với
   * gì" thì `focus.hint` nói bằng màu.
   */
  const tap = useCallback(
    (card: number) => {
      if (!canAct) return;
      setError(null);
      buzz();
      setSelected((prev) =>
        prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card],
      );
    },
    [canAct],
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

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5">
          {pile.length > 0 ? (
            <>
              {/* Khổ ngang chỉ cao 390px — lá trên bàn phải nhỏ lại mới đủ chỗ. */}
              <PileStack pile={pile} small={!landscape.portrait} />
              <PileCaption pile={pile} myId={myId} opponentName={opponentName} />
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

          <ComboFlash pile={pile} />

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

      {/* ------------------------------------------------- Nút + bài trên tay */}
      <footer className="relative z-10 flex shrink-0 flex-col gap-1.5 px-3 pb-1 landscape:flex-row landscape:items-end landscape:gap-3">
        {playing && (
          /*
            Hàng nút nằm NGAY TRÊN quạt bài ở khổ dọc.
            Trước đây nó ở dưới cùng, dính mép màn hình: ngón cái phải với xuống
            tận đáy, mà mắt thì đang ở chỗ bài. Đặt sát trên quạt bài thì chỗ
            nhìn và chỗ bấm trùng nhau, và nó cũng chính là chỗ dễ với nhất.
            Khổ ngang thì footer xếp theo hàng nên nút về lại cột phải.
          */
          <ActionBar
            canAct={canAct}
            myTurn={myTurn}
            sending={sending !== null}
            selected={selected}
            problem={problem !== null}
            hasTable={table !== null}
            plays={plays}
            hintAt={hintAt}
            seconds={seconds}
            opponentName={opponentName}
            onHint={nextHint}
            onPass={() => void send({ pass: true })}
            onPlay={() => void send({ cards: selected })}
          />
        )}

        {/*
          KHÔNG dùng `flex-1` ở khổ dọc: lúc đó footer xếp theo CỘT, nên
          `flex: 1 1 0%` ăn vào chiều cao và bóp khung bài về 0 — bài tràn hết
          ra ngoài màn hình. Ở khổ ngang footer xếp theo hàng, `flex-1` mới là
          thứ chia bề ngang cho quạt bài.
        */}
        <div
          ref={drag.ref}
          {...drag.handlers}
          className="tl-hand-box relative min-w-0 touch-none landscape:order-first landscape:flex-1"
        >
          <Fan
            cards={hand}
            selected={selected}
            hint={focus.hint}
            keep={focus.keep}
            dim={focus.dim}
            mustInclude={playing ? state.mustInclude : null}
            warnThoi={playing && hand.length <= 5}
            disabled={!canAct}
            box={drag.box}
          />
        </div>
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
          <Result game={game} myId={myId} opponentName={opponentName} state={state} />
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
// Hàng nút — và cũng là chỗ báo "tới lượt bạn"
// ---------------------------------------------------------------------------

/**
 * Ba nút đi bài, đặt ngay tầm ngón cái.
 *
 * Hàng nút này kiêm luôn việc **báo tới lượt**: nó sáng lên và có viền nhấp nháy
 * khi đến lượt mình, kèm một vạch thời gian cạn dần. Đồng hồ ở thanh trên vẫn
 * còn, nhưng nó nằm xa chỗ đang nhìn — mà "tới lượt chưa" là câu hỏi phải trả
 * lời được bằng cách liếc đúng chỗ tay đang đặt.
 */
function ActionBar({
  canAct,
  myTurn,
  sending,
  selected,
  problem,
  hasTable,
  plays,
  hintAt,
  seconds,
  opponentName,
  onHint,
  onPass,
  onPlay,
}: {
  canAct: boolean;
  myTurn: boolean;
  sending: boolean;
  selected: number[];
  problem: boolean;
  hasTable: boolean;
  plays: number[][];
  hintAt: number;
  seconds: number | null;
  opponentName: string;
  onHint: () => void;
  onPass: () => void;
  onPlay: () => void;
}) {
  const ready = selected.length > 0 && !problem;
  const playLabel = sending
    ? 'Đang gửi...'
    : ready
      ? `Đánh ${selected.length} lá`
      : selected.length > 0
        ? 'Bộ không hợp lệ'
        : 'Chọn bài';

  /** Vạch thời gian: đầy lúc mới tới lượt, cạn dần về 0. */
  const left = seconds === null ? 1 : Math.max(0, Math.min(1, seconds / (TURN_MS / 1000)));

  return (
    <div
      className={`flex shrink-0 flex-col gap-1 rounded-2xl px-1 py-1 transition-colors landscape:w-[150px] landscape:justify-end landscape:pb-3 ${
        myTurn ? 'tl-turn bg-white/10' : ''
      }`}
    >
      {/* Dải "tới lượt" — chỉ hiện ở khổ dọc, khổ ngang đã có cả cột riêng. */}
      <div className="flex items-center gap-2 px-1 landscape:flex-col landscape:items-stretch landscape:gap-1">
        <b
          className={`shrink-0 text-[11px] uppercase tracking-wide ${
            myTurn ? 'text-mint-400' : 'text-white/45'
          }`}
        >
          {myTurn ? '● Tới lượt bạn' : `○ Chờ ${opponentName}`}
        </b>
        <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/12">
          <span
            className={`block h-full rounded-full transition-[width] duration-1000 ease-linear ${
              left <= 0.34 ? 'bg-love-500' : 'bg-mint-400'
            }`}
            style={{ width: myTurn ? `${left * 100}%` : '0%' }}
          />
        </span>
      </div>

      <div className="flex items-center gap-2 landscape:flex-col landscape:items-stretch">
        <button
          type="button"
          aria-label="Gợi ý một nước đi"
          disabled={!canAct || plays.length === 0}
          onClick={onHint}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[16px] font-bold disabled:opacity-30 landscape:w-full landscape:text-[13px]"
        >
          💡
          {plays.length > 1 && (
            <span className="ml-1 text-[10.5px] tabular-nums opacity-80">
              {(hintAt % plays.length) + 1}/{plays.length}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={!canAct || !hasTable}
          onClick={onPass}
          className="h-12 flex-1 rounded-2xl bg-white/15 text-[13.5px] font-bold disabled:opacity-30 landscape:flex-none"
        >
          Bỏ lượt
        </button>
        <button
          type="button"
          disabled={!canAct || !ready}
          onClick={onPlay}
          className={`love-gradient h-12 flex-[1.5] rounded-2xl text-[14px] font-extrabold shadow-[0_6px_18px_rgba(234,47,101,0.45)] disabled:opacity-30 landscape:flex-none ${
            ready && canAct ? 'tl-ready' : ''
          }`}
        >
          {playLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chồng bài giữa bàn
// ---------------------------------------------------------------------------

/**
 * Cả vòng bài, xếp chồng lệch lên nhau.
 *
 * Bản cũ chỉ vẽ đúng bộ trên cùng, nên đánh một cái là bộ trước biến mất — mất
 * luôn thứ người chơi cần nhất lúc cân nhắc: mình vừa chặn cái gì, và trước đó
 * đối phương ra bài gì. Ở đây bộ cũ lùi lên trên, nhỏ lại và mờ đi, còn bộ mới
 * nhất nằm dưới cùng rõ nét — đúng cách một chồng bài thật trông ra sao.
 */
function PileStack({ pile, small }: { pile: TienLenPlay[]; small: boolean }) {
  const w = small ? 44 : 56;
  const shown = pile.slice(-PILE_DEPTH);
  const hidden = pile.length - shown.length;

  return (
    <div
      className="relative w-full"
      style={{ minHeight: cardHeight(w) + (shown.length - 1) * 15 }}
      aria-label={`Trên bàn: ${shown.length} bộ`}
    >
      {hidden > 0 && (
        <span className="absolute -top-1 right-0 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/70">
          +{hidden} bộ trước
        </span>
      )}

      {shown.map((play, i) => {
        // Bộ mới nhất là mốc 0; càng cũ càng lùi lên, nhỏ lại và mờ đi.
        const depth = shown.length - 1 - i;
        const key = `${pile.length - shown.length + i}:${play.cards.join(',')}`;
        return (
          <div
            key={key}
            className="absolute bottom-0 left-1/2 flex"
            style={{
              /*
               * `translate(-50%)` nằm ngay trong transform này chứ không dùng
               * class `-translate-x-1/2`: Tailwind cũng ghi vào `transform`, mà
               * style nội tuyến thì đè lên class — mất một trong hai.
               */
              transform: `translate(-50%, ${-depth * 15}px) scale(${1 - depth * 0.07}) rotate(${tiltOf(key)}deg)`,
              opacity: Math.max(0.28, 1 - depth * 0.24),
              zIndex: i,
              // Bộ cũ không nhận chạm — chúng chỉ là ký ức của vòng này.
              pointerEvents: 'none',
            }}
          >
            {play.cards.map((card, j) => (
              <CardFace
                key={card}
                card={card}
                w={w}
                /*
                 * Hiệu ứng rơi đặt lên TỪNG LÁ, không đặt lên tầng bài: khung
                 * hình cuối của `tl-drop` là `transform: none`, dán nó lên tầng
                 * bài sẽ xoá luôn phần căn giữa và độ nghiêng ở trên.
                 */
                className={depth === 0 ? 'tl-drop' : ''}
                style={{
                  marginLeft: j === 0 ? 0 : -Math.round(w * 0.3),
                  animationDelay: depth === 0 ? `${j * 32}ms` : undefined,
                  zIndex: j,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Ai vừa đánh, và đánh bộ gì — một dòng ngay dưới chồng bài. */
function PileCaption({
  pile,
  myId,
  opponentName,
}: {
  pile: TienLenPlay[];
  myId: string | null;
  opponentName: string;
}) {
  const top = pile[pile.length - 1];
  if (!top) return null;
  const combo = detectCombo(top.cards);

  return (
    <p className="text-[11px] text-white/60">
      <b className="text-white/80">{top.userId === myId ? 'Bạn' : opponentName}</b> vừa đánh
      {combo && <> · {comboName(top.cards)}</>}
      {pile.length > 1 && <> · nước thứ {pile.length} của vòng</>}
    </p>
  );
}

/**
 * Câu hô khi có bộ đáng hô.
 *
 * Đây là phần "cho ra dáng ván bài" chứ không phải phần thông tin: tứ quý, đôi
 * thông, chặt heo — những nước mà ngoài đời người ta reo lên. Bộ thường (rác,
 * đôi, sảnh ngắn) thì im lặng, hô hết thì chẳng câu nào còn nghĩa lý.
 */
function ComboFlash({ pile }: { pile: TienLenPlay[] }) {
  const [shout, setShout] = useState<{ text: string; bomb: boolean } | null>(null);

  const top = pile[pile.length - 1] ?? null;
  const under = pile.length >= 2 ? (pile[pile.length - 2] as TienLenPlay) : null;
  const key = top ? `${pile.length}:${top.cards.join(',')}` : '';

  useEffect(() => {
    if (!top) {
      setShout(null);
      return undefined;
    }
    const combo = detectCombo(top.cards);
    const beaten = under ? detectCombo(under.cards) : null;
    const bomb = combo !== null && beaten !== null && combo.type !== beaten.type;
    const text = combo && shoutFor(combo, bomb);
    if (!text) {
      setShout(null);
      return undefined;
    }

    setShout({ text, bomb });
    const id = setTimeout(() => setShout(null), 1700);
    return () => clearTimeout(id);
    // `key` đã gói trọn "bộ trên cùng vừa đổi" — theo dõi thêm `top`/`under` chỉ
    // làm hiệu ứng chạy lại mỗi lần React dựng lại mảng mới với cùng nội dung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!shout) return null;

  return (
    <p
      className={`tl-shout pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl px-4 py-2 text-[19px] font-extrabold tracking-wide ${
        shout.bomb
          ? 'bg-love-600/90 text-white shadow-[0_0_30px_rgba(234,47,101,0.7)]'
          : 'bg-black/55 text-mint-400 shadow-[0_0_26px_rgba(0,0,0,0.5)]'
      }`}
      role="status"
    >
      {shout.text}
    </p>
  );
}

/** Bộ này có đáng hô không, và hô câu gì. `null` = bộ thường, im lặng. */
function shoutFor(combo: Combo, bomb: boolean): string | null {
  const name = (() => {
    if (combo.type === 'QUAD') return 'TỨ QUÝ';
    if (combo.type === 'PAIR_RUN') return combo.len >= 4 ? 'BỐN ĐÔI THÔNG' : 'BA ĐÔI THÔNG';
    if (combo.type === 'STRAIGHT' && combo.len >= 5) return `SẢNH ${combo.len} LÁ`;
    if (combo.type === 'SINGLE' && rankOf(combo.high) === RANK_TWO) return 'HEO';
    if (combo.type === 'PAIR' && rankOf(combo.high) === RANK_TWO) return 'ĐÔI HEO';
    return null;
  })();

  if (bomb) return name ? `CHẶT · ${name}` : 'CHẶT!';
  return name;
}

/** Góc nghiêng của một bộ trên bàn — suy từ nội dung nên vẽ lại vẫn y nguyên. */
function tiltOf(key: string): number {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i) * (i + 1)) % 97;
  return (sum % 9) - 4;
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
  hint,
  keep,
  dim,
  mustInclude,
  warnThoi,
  disabled,
  box,
}: {
  cards: number[];
  selected: number[];
  /** Lá ghép được / chặn được — mời bấm. */
  hint: Set<number>;
  /** Lá đang nằm trong hàng chặt — bấm thì phá đồ quý. */
  keep: Set<number>;
  /** Có làm mờ những lá ngoài `hint` không. */
  dim: boolean;
  /** Lá bắt buộc của nước đầu ván (3♠ trong ván chia hết bộ). */
  mustInclude: number | null;
  /** Còn ít bài → nhắc 3♠ đang cầm kẻo thối. */
  warnThoi: boolean;
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
        const tone: Tone = on
          ? 'on'
          : hint.has(card)
            ? 'hint'
            : keep.has(card)
              ? 'keep'
              : dim
                ? 'dim'
                : 'plain';

        const x = left + step * i;
        // Lá đang chọn nhô hẳn lên; lá được gợi ý nhô nhẹ để mắt bắt được ngay
        // cả khi máy đang ở chế độ giảm chuyển động (viền màu có thể không đủ).
        const rise = on ? lift : tone === 'hint' ? Math.round(lift * 0.42) : 0;
        const y = baseY + off * off * arc - rise;
        const pinned = card === mustInclude;
        const thoi = warnThoi && card === THREE_SPADE;

        return (
          <button
            key={card}
            type="button"
            data-card={card}
            data-tone={tone}
            disabled={disabled}
            aria-pressed={on}
            aria-label={`Lá ${cardLabel(card)}${pinned ? ' — bắt buộc đánh' : ''}${
              tone === 'hint' ? ' — ghép được' : tone === 'keep' ? ' — đang trong hàng chặt' : ''
            }`}
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
            <CardFace card={card} w={cardW} className={`pcard-${tone}`} />
            {pinned && (
              <span className="tl-pin" aria-hidden>
                bắt buộc
              </span>
            )}
            {thoi && !pinned && (
              <span className="tl-pin tl-pin-warn" aria-hidden>
                thối
              </span>
            )}
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
 * Nhấc tay mà chưa đi qua lá thứ hai thì đó là một cú chạm bình thường.
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
        <p className="text-[11px] text-white/55">
          còn {count} lá
          {count <= 3 && <span className="ml-1 font-bold text-love-300">· sắp hết bài!</span>}
        </p>
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
          urgent && myTurn ? 'tl-urgent bg-love-600' : 'bg-white/15'
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
  state,
}: {
  game: GameResponse;
  myId: string | null;
  opponentName: string;
  state: TienLenClientState;
}) {
  const draw = game.winnerId === null;
  const mine = game.winnerId === myId;
  const blitz = game.endReason === 'TOI_TRANG' ? state.instantWin : null;
  const thoi = state.thoiThreeSpade;

  return (
    <>
      {blitz && (
        <p className="tl-pop mb-2 rounded-xl bg-love-600 px-3 py-1.5 text-[15px] font-extrabold tracking-wide">
          TỚI TRẮNG · {INSTANT_WIN_LABELS[blitz.kind]}
        </p>
      )}
      <span className="text-[38px]">{draw ? '🤝' : mine ? '🎉' : '💐'}</span>
      <b className="mt-1 block text-[17px]">
        {draw ? 'Hoà rồi' : mine ? 'Bạn thắng!' : `${opponentName} thắng`}
      </b>
      <p className="mt-1 text-[12.5px] text-white/70">
        {game.endReason ? GAME_END_LABELS[game.endReason] : 'Đã kết thúc'}
      </p>
      {thoi && (
        <p className="mt-2 inline-block rounded-full bg-white/12 px-3 py-1 text-[11.5px] font-bold text-love-300">
          🖤 {thoi === myId ? 'Bạn' : opponentName} thối 3 bích
        </p>
      )}
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
  if (combo.type === 'PAIR_RUN') return `${combo.len === 4 ? 'bốn' : 'ba'} đôi thông`;
  if (combo.type === 'SINGLE' && rankOf(combo.high) === RANK_TWO) return 'heo';
  if (combo.type === 'PAIR' && rankOf(combo.high) === RANK_TWO) return 'đôi heo';
  return COMBO_LABELS[combo.type];
}

/** Rung nhẹ khi chạm bài. Máy nào không có thì thôi, không phải lỗi. */
function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
}
