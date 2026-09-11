import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ADDRESS_MAX_LENGTH,
  BIO_MAX_LENGTH,
  DISPLAY_TIMEZONE,
  updateProfileSchema,
} from '@beside/shared';
import type { SelfUser } from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { useRemoveAvatar, useSetAvatar, useUpdateProfile } from '@/lib/profile-api';
import Avatar from '@/components/Avatar';
import { Field, FormError, Spinner, TextAreaField } from '@/components/ui';
import { GroupNote, SaveBar, SubScreen } from './SettingsKit';

const FORM_ID = 'profile-form';

/**
 * Hồ sơ cá nhân: ảnh đại diện, tên, ngày sinh, giới thiệu, địa chỉ.
 *
 * Ảnh đứng TÁCH khỏi biểu mẫu và gửi đi ngay khi chọn — trộn vào nút Lưu chung
 * thì phải giữ tệp trong state tới lúc submit, thêm một đường để lệch giữa thứ
 * đang thấy và thứ đã lưu.
 */
export default function ProfileScreen() {
  const { user, patchUser } = useAuth();
  const updateProfile = useUpdateProfile(patchUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [birthday, setBirthday] = useState(user?.birthday ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  if (!user) return <Spinner />;

  const todayVn = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TIMEZONE });

  // Có gì khác so với thứ đang lưu không — nút Lưu chỉ sáng khi thật sự có.
  const dirty =
    displayName !== user.displayName ||
    birthday !== (user.birthday ?? '') ||
    bio !== (user.bio ?? '') ||
    address !== (user.address ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);

    /*
     * Chuỗi rỗng nghĩa là "xoá thông tin này", và `optionalText` trong
     * `updateProfileSchema` (dùng chung FE + BE) là nơi DUY NHẤT định nghĩa
     * luật đó — server tự dịch `''` thành `null` dù client gửi gì.
     *
     * Đổi ở đây cho payload nói đúng ý định ngay từ lúc rời máy người dùng,
     * nhưng đừng nhầm nó là chốt chặn: bỏ dòng này đi hành vi vẫn đúng.
     */
    const payload = {
      displayName,
      birthday: birthday === '' ? null : birthday,
      bio: bio.trim() === '' ? null : bio,
      address: address.trim() === '' ? null : address,
    };

    const parsed = updateProfileSchema.safeParse(payload);
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
      await updateProfile.mutateAsync(payload);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
    }
  }

  return (
    <SubScreen
      title="Hồ sơ cá nhân"
      subtitle="Người ấy nhìn thấy những thông tin này"
      footer={
        <SaveBar
          formId={FORM_ID}
          dirty={dirty}
          pending={updateProfile.isPending}
          saved={saved}
        />
      }
    >
      <AvatarPicker user={user} patchUser={patchUser} />

      <form id={FORM_ID} onSubmit={submit} noValidate className="card mt-4 flex flex-col gap-4">
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

        <TextAreaField
          label="Vài dòng về bạn"
          name="bio"
          rows={3}
          maxLength={BIO_MAX_LENGTH}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          error={fieldErrors.bio}
          hint="Người ấy sẽ đọc được"
        />

        <Field
          label="Địa chỉ"
          name="address"
          maxLength={ADDRESS_MAX_LENGTH + 20}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={fieldErrors.address}
          hint="Chỉ để người ấy biết — không dùng để định vị hay tính khoảng cách"
        />
      </form>

      <GroupNote>
        Email đăng nhập ({user.email}) không đổi được trong app.
      </GroupNote>
    </SubScreen>
  );
}

// ---------------------------------------------------------------------------

/**
 * Ảnh đại diện — component CẤP MODULE, không lồng trong màn hình.
 *
 * Component định nghĩa bên trong một component khác sinh ra một kiểu mới sau
 * mỗi lần vẽ, nên React tháo và dựng lại nó liên tục: gõ một chữ vào ô tên là
 * mất trạng thái "Đang tải lên…" và mất luôn câu lỗi vừa hiện. Bản cũ dính
 * đúng lỗi này.
 */
function AvatarPicker({
  user,
  patchUser,
}: {
  user: SelfUser;
  patchUser: (next: SelfUser) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setAvatar = useSetAvatar(patchUser);
  const removeAvatar = useRemoveAvatar(patchUser);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const busy = setAvatar.isPending || removeAvatar.isPending;

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cho phép chọn LẠI đúng tệp vừa chọn: không xoá value thì sự kiện
    // `change` không bắn lần hai và người dùng tưởng app bị treo.
    e.target.value = '';
    if (!file) return;

    setAvatarError(null);
    try {
      await setAvatar.mutateAsync(file);
    } catch (err) {
      // Nói ra nguyên nhân thật. Lỗi ở đây có thể tới từ khâu NÉN ẢNH ngay
      // trên máy (ảnh hỏng, trình duyệt không dựng được canvas) chứ không chỉ
      // từ server — nuốt hết vào một câu chung chung thì không ai gỡ nổi.
      setAvatarError(
        err instanceof Error && err.message ? err.message : 'Không tải được ảnh lên',
      );
    }
  }

  return (
    <section className="card flex flex-col items-center py-6">
      {/*
        Cả khối ảnh là một nút, có huy hiệu máy ảnh ở góc: đây là cử chỉ ai
        cũng thử đầu tiên. Hai nút xếp cạnh ảnh như bản cũ vừa tốn chỗ vừa
        không ai đoán được nút nào làm gì trước khi đọc.
      */}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={user.avatarUrl ? 'Đổi ảnh đại diện' : 'Chọn ảnh đại diện'}
        className="relative rounded-full disabled:opacity-60"
      >
        <Avatar
          url={user.avatarUrl}
          name={user.displayName}
          size={104}
          className="ring-[3px] ring-white shadow-[0_8px_24px_rgba(35,19,32,0.16)]"
        />
        <span
          aria-hidden
          className="love-gradient absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-[3px] border-white text-[15px] text-white"
        >
          {setAvatar.isPending ? '···' : '📷'}
        </span>
      </button>

      <p className="mt-3 text-[13px] font-bold">
        {setAvatar.isPending ? 'Đang tải lên…' : user.displayName}
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-400">
        Chạm vào ảnh để {user.avatarUrl ? 'đổi' : 'chọn'} · ảnh được xoá EXIF trước khi lưu
      </p>

      {user.avatarUrl && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAvatarError(null);
            removeAvatar.mutate();
          }}
          className="mt-2 min-h-11 px-4 text-[12.5px] font-bold text-ink-400 disabled:opacity-50"
        >
          Gỡ ảnh
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e)}
      />

      {avatarError && (
        <p role="alert" className="mt-2 text-center text-[12px] font-semibold text-love-600">
          {avatarError}
        </p>
      )}
    </section>
  );
}
