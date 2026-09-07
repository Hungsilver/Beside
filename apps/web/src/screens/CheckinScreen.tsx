import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CAPTION_MAX,
  MAX_PHOTOS_PER_POST,
  MOODS,
  type Mood,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useCreatePost } from '@/lib/posts-api';
import { compressImage, formatBytes, type CompressResult } from '@/lib/image-compress';
import { FormError, Screen } from '@/components/ui';

interface Picked extends CompressResult {
  id: string;
  previewUrl: string;
}

export default function CheckinScreen() {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<Picked[]>([]);
  const [caption, setCaption] = useState('');
  const [mood, setMood] = useState<Mood | null>(null);
  const [pin, setPin] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locState, setLocState] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Thu hồi mọi blob preview khi rời màn hình — không thì rò bộ nhớ.
  //
  // Phải đi qua ref, KHÔNG được để `photos` vào mảng phụ thuộc: React chạy hàm
  // dọn dẹp của lượt trước mỗi khi phụ thuộc đổi, nên thêm tấm ảnh thứ hai sẽ
  // thu hồi luôn blob của tấm thứ nhất — ảnh đang hiển thị bị vỡ.
  const photosRef = useRef<Picked[]>([]);
  photosRef.current = photos;
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

  // Lấy toạ độ ngay khi mở màn hình, để lúc bấm Đăng là có sẵn.
  useEffect(() => {
    if (!pin || !('geolocation' in navigator) || locState !== 'idle') return;

    setLocState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
        });
        setLocState('ok');
      },
      (err) => setLocState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [pin, locState]);

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const room = MAX_PHOTOS_PER_POST - photos.length;
    if (room <= 0) {
      setError(`Tối đa ${MAX_PHOTOS_PER_POST} ảnh mỗi khoảnh khắc`);
      return;
    }

    setBusy(true);
    try {
      const picked: Picked[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const result = await compressImage(file);
        picked.push({
          ...result,
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          previewUrl: URL.createObjectURL(result.blob),
        });
      }
      setPhotos((prev) => [...prev, ...picked]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được ảnh này');
    } finally {
      setBusy(false);
      // Đặt lại input để chọn cùng một tệp lần nữa vẫn kích hoạt onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || createPost.isPending) return;

    setError(null);
    if (photos.length === 0) {
      setError('Chọn ít nhất một tấm ảnh nhé');
      return;
    }

    const form = new FormData();
    photos.forEach((p, i) => form.append('photos', p.blob, `anh-${i}.webp`));
    if (caption.trim()) form.append('caption', caption.trim());
    if (mood) form.append('mood', mood);
    if (pin && coords) {
      form.append('lat', String(coords.lat));
      form.append('lng', String(coords.lng));
    }

    try {
      await createPost.mutateAsync(form);
      navigate('/ky-niem', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Không đăng được, thử lại nhé',
      );
    }
  }

  const savedBytes = photos.reduce((s, p) => s + (p.originalBytes - p.compressedBytes), 0);

  return (
    <Screen>
      <header className="flex items-center justify-between py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
          aria-label="Đóng"
        >
          ✕
        </button>
        <h1 className="text-[17px] font-bold">Khoảnh khắc mới</h1>
        <button
          type="submit"
          form="checkin-form"
          disabled={createPost.isPending || busy || photos.length === 0}
          className="min-h-10 rounded-full bg-love-500 px-5 text-[14px] font-bold text-white disabled:opacity-45"
        >
          {createPost.isPending ? 'Đang đăng...' : 'Đăng'}
        </button>
      </header>

      <form id="checkin-form" onSubmit={submit} className="flex flex-col gap-3.5 pb-28">
        <FormError message={error} />

        {/* Ảnh */}
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-hero)] border-2 border-dashed border-love-200 bg-love-50 text-love-600"
          >
            <span className="text-[40px]">📸</span>
            <b className="text-[15px]">{busy ? 'Đang xử lý ảnh...' : 'Chọn ảnh'}</b>
            <span className="text-[12px] text-ink-400">Tối đa {MAX_PHOTOS_PER_POST} ảnh</span>
          </button>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <div key={p.id} className="relative shrink-0">
                <img
                  src={p.previewUrl}
                  alt=""
                  className="size-40 rounded-[var(--radius-card)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label="Bỏ ảnh này"
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-[13px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS_PER_POST && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex size-40 shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border-2 border-dashed border-ink-200 text-ink-400"
              >
                <span className="text-[26px]">＋</span>
                <span className="text-[11px]">Thêm ảnh</span>
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          // capture="environment" mở thẳng camera sau trên điện thoại.
          className="hidden"
          onChange={(e) => void pickFiles(e.target.files)}
        />

        {savedBytes > 0 && (
          <p className="-mt-1 text-[11.5px] text-ink-400">
            Đã nén trước khi gửi — tiết kiệm {formatBytes(savedBytes)} dung lượng mạng
          </p>
        )}

        {/* Lời nhắn */}
        <div className="card">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
            rows={3}
            placeholder="Kể cho người ấy nghe điều gì đó..."
            className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-400"
          />
          <p className="mt-1 text-right text-[11px] text-ink-300">
            {caption.length}/{CAPTION_MAX}
          </p>
        </div>

        {/* Tâm trạng */}
        <div>
          <span className="mb-2 block text-[12.5px] font-bold text-ink-700">Tâm trạng</span>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(mood === m ? null : m)}
                aria-pressed={mood === m}
                className={`flex size-12 items-center justify-center rounded-2xl border-[1.5px] text-[22px] transition ${
                  mood === m ? 'border-love-400 bg-love-50' : 'border-ink-200 bg-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Ghim lên bản đồ */}
        <div className="card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-plum-100 text-[18px]">
              🗺️
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[14px]">Ghim lên bản đồ chung</b>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">
                {!pin
                  ? 'Không lưu vị trí của khoảnh khắc này'
                  : locState === 'loading'
                    ? 'Đang lấy vị trí...'
                    : locState === 'ok' && coords
                      ? `Đã có vị trí · độ chính xác ${coords.acc}m`
                      : locState === 'denied'
                        ? 'Trình duyệt chặn quyền vị trí — sẽ đăng mà không ghim'
                        : locState === 'error'
                          ? 'Không lấy được vị trí — sẽ đăng mà không ghim'
                          : 'Người ấy sẽ thấy ảnh này tại vị trí của bạn'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pin}
              aria-label="Ghim lên bản đồ chung"
              onClick={() => setPin((v) => !v)}
              className={`relative h-7 w-[46px] shrink-0 rounded-full transition ${
                pin ? 'bg-love-500' : 'bg-ink-200'
              }`}
            >
              <span
                className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
                  pin ? 'left-[21px]' : 'left-[3px]'
                }`}
              />
            </button>
          </div>
        </div>

        <p className="rounded-2xl bg-love-50 px-4 py-3 text-[11.5px] leading-relaxed text-ink-600">
          🔒 Ảnh được nén và <b>xoá sạch dữ liệu EXIF</b> (toạ độ GPS, model máy) trước khi
          lưu. Toạ độ chỉ được ghi khi bạn bật “Ghim lên bản đồ”.
        </p>
      </form>
    </Screen>
  );
}
