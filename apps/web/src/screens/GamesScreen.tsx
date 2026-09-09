import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GAME_KIND_LABELS,
  type GameKind,
  type GameSummaryResponse,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { useCouple } from '@/lib/couple-api';
import { ApiRequestError } from '@/lib/api-client';
import { useCreateGame, useGameSummary } from '@/lib/games-api';
import { exitLandscape, requestLandscape } from '@/lib/use-landscape';
import TabBar from '@/components/TabBar';
import { Screen, Spinner } from '@/components/ui';

const GAMES: { kind: GameKind; emoji: string; blurb: string; ready: boolean }[] = [
  {
    kind: 'CARO',
    emoji: '⚫',
    blurb: 'Bàn 15×15 · đủ 5 quân là thắng, trừ khi bị chặn cả hai đầu',
    ready: true,
  },
  {
    kind: 'TIEN_LEN',
    emoji: '🃏',
    blurb: '13 lá mỗi người · luật cơ bản, có chặt heo',
    ready: true,
  },
];

export default function GamesScreen() {
  const { user } = useAuth();
  const coupleQuery = useCouple();
  const summaryQuery = useGameSummary();
  const create = useCreateGame();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (summaryQuery.isLoading) return <Spinner label="Đang mở sảnh trò chơi..." />;

  const partnerName = coupleQuery.data?.partner?.displayName ?? 'Người ấy';

  async function start(kind: GameKind, activeGameId: string | null) {
    /*
     * Xin xoay ngang NGAY tại đây, không đợi màn ván bài mở lên.
     *
     * Trình duyệt chỉ cho vào toàn màn hình khi lệnh đi ra từ một cú chạm, mà cú
     * chạm hết hiệu lực sau `await` đầu tiên. Gọi ở đây là chỗ sớm nhất còn kịp.
     */
    if (kind === 'TIEN_LEN') requestLandscape();

    // Đã có ván dở thì mở thẳng vào đó — server cũng từ chối tạo ván thứ hai,
    // nhưng đi thẳng vào thì người dùng khỏi phải đọc một thông báo lỗi vô ích.
    if (activeGameId) {
      void navigate(`/tro-choi/${activeGameId}`);
      return;
    }

    setError(null);
    try {
      const game = await create.mutateAsync(kind);
      void navigate(`/tro-choi/${game.id}`);
    } catch (e) {
      /*
       * 409 kèm `fieldErrors.gameId` nghĩa là có ván dở vừa được tạo ở máy kia
       * trong đúng lúc mình bấm. Mở luôn vào ván đó thay vì báo lỗi.
       */
      const running =
        e instanceof ApiRequestError ? e.fieldErrors?.gameId?.[0] : undefined;
      if (running) {
        void navigate(`/tro-choi/${running}`);
        return;
      }
      // Không vào được ván thì đừng để cả sảnh kẹt ở màn hình ngang.
      if (kind === 'TIEN_LEN') void exitLandscape();
      setError(e instanceof ApiRequestError ? e.message : 'Không mở được ván mới');
    }
  }

  return (
    <Screen>
      <header className="py-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
          Giết thời gian cùng nhau
        </p>
        <h1 className="text-[24px] font-extrabold tracking-tight">Trò chơi</h1>
      </header>

      {error && (
        <p role="alert" className="mb-3 text-[12.5px] font-semibold text-love-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3.5">
        {GAMES.map((g) => {
          const row = summaryQuery.data?.items.find((i) => i.kind === g.kind);
          return (
            <GameCard
              key={g.kind}
              kind={g.kind}
              emoji={g.emoji}
              title={GAME_KIND_LABELS[g.kind]}
              blurb={g.blurb}
              ready={g.ready}
              row={row}
              myId={user?.id ?? null}
              partnerName={partnerName}
              busy={create.isPending}
              onStart={() => void start(g.kind, row?.activeGameId ?? null)}
            />
          );
        })}
      </div>

      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-400">
        Mỗi lượt 30 giây. Đồng hồ chỉ chạy khi người tới lượt đang mở app —
        khoá màn hình thì không bị mất giờ.
      </p>

      <div className="flex-1" />
      <div className="h-[100px]" />
      <TabBar />
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function GameCard({
  kind,
  emoji,
  title,
  blurb,
  ready,
  row,
  myId,
  partnerName,
  busy,
  onStart,
}: {
  kind: GameKind;
  emoji: string;
  title: string;
  blurb: string;
  ready: boolean;
  row: GameSummaryResponse['items'][number] | undefined;
  myId: string | null;
  partnerName: string;
  busy: boolean;
  onStart: () => void;
}) {
  const myWins = myId ? (row?.wins[myId] ?? 0) : 0;
  const theirWins = Object.entries(row?.wins ?? {})
    .filter(([id]) => id !== myId)
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <section className="card">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-[22px]">
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[15.5px]">{title}</b>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">{blurb}</p>
        </div>
      </div>

      {ready && row && (row.played > 0 || row.draws > 0) && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-ink-100 px-3.5 py-2.5 text-[12.5px]">
          <span>
            Bạn <b className="tabular-nums">{myWins}</b>
          </span>
          <span className="text-ink-400">—</span>
          <span>
            <b className="tabular-nums">{theirWins}</b> {partnerName}
          </span>
          {row.draws > 0 && (
            <span className="text-ink-400">· {row.draws} hoà</span>
          )}
        </div>
      )}

      {!ready ? (
        <p className="mt-3 rounded-2xl bg-ink-100 px-4 py-3 text-[12.5px] text-ink-500">
          Đang được làm, chưa chơi được.
        </p>
      ) : row?.activeGameId ? (
        <Link
          to={`/tro-choi/${row.activeGameId}`}
          onClick={() => {
            if (kind === 'TIEN_LEN') requestLandscape();
          }}
          className="btn-primary mt-3 w-full"
        >
          ▶ Chơi tiếp ván đang dở
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onStart}
          className="btn-primary mt-3 w-full disabled:opacity-50"
        >
          {busy ? 'Đang mở ván...' : '＋ Ván mới'}
        </button>
      )}
    </section>
  );
}
