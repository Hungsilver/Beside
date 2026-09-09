import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GAME_KIND_LABELS, type GameResponse } from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { useCountdown, useGame, useGameChannel, useResign } from '@/lib/games-api';
import CaroBoard from '@/components/CaroBoard';
import TienLenTable from '@/components/TienLenTable';
import GameStatusBar from '@/components/GameStatusBar';
import { Screen, Spinner } from '@/components/ui';

/**
 * Khung chung của một ván: tải dữ liệu, giữ socket, đồng hồ, đầu hàng.
 *
 * Phần luật và bàn chơi nằm ở component riêng theo từng loại game — khung này
 * không biết gì về quân cờ hay lá bài, nên thêm game thứ ba cũng chỉ là thêm
 * một nhánh ở đúng một chỗ.
 */
export default function GameScreen() {
  const { gameId = '' } = useParams();
  const { user } = useAuth();
  const query = useGame(gameId);
  useGameChannel(gameId || null);

  if (query.isLoading) return <Spinner label="Đang mở ván..." />;

  if (query.isError || !query.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-[44px]">🎲</span>
          <p className="max-w-[260px] text-[13.5px] leading-relaxed text-ink-500">
            {query.error instanceof ApiRequestError
              ? query.error.message
              : 'Không mở được ván này'}
          </p>
          <Link to="/tro-choi" className="btn-primary">
            Về sảnh trò chơi
          </Link>
        </div>
      </Screen>
    );
  }

  return <Table game={query.data} myId={user?.id ?? null} />;
}

// ---------------------------------------------------------------------------

function Table({ game, myId }: { game: GameResponse; myId: string | null }) {
  const resign = useResign(game.id);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const playing = game.status === 'PLAYING';
  const seconds = useCountdown(playing ? game.turnDeadlineAt : null);
  const opponentName = game.players.find((p) => p.userId !== myId)?.displayName ?? 'Người ấy';

  return (
    <Screen>
      <header className="flex items-center gap-3 py-3">
        <Link
          to="/tro-choi"
          aria-label="Về sảnh trò chơi"
          className="flex size-11 items-center justify-center rounded-full bg-ink-100 text-[18px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-extrabold tracking-tight">
            {GAME_KIND_LABELS[game.kind]}
          </h1>
          <p className="text-[11.5px] text-ink-400">
            {game.kind === 'CARO'
              ? 'Đủ 5 quân là thắng — trừ khi bị chặn cả hai đầu'
              : 'Hết bài trước là thắng · có chặt heo'}
          </p>
        </div>
      </header>

      <GameStatusBar game={game} myId={myId} seconds={seconds} opponentName={opponentName} />

      {game.kind === 'CARO' ? (
        <CaroBoard game={game} myId={myId} onError={setError} />
      ) : (
        <TienLenTable game={game} myId={myId} onError={setError} />
      )}

      {error && (
        <p role="alert" className="mt-2 text-center text-[12.5px] font-semibold text-love-600">
          {error}
        </p>
      )}

      {playing && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {confirmResign ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmResign(false)}
                className="h-11 rounded-full bg-ink-100 px-4 text-[13px] font-bold text-ink-600"
              >
                Thôi
              </button>
              <button
                type="button"
                disabled={resign.isPending}
                onClick={() =>
                  void resign.mutateAsync().catch(() => setError('Không đầu hàng được'))
                }
                className="h-11 rounded-full bg-love-600 px-4 text-[13px] font-bold text-white disabled:opacity-50"
              >
                Chịu thua
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmResign(true)}
              className="h-11 rounded-full bg-ink-100 px-4 text-[12.5px] font-bold text-ink-500"
            >
              🏳️ Đầu hàng
            </button>
          )}
        </div>
      )}

      {playing && (
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-ink-400">
          Ván tự huỷ nếu 30 phút không ai đi.
        </p>
      )}

      {!playing && (
        <Link to="/tro-choi" className="btn-primary mt-3 w-full">
          Về sảnh trò chơi
        </Link>
      )}

      <div className="h-6" />
    </Screen>
  );
}
