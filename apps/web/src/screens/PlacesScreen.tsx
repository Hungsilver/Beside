import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlaceSchema,
  PLACE_EMOJIS,
  PLACE_NAME_MAX,
  PLACE_RADIUS_DEFAULT_M,
  PLACE_RADIUS_MAX_M,
  PLACE_RADIUS_MIN_M,
  MAX_PLACES_PER_COUPLE,
  type CreatePlaceInput,
  type PlaceResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCouple } from '@/lib/couple-api';
import {
  getCurrentCoords,
  useCreatePlace,
  useDeletePlace,
  usePlaces,
  useUpdatePlace,
} from '@/lib/places-api';
import { FormError, Screen, Spinner } from '@/components/ui';
import PlacePicker from '@/components/PlacePicker';

export default function PlacesScreen() {
  const { user } = useAuth();
  const coupleQuery = useCouple();
  const query = usePlaces();
  const [editing, setEditing] = useState<PlaceResponse | 'new' | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);

  const places = query.data ?? [];
  const partner = coupleQuery.data?.partner ?? null;

  async function addHere() {
    setLocError(null);
    setLocating(true);
    try {
      const coords = await getCurrentCoords();
      setDraftCoords({ lat: coords.lat, lng: coords.lng });
      setEditing('new');
    } catch (e) {
      setLocError(e instanceof Error ? e.message : 'Không lấy được vị trí');
    } finally {
      setLocating(false);
    }
  }

  function nameOf(userId: string): string {
    if (userId === user?.id) return 'Bạn';
    if (userId === partner?.id) return partner.displayName;
    return 'Ai đó';
  }

  return (
    <Screen>
      <header className="flex items-center gap-3 py-4">
        <Link
          to="/cai-dat"
          aria-label="Quay lại"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            {places.length}/{MAX_PLACES_PER_COUPLE} địa điểm
          </p>
          <h1 className="text-[22px] font-extrabold tracking-tight">Địa điểm quen</h1>
        </div>
      </header>

      <p className="rounded-2xl bg-love-50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
        Lưu những nơi hai đứa hay tới. Khi ai đó tới nơi hoặc rời đi, người kia sẽ
        nhận được thông báo — không cần nhắn "về tới chưa".
      </p>

      <FormError message={locError} />

      <button
        type="button"
        onClick={() => void addHere()}
        disabled={locating || places.length >= MAX_PLACES_PER_COUPLE}
        className="btn-primary mt-3.5 w-full disabled:opacity-45"
      >
        {locating ? 'Đang lấy vị trí...' : '📍 Lưu chỗ tôi đang đứng'}
      </button>

      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={places.length >= MAX_PLACES_PER_COUPLE}
        className="btn-ghost mt-2.5 w-full disabled:opacity-45"
      >
        🗺️ Chọn trên bản đồ
      </button>

      {places.length >= MAX_PLACES_PER_COUPLE && (
        <p className="mt-2 text-center text-[12px] text-ink-400">
          Đã đủ {MAX_PLACES_PER_COUPLE} địa điểm — xoá bớt chỗ cũ để thêm chỗ mới.
        </p>
      )}

      {query.isLoading ? (
        <Spinner label="Đang tải địa điểm..." />
      ) : query.isError ? (
        <p role="alert" className="mt-6 text-[13px] font-semibold text-love-600">
          Không tải được danh sách. Kiểm tra kết nối rồi thử lại nhé.
        </p>
      ) : places.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="text-[40px]">🗺️</span>
          <p className="max-w-[250px] text-[13.5px] leading-relaxed text-ink-500">
            Chưa lưu nơi nào. Thử lưu "Nhà" trước — đó là chỗ hay được hỏi nhất.
          </p>
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-2.5">
          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => setEditing(place)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-black/[0.04] bg-white p-3.5 text-left shadow-[0_2px_8px_rgba(35,19,32,0.05)]"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-[20px]">
                  {place.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{place.name}</b>
                  <span className="mt-0.5 block text-[12px] text-ink-400">
                    Bán kính {place.radiusM}m
                    {place.notifyOnArrive && ' · báo khi tới'}
                    {place.notifyOnLeave && ' · báo khi rời'}
                  </span>
                  {place.peopleInside.length > 0 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-[#03372A]">
                      <i className="size-1.5 animate-pulse rounded-full bg-[#03A47B]" />
                      {place.peopleInside.map(nameOf).join(' · ')} đang ở đây
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[16px] text-ink-300">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="h-8" />

      {picking && (
        <PlacePicker
          places={places}
          onCancel={() => setPicking(false)}
          onPick={(coords) => {
            setPicking(false);
            setDraftCoords(coords);
            setEditing('new');
          }}
        />
      )}

      {editing && (
        <PlaceSheet
          place={editing === 'new' ? null : editing}
          draftCoords={draftCoords}
          onClose={() => {
            setEditing(null);
            setDraftCoords(null);
          }}
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function PlaceSheet({
  place,
  draftCoords,
  onClose,
}: {
  place: PlaceResponse | null;
  draftCoords: { lat: number; lng: number } | null;
  onClose: () => void;
}) {
  const create = useCreatePlace();
  const update = useUpdatePlace();
  const remove = useDeletePlace();

  const [name, setName] = useState(place?.name ?? '');
  const [emoji, setEmoji] = useState(place?.emoji ?? '📍');
  const [radiusM, setRadiusM] = useState(place?.radiusM ?? PLACE_RADIUS_DEFAULT_M);
  const [notifyOnArrive, setArrive] = useState(place?.notifyOnArrive ?? true);
  const [notifyOnLeave, setLeave] = useState(place?.notifyOnLeave ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const coords = place ? { lat: place.lat, lng: place.lng } : draftCoords;
  const busy = create.isPending || update.isPending || remove.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!coords) {
      setError('Chưa có toạ độ cho địa điểm này');
      return;
    }

    // Kiểm bằng CHÍNH schema server dùng — sai thì biết ngay, không chờ vòng mạng.
    const parsed = createPlaceSchema.safeParse({
      name,
      emoji,
      lat: coords.lat,
      lng: coords.lng,
      radiusM,
      notifyOnArrive,
      notifyOnLeave,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Thông tin chưa hợp lệ');
      return;
    }

    try {
      const input: CreatePlaceInput = parsed.data;
      if (place) await update.mutateAsync({ id: place.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không lưu được');
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div className="relative max-h-[88%] overflow-y-auto rounded-t-[28px] bg-white pb-[max(env(safe-area-inset-bottom),20px)] shadow-[0_-8px_40px_rgba(35,19,32,0.18)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.05] bg-white/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-left text-[14px] font-semibold text-ink-500"
          >
            Huỷ
          </button>
          <b className="text-[15px]">{place ? 'Sửa địa điểm' : 'Địa điểm mới'}</b>
          <button
            type="submit"
            form="place-form"
            disabled={busy}
            className="min-h-11 rounded-full bg-love-500 px-4 text-[14px] font-bold text-white disabled:opacity-45"
          >
            {busy ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>

        <form id="place-form" onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          <FormError message={error} />

          <div className="flex items-start gap-2.5">
            <select
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label="Biểu tượng"
              className="h-12 w-16 shrink-0 rounded-2xl border-[1.5px] border-ink-200 bg-white text-center text-[20px]"
            >
              {PLACE_EMOJIS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, PLACE_NAME_MAX))}
              placeholder="Nhà em, Công ty anh, Quán quen..."
              className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink-200 px-3.5 text-[15px] outline-none focus:border-love-400"
            />
          </div>

          {/* Bán kính */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-ink-700">Bán kính</span>
              <b className="text-[13px] tabular-nums text-love-600">{radiusM}m</b>
            </div>
            <input
              type="range"
              min={PLACE_RADIUS_MIN_M}
              max={PLACE_RADIUS_MAX_M}
              step={10}
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              aria-label="Bán kính hàng rào"
              className="h-11 w-full accent-love-500"
            />
            <p className="text-[11.5px] leading-relaxed text-ink-400">
              Nhỏ hơn {PLACE_RADIUS_MIN_M}m thì GPS nhiễu sẽ báo loạn. Trong nhà cao
              tầng hoặc khu nhiều nhà cao nên để rộng hơn.
            </p>
          </div>

          {/* Thông báo */}
          <div className="flex flex-col gap-3">
            <ToggleRow
              title="Báo khi tới nơi"
              desc="Người ấy biết bạn vừa tới đây"
              on={notifyOnArrive}
              onChange={setArrive}
            />
            <ToggleRow
              title="Báo khi rời đi"
              desc="Ít cần hơn — bật lên là số thông báo tăng gấp đôi"
              on={notifyOnLeave}
              onChange={setLeave}
            />
          </div>

          <p className="rounded-2xl bg-ink-100 px-4 py-3 text-[11.5px] leading-relaxed text-ink-600">
            🔒 Bật <b>ẩn danh</b> thì hàng rào ngừng hoạt động hoàn toàn. Bật{' '}
            <b>làm mờ vị trí</b> rộng hơn bán kính này thì vẫn ghi lại cho bạn nhưng
            không báo cho người ấy.
          </p>

          {coords && (
            <p className="text-center text-[11px] tabular-nums text-ink-300">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}

          {place &&
            (confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-12 flex-1 rounded-2xl bg-ink-100 text-[14px] font-bold text-ink-600"
                >
                  Thôi
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void remove
                      .mutateAsync(place.id)
                      .then(onClose)
                      .catch(() => setError('Không xoá được'))
                  }
                  className="min-h-12 flex-1 rounded-2xl bg-love-600 text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {remove.isPending ? 'Đang xoá...' : 'Xoá hẳn'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-12 w-full rounded-2xl border-[1.5px] border-love-200 text-[14px] font-bold text-love-600"
              >
                Xoá địa điểm
              </button>
            ))}
        </form>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onChange,
}: {
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <b className="block text-[14px]">{title}</b>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-[46px] shrink-0 rounded-full transition ${
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
