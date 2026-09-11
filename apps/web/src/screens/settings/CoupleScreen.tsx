import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { DISPLAY_TIMEZONE } from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCouple, useLoveSummary, useUnpair } from '@/lib/couple-api';
import { useUpdateAnniversary } from '@/lib/profile-api';
import Avatar from '@/components/Avatar';
import { Field, FormError, Spinner } from '@/components/ui';
import { GroupNote, SaveBar, SubScreen } from './SettingsKit';

const FORM_ID = 'couple-form';

/**
 * Chuyện của hai đứa: ngày bắt đầu yêu, và nút huỷ ghép đôi.
 *
 * Huỷ ghép đôi nằm Ở ĐÂY chứ không phải ngoài màn Cài đặt: nó xoá vĩnh viễn
 * toàn bộ dữ liệu chung, nên phải nằm sau một lần chạm nữa, không được ngồi
 * ngay cạnh những nút bấm hằng ngày.
 */
export default function CoupleScreen() {
  const coupleQuery = useCouple();
  const paired = (coupleQuery.data?.members.length ?? 0) >= 2;
  const loveQuery = useLoveSummary(paired);
  const updateAnniversary = useUpdateAnniversary();

  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  if (coupleQuery.isLoading) return <Spinner />;
  // Chưa ghép đôi thì màn này không có gì để nói.
  if (!coupleQuery.data || !paired) return <Navigate to="/cai-dat" replace />;

  const couple = coupleQuery.data;
  const partner = couple.partner;
  // `null` = chưa gõ gì, vẫn theo giá trị đang lưu.
  const value = date ?? couple.anniversaryAt.slice(0, 10);
  const dirty = value !== couple.anniversaryAt.slice(0, 10);
  const todayVn = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TIMEZONE });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    setSaved(false);

    try {
      await updateAnniversary.mutateAsync(value);
      setSaved(true);
      setDate(null);
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
    <SubScreen
      title="Chuyện của hai đứa"
      subtitle={partner ? `Bạn và ${partner.displayName}` : undefined}
      footer={
        <SaveBar
          formId={FORM_ID}
          dirty={dirty}
          pending={updateAnniversary.isPending}
          saved={saved}
        />
      }
    >
      {partner && (
        <section className="dusk-gradient flex items-center gap-3 rounded-[var(--radius-hero)] p-5 text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)]">
          <Avatar
            url={partner.avatarUrl}
            name={partner.displayName}
            size={52}
            className="ring-[3px] ring-white/70"
            fallbackClassName="bg-white/25 text-white"
          />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[16px]">{partner.displayName}</b>
            <p className="mt-0.5 text-[12.5px] text-white/85">
              {loveQuery.data
                ? `Đã bên nhau ${loveQuery.data.daysTogether} ngày`
                : 'Đang đếm ngày yêu...'}
            </p>
          </div>
          <span className="text-[22px]" aria-hidden>
            💞
          </span>
        </section>
      )}

      <form id={FORM_ID} onSubmit={submit} noValidate className="card mt-4 flex flex-col gap-4">
        <FormError message={error} />
        <Field
          label="Ngày bắt đầu yêu"
          name="anniversaryAt"
          type="date"
          max={todayVn}
          value={value}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError}
          hint="Bộ đếm ngày yêu và các mốc kỷ niệm đều tính từ ngày này"
        />
      </form>

      <DangerZone />
    </SubScreen>
  );
}

// ---------------------------------------------------------------------------

/** Huỷ ghép đôi — hai bước, và nói thẳng cái gì sẽ mất. */
function DangerZone() {
  const navigate = useNavigate();
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
    <>
      <section className="mt-6 rounded-[var(--radius-card)] border border-love-200 bg-love-50 p-4">
        <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-love-700">
          <span aria-hidden>💔</span>
          Huỷ ghép đôi
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700">
          Xoá vĩnh viễn toàn bộ dữ liệu chung: vị trí, kỷ niệm và ảnh, lịch trình,
          địa điểm, ván chơi. Tài khoản của hai người vẫn còn.{' '}
          <b>Không thể khôi phục.</b>
        </p>

        <FormError message={error} />

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 min-h-12 w-full rounded-full border-[1.5px] border-love-300 bg-white text-[14px] font-bold text-love-600"
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

      <GroupNote>
        Chỉ muốn rời máy này thì dùng <b>Đăng xuất</b> ở màn Cài đặt — dữ liệu
        của hai người vẫn nguyên.
      </GroupNote>
    </>
  );
}
