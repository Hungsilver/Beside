import { useEffect, useState, type FormEvent } from 'react';
import { anniversarySchema, inviteCodeSchema } from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import {
  useCouple,
  useCreateCouple,
  useJoinCouple,
  useRegenerateInvite,
} from '@/lib/couple-api';
import { useAuth } from '@/lib/auth-context';
import { BrandMark, Field, FormError, Screen, Spinner } from '@/components/ui';

type Tab = 'create' | 'join';

export default function PairScreen() {
  const { user, logout } = useAuth();
  const coupleQuery = useCouple();
  const [tab, setTab] = useState<Tab>('create');

  if (coupleQuery.isLoading) return <Spinner label="Đang kiểm tra ghép đôi..." />;

  const couple = coupleQuery.data;

  // Đã tạo couple nhưng người ấy chưa vào → hiện mã mời và chờ.
  if (couple && couple.members.length < 2) {
    return <WaitingForPartner code={couple.inviteCode} expiresAt={couple.inviteExpiresAt} />;
  }

  return (
    <Screen variant="dusk">
      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="mb-7 text-center">
          <div className="mb-4 flex justify-center">
            <BrandMark size={64} />
          </div>
          <h1 className="text-[26px] font-extrabold tracking-tight">
            Chào {user?.displayName ?? 'bạn'}!
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed opacity-90">
            Ghép đôi để bắt đầu hành trình chung.
            <br />
            Một người tạo mã, người kia nhập mã.
          </p>
        </div>

        <div className="mb-4 flex gap-1.5 rounded-full bg-white/20 p-1.5">
          <TabButton active={tab === 'create'} onClick={() => setTab('create')}>
            Tạo mã mời
          </TabButton>
          <TabButton active={tab === 'join'} onClick={() => setTab('join')}>
            Nhập mã
          </TabButton>
        </div>

        <div className="rounded-[var(--radius-hero)] bg-white p-5 text-ink-900 shadow-[0_18px_48px_rgba(139,92,246,0.16)]">
          {tab === 'create' ? <CreateForm /> : <JoinForm />}
        </div>

        <p className="mt-5 text-center text-[11.5px] leading-relaxed opacity-85">
          Vị trí của bạn chỉ được chia sẻ với duy nhất một người bạn ghép đôi.
          <br />
          Bạn có thể tắt chia sẻ bất cứ lúc nào.
        </p>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 text-center text-[13px] font-semibold underline underline-offset-4 opacity-80"
        >
          Đăng xuất
        </button>
      </div>
    </Screen>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 flex-1 rounded-full text-[13.5px] font-bold transition ${
        active ? 'bg-white text-love-600 shadow-sm' : 'text-white/85'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

function CreateForm() {
  const createCouple = useCreateCouple();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  // Chặn chọn ngày tương lai ngay ở giao diện (server vẫn kiểm tra lại).
  const todayLocal = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);

    const parsed = anniversarySchema.safeParse(date);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Ngày không hợp lệ');
      return;
    }

    try {
      await createCouple.mutateAsync(date);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Không tạo được mã. Thử lại nhé.',
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold">Hai đứa bắt đầu từ ngày nào?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
          Ngày này dùng để đếm số ngày yêu. Đổi lại được sau.
        </p>
      </div>

      <FormError message={error} />

      <Field
        label="Ngày bắt đầu yêu"
        name="anniversaryAt"
        type="date"
        max={todayLocal}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        error={fieldError}
      />

      <button type="submit" className="btn-primary" disabled={createCouple.isPending}>
        {createCouple.isPending ? 'Đang tạo...' : 'Tạo mã ghép đôi'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function JoinForm() {
  const joinCouple = useJoinCouple();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);

    const parsed = inviteCodeSchema.safeParse(code);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Mã không hợp lệ');
      return;
    }

    try {
      await joinCouple.mutateAsync(parsed.data);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Không ghép đôi được. Thử lại nhé.',
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold">Nhập mã của người ấy</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
          Mã gồm 6 ký tự, có hiệu lực trong 24 giờ.
        </p>
      </div>

      <FormError message={error} />

      <div>
        <label htmlFor="inviteCode" className="mb-1.5 block text-[12.5px] font-bold text-ink-700">
          Mã ghép đôi
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="VD: LV7K29"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          aria-invalid={fieldError ? 'true' : undefined}
          className="field-input text-center text-[20px] font-extrabold tracking-[0.35em]"
        />
        {fieldError && (
          <p role="alert" className="mt-1.5 text-[12px] font-semibold text-love-600">
            {fieldError}
          </p>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={joinCouple.isPending}>
        {joinCouple.isPending ? 'Đang kết đôi...' : 'Kết đôi ngay 💘'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function WaitingForPartner({
  code,
  expiresAt,
}: {
  code: string | null;
  expiresAt: string | null;
}) {
  const regenerate = useRegenerateInvite();
  const coupleQuery = useCouple();
  const [copied, setCopied] = useState(false);
  const remaining = useCountdown(expiresAt);

  // Người ấy nhập mã ở máy khác → màn này phải tự biết. Phase 2 sẽ thay bằng
  // WebSocket; giờ hỏi lại mỗi 10 giây là đủ và đơn giản.
  useEffect(() => {
    const id = setInterval(() => void coupleQuery.refetch(), 10_000);
    return () => clearInterval(id);
  }, [coupleQuery]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Trình duyệt chặn clipboard (thường do không phải HTTPS) — người dùng vẫn đọc được mã.
      setCopied(false);
    }
  }

  const expired = remaining === 0;

  return (
    <Screen variant="dusk">
      <div className="flex flex-1 flex-col justify-center py-8 text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size={64} />
        </div>
        <h1 className="text-[24px] font-extrabold tracking-tight">
          Đang chờ người ấy...
        </h1>
        <p className="mt-2 text-[14px] opacity-90">Gửi mã này cho người ấy nhé</p>

        <div className="mt-6 rounded-[var(--radius-hero)] bg-white p-5 text-ink-900 shadow-[0_18px_48px_rgba(139,92,246,0.16)]">
          {code && !expired ? (
            <>
              <div className="flex gap-2">
                {code.split('').map((c, i) => (
                  <div
                    key={`${c}-${i}`}
                    className="flex aspect-square flex-1 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-love-200 bg-love-50 text-[22px] font-extrabold text-love-600"
                  >
                    {c}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-ink-400">
                Còn hiệu lực {formatRemaining(remaining)}
              </p>
              <button type="button" onClick={() => void copy()} className="btn-ghost mt-4 w-full">
                {copied ? '✓ Đã sao chép' : '📋 Sao chép mã'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold">Mã đã hết hạn</p>
              <p className="mt-1.5 text-[13px] text-ink-500">
                Tạo mã mới rồi gửi lại cho người ấy nhé.
              </p>
              <button
                type="button"
                onClick={() => regenerate.mutate()}
                className="btn-primary mt-4 w-full"
                disabled={regenerate.isPending}
              >
                {regenerate.isPending ? 'Đang tạo...' : 'Tạo mã mới'}
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-[12px] opacity-85">
          Màn hình này sẽ tự chuyển khi người ấy nhập mã.
        </p>
      </div>
    </Screen>
  );
}

/** Số mili giây còn lại, cập nhật mỗi giây. Trả 0 khi đã hết hạn hoặc không có hạn. */
function useCountdown(expiresAt: string | null): number {
  const [ms, setMs] = useState(() => remainingMs(expiresAt));

  useEffect(() => {
    setMs(remainingMs(expiresAt));
    if (!expiresAt) return;
    const id = setInterval(() => setMs(remainingMs(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return ms;
}

function remainingMs(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - Date.now());
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
