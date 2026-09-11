import { useEffect, useState, type FormEvent } from 'react';
import {
  buildMessagingUrl,
  MESSAGING_APP_LABELS,
  MESSAGING_APPS,
  type MessagingApp,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { useUpdateProfile } from '@/lib/profile-api';
import { Field, FormError, Spinner } from '@/components/ui';
import { GroupNote, SaveBar, SubScreen } from './SettingsKit';

const FORM_ID = 'messaging-form';

/**
 * Nút nhắn tin (F9) — Beside cố tình KHÔNG có chat riêng, chỉ mở app ngoài.
 *
 * Xem trước link ngay khi gõ: người dùng biết mình nhập đúng hay chưa trước cả
 * khi bấm Lưu, thay vì phải quay sang màn Nhà bấm thử.
 */
export default function MessagingScreen() {
  const { user, patchUser } = useAuth();
  const updateProfile = useUpdateProfile(patchUser);

  const [app, setApp] = useState<MessagingApp>(
    (user?.messagingApp as MessagingApp) ?? 'ZALO',
  );
  const [handle, setHandle] = useState(user?.messagingHandle ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => setSaved(false), [app, handle]);

  if (!user) return <Spinner />;

  const preview = buildMessagingUrl({ app, handle: handle.trim() || null });
  const dirty = app !== user.messagingApp || handle.trim() !== (user.messagingHandle ?? '');

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
    <SubScreen
      title="Nút nhắn tin"
      subtitle="Người ấy bấm là mở thẳng app bên ngoài"
      footer={
        <SaveBar
          formId={FORM_ID}
          dirty={dirty}
          pending={updateProfile.isPending}
          saved={saved}
        />
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="card flex flex-col gap-4">
        <FormError message={error} />

        <div>
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-700">Mở bằng</span>
          <div className="grid grid-cols-2 gap-2">
            {MESSAGING_APPS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setApp(a)}
                aria-pressed={app === a}
                className={`min-h-12 rounded-2xl border-[1.5px] text-[13.5px] font-bold transition ${
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
          <p className="-mt-1 truncate rounded-2xl bg-mint-100 px-3 py-2.5 text-[12px] font-semibold text-[#127A5E]">
            ✓ Sẽ mở: {preview}
          </p>
        )}
      </form>

      <GroupNote>
        Beside không có chat trong app. Cách này giữ mọi cuộc trò chuyện ở nơi hai
        người vẫn nhắn hằng ngày, và app không phải giữ lại tin nhắn nào.
      </GroupNote>
    </SubScreen>
  );
}
