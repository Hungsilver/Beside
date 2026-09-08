import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  buildMessagingUrl,
  MESSAGING_APP_LABELS,
  MESSAGING_APPS,
  updateProfileSchema,
  type MessagingApp,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { usePush } from '@/lib/push-api';
import { useCouple, useUnpair } from '@/lib/couple-api';
import { useUpdateAnniversary, useUpdatePrivacy, useUpdateProfile } from '@/lib/profile-api';
import { Field, FormError, Screen, Spinner } from '@/components/ui';

/**
 * Nơi hai người tự sửa thông tin cá nhân — tên, ngày sinh, app nhắn tin,
 * và ngày kỷ niệm chung. Không có dữ liệu nào được cài sẵn trong code.
 */
export default function SettingsScreen() {
  const { user, patchUser, logout } = useAuth();
  const navigate = useNavigate();
  const coupleQuery = useCouple();

  if (!user) return <Spinner />;

  return (
    <Screen>
      <header className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Quay lại"
          className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
        >
          ‹
        </button>
        <h1 className="text-[22px] font-extrabold tracking-tight">Cài đặt</h1>
      </header>

      <ProfileSection />

      <MessagingSection />

      <Link to="/dia-diem" className="card mt-3.5 flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-plum-100 text-[20px]">
          🗺️
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px]">Địa điểm quen</b>
          <span className="mt-0.5 block text-[12px] text-ink-400">
            Lưu Nhà, Công ty… để được báo khi người ấy tới nơi
          </span>
        </span>
        <span className="shrink-0 text-[16px] text-ink-300">›</span>
      </Link>

      <NotificationSection />

      <PrivacySection />

      {coupleQuery.data && <CoupleSection anniversaryAt={coupleQuery.data.anniversaryAt} />}

      <section className="card mt-3.5">
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full text-left text-[14px] font-bold text-ink-700"
        >
          Đăng xuất
        </button>
      </section>

      {coupleQuery.data && <DangerSection />}

      <p className="py-6 text-center text-[11.5px] text-ink-400">
        Beside v0.1.0 · {user.email}
      </p>
    </Screen>
  );

  // ---------------------------------------------------------------- hồ sơ

  function ProfileSection() {
    const updateProfile = useUpdateProfile(patchUser);
    const [displayName, setDisplayName] = useState(user!.displayName);
    const [birthday, setBirthday] = useState(user!.birthday ?? '');
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [saved, setSaved] = useState(false);

    const todayVn = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    async function submit(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setFieldErrors({});
      setSaved(false);

      const parsed = updateProfileSchema.safeParse({
        displayName,
        birthday: birthday === '' ? null : birthday,
      });
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const i of parsed.error.issues) {
          const k = String(i.path[0] ?? '_');
          errs[k] ??= i.message;
        }
        setFieldErrors(errs);
        return;
      }

      try {
        await updateProfile.mutateAsync({
          displayName,
          birthday: birthday === '' ? null : birthday,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
      }
    }

    return (
      <form onSubmit={submit} noValidate className="card flex flex-col gap-4">
        <SectionTitle emoji="🙋" title="Hồ sơ của bạn" />
        <FormError message={error} />

        <Field
          label="Tên hiển thị"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors.displayName}
          hint="Tên người ấy nhìn thấy"
        />

        <Field
          label="Ngày sinh"
          name="birthday"
          type="date"
          max={todayVn}
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          error={fieldErrors.birthday}
          hint="Để trống nếu không muốn khai"
        />

        <SaveButton pending={updateProfile.isPending} saved={saved} />
      </form>
    );
  }

  // ---------------------------------------------------------------- nhắn tin

  function MessagingSection() {
    const updateProfile = useUpdateProfile(patchUser);
    const [app, setApp] = useState<MessagingApp>(user!.messagingApp as MessagingApp);
    const [handle, setHandle] = useState(user!.messagingHandle ?? '');
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);

    // Xem trước ngay khi gõ — người dùng biết mình nhập đúng hay chưa
    // trước cả khi bấm Lưu.
    const preview = buildMessagingUrl({ app, handle: handle.trim() || null });

    useEffect(() => setSaved(false), [app, handle]);

    async function submit(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setFieldError(undefined);

      if (handle.trim() !== '' && preview === null) {
        setFieldError(
          app === 'MESSENGER'
            ? 'Username Facebook: bắt đầu bằng chữ cái, 5–50 ký tự. Đây không phải số điện thoại.'
            : 'Nhập số điện thoại Việt Nam, ví dụ 0912345678',
        );
        return;
      }

      try {
        await updateProfile.mutateAsync({
          messagingApp: app,
          messagingHandle: handle.trim() === '' ? null : handle.trim(),
        });
        setSaved(true);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setFieldError(err.fieldError('messagingHandle'));
          if (!err.fieldError('messagingHandle')) setError(err.message);
        } else {
          setError('Không lưu được');
        }
      }
    }

    return (
      <form onSubmit={submit} noValidate className="card mt-3.5 flex flex-col gap-4">
        <SectionTitle emoji="💬" title="Nút nhắn tin" />
        <p className="-mt-2 text-[12.5px] leading-relaxed text-ink-500">
          Beside không có chat riêng. Nút “Nhắn tin” sẽ mở thẳng app bên dưới —
          người ấy bấm là nhắn được cho bạn.
        </p>

        <FormError message={error} />

        <div>
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">
            Mở bằng
          </span>
          <div className="grid grid-cols-2 gap-2">
            {MESSAGING_APPS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setApp(a)}
                aria-pressed={app === a}
                className={`min-h-11 rounded-2xl border-[1.5px] text-[13.5px] font-bold transition ${
                  app === a
                    ? 'border-love-400 bg-love-50 text-love-700'
                    : 'border-ink-200 bg-white text-ink-700'
                }`}
              >
                {MESSAGING_APP_LABELS[a]}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={app === 'MESSENGER' ? 'Username Facebook' : 'Số điện thoại'}
          name="messagingHandle"
          inputMode={app === 'MESSENGER' ? 'text' : 'tel'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={app === 'MESSENGER' ? 'nguyen.an' : '0912345678'}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={fieldError}
          hint="Để trống thì nút nhắn tin sẽ được ẩn đi"
        />

        {preview && (
          <p className="-mt-1 truncate rounded-2xl bg-mint-100 px-3 py-2 text-[12px] font-semibold text-[#127A5E]">
            ✓ Sẽ mở: {preview}
          </p>
        )}

        <SaveButton pending={updateProfile.isPending} saved={saved} />
      </form>
    );
  }

  // ---------------------------------------------------------------- thong bao

  function NotificationSection() {
    const push = usePush();

    // Ba thứ phải cùng đúng mới nhận được thông báo (hỗ trợ · quyền · đã đăng
    // ký). Người dùng hay nhầm giữa chúng, nên mỗi trạng thái nói rõ đang thiếu
    // cái nào và phải làm gì tiếp.
    const COPY: Record<string, { desc: string; action: 'toggle' | 'none' }> = {
      checking: { desc: 'Đang kiểm tra...', action: 'none' },
      unsupported: {
        desc: 'Trình duyệt này không hỗ trợ thông báo đẩy. Thử Chrome hoặc Safari bản mới.',
        action: 'none',
      },
      'need-install': {
        desc: 'Trên iPhone phải "Thêm vào màn hình chính" trước, rồi mở app từ đó mới bật được thông báo.',
        action: 'none',
      },
      'server-off': {
        desc: 'Máy chủ chưa bật thông báo đẩy (thiếu khoá VAPID).',
        action: 'none',
      },
      denied: {
        desc: 'Bạn đã chặn thông báo cho trang này. Mở lại trong phần cài đặt của trình duyệt.',
        action: 'none',
      },
      off: {
        desc: 'Nhắc trước mỗi cuộc hẹn, và báo khi người ấy tới nơi.',
        action: 'toggle',
      },
      on: {
        desc: 'Đang bật trên thiết bị này.',
        action: 'toggle',
      },
    };

    const copy = COPY[push.state] ?? COPY.checking!;

    return (
      <section className="card mt-3.5">
        <SectionTitle emoji="🔔" title="Thông báo" />
        <FormError message={push.error} />

        <div className="mt-1">
          <Toggle
            emoji="📣"
            title="Thông báo đẩy"
            desc={copy.desc}
            on={push.state === 'on'}
            pending={push.busy || copy.action === 'none'}
            onChange={(v) => void (v ? push.enable() : push.disable())}
          />
        </div>

        {push.state === 'on' && (
          <button
            type="button"
            disabled={push.busy}
            onClick={() => void push.sendTest()}
            className="mt-2 min-h-11 w-full rounded-2xl bg-ink-100 text-[13.5px] font-bold text-ink-700 disabled:opacity-50"
          >
            Gửi thử một thông báo
          </button>
        )}
      </section>
    );
  }

  // ---------------------------------------------------------------- rieng tu

  function PrivacySection() {
    const updatePrivacy = useUpdatePrivacy(patchUser);
    const privacy = user!.privacy;
    const [error, setError] = useState<string | null>(null);

    async function toggle(patch: Parameters<typeof updatePrivacy.mutateAsync>[0]) {
      setError(null);
      try {
        await updatePrivacy.mutateAsync(patch);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
      }
    }

    return (
      <section className="card mt-3.5">
        <SectionTitle emoji="🔒" title="Quyền riêng tư" />
        <FormError message={error} />

        <div className="mt-1">
          <Toggle
            emoji="👻"
            title="Chế độ ẩn danh"
            desc="Tạm ẩn hoàn toàn. Server sẽ KHÔNG ghi lại và KHÔNG gửi vị trí của bạn đi."
            on={privacy.ghostMode}
            pending={updatePrivacy.isPending}
            onChange={(v) => void toggle({ ghostMode: v })}
          />
          <Toggle
            emoji="📡"
            title="Chia sẻ vị trí trực tiếp"
            desc="Tắt thì người ấy chỉ thấy vị trí lần cuối bạn mở app."
            on={privacy.shareLive}
            pending={updatePrivacy.isPending || privacy.ghostMode}
            onChange={(v) => void toggle({ shareLive: v })}
          />
          <Toggle
            emoji="🎯"
            title="Làm mờ vị trí"
            desc="Người ấy chỉ thấy bạn trong bán kính 500m thay vì chính xác."
            on={privacy.fuzzRadiusM > 0}
            pending={updatePrivacy.isPending}
            onChange={(v) => void toggle({ fuzzRadiusM: v ? 500 : 0 })}
          />
        </div>

        {privacy.ghostMode && (
          <p className="mt-2 rounded-2xl bg-ink-100 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
            Đang ẩn danh — người ấy không thấy vị trí mới của bạn, và app cũng không
            lưu lại gì cả. Lịch sử cũ vẫn còn.
          </p>
        )}
      </section>
    );
  }

  // ---------------------------------------------------------------- couple

  function CoupleSection({ anniversaryAt }: { anniversaryAt: string }) {
    const updateAnniversary = useUpdateAnniversary();
    const [date, setDate] = useState(anniversaryAt);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);

    const todayVn = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    async function submit(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setFieldError(undefined);
      setSaved(false);

      try {
        await updateAnniversary.mutateAsync(date);
        setSaved(true);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setFieldError(err.fieldError('anniversaryAt'));
          if (!err.fieldError('anniversaryAt')) setError(err.message);
        } else {
          setError('Không lưu được');
        }
      }
    }

    return (
      <form onSubmit={submit} noValidate className="card mt-3.5 flex flex-col gap-4">
        <SectionTitle emoji="💞" title="Chuyện của hai đứa" />
        <FormError message={error} />

        <Field
          label="Ngày bắt đầu yêu"
          name="anniversaryAt"
          type="date"
          max={todayVn}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError}
          hint="Bộ đếm ngày yêu tính từ ngày này"
        />

        <SaveButton pending={updateAnniversary.isPending} saved={saved} />
      </form>
    );
  }

  // ---------------------------------------------------------------- huỷ ghép

  function DangerSection() {
    const unpair = useUnpair();
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function doUnpair() {
      setError(null);
      try {
        await unpair.mutateAsync();
        void navigate('/ghep-doi', { replace: true });
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Không huỷ được');
      }
    }

    return (
      <section className="card mt-3.5 border-love-200">
        <SectionTitle emoji="💔" title="Huỷ ghép đôi" />
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
          Xoá vĩnh viễn toàn bộ dữ liệu chung: vị trí, kỷ niệm, lịch trình, địa điểm.
          Tài khoản của hai người vẫn còn. <b>Không thể khôi phục.</b>
        </p>

        <FormError message={error} />

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 w-full rounded-full border-[1.5px] border-love-300 py-3 text-[14px] font-bold text-love-600"
          >
            Tôi muốn huỷ ghép đôi
          </button>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn-ghost flex-1"
            >
              Thôi, giữ lại
            </button>
            <button
              type="button"
              onClick={() => void doUnpair()}
              disabled={unpair.isPending}
              className="min-h-12 flex-1 rounded-full bg-love-600 px-5 text-[15px] font-bold text-white disabled:opacity-55"
            >
              {unpair.isPending ? 'Đang huỷ...' : 'Xoá hết'}
            </button>
          </div>
        )}
      </section>
    );
  }
}

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-bold">
      <span aria-hidden>{emoji}</span>
      {title}
    </h2>
  );
}

function Toggle({
  emoji,
  title,
  desc,
  on,
  pending,
  onChange,
}: {
  emoji: string;
  title: string;
  desc: string;
  on: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-100 py-3 first:border-t-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-love-50 text-[18px]">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[14px]">{title}</b>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={pending}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-[46px] shrink-0 rounded-full transition disabled:opacity-50 ${
          on ? 'bg-love-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
            on ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

function SaveButton({ pending, saved }: { pending: boolean; saved: boolean }) {
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Đang lưu...' : saved ? '✓ Đã lưu' : 'Lưu thay đổi'}
    </button>
  );
}
