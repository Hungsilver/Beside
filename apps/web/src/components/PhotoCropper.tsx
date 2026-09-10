import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clampOffset,
  coverScale,
  cropRegionFor,
  fitFrame,
  type CropView,
} from '@/lib/crop-math';
import { cropBitmap, loadBitmap, type CompressResult } from '@/lib/image-compress';

/**
 * Cắt / chỉnh tỉ lệ ảnh TRƯỚC khi đăng.
 *
 * Vì sao cần: dòng kỷ niệm hiện ảnh theo tỉ lệ thật, nên một tấm chụp vội với
 * nửa khung là mặt đường sẽ chiếm cả màn hình của người ấy. Cho người đăng tự
 * chọn khung là cách rẻ nhất để mọi khoảnh khắc trông gọn gàng.
 *
 * Cách làm: khung cắt ĐỨNG YÊN giữa màn hình, ảnh di chuyển phía sau — kéo để
 * dời, chụm hai ngón hoặc kéo thanh trượt để phóng to. Toàn bộ phần hình học
 * nằm ở `lib/crop-math.ts` (có unit test), ở đây chỉ còn cử chỉ và giao diện.
 *
 * Không kéo thêm thư viện cắt ảnh nào về: mọi gói phổ biến đều nặng 30–60KB
 * cho gói tải đầu, trong khi phần việc thật chỉ là một phép biến hình.
 */

interface AspectOption {
  id: string;
  label: string;
  /** `null` = giữ nguyên tỉ lệ ảnh gốc. */
  ratio: number | null;
}

const ASPECTS: AspectOption[] = [
  { id: 'orig', label: 'Gốc', ratio: null },
  { id: 'square', label: 'Vuông 1:1', ratio: 1 },
  { id: 'portrait', label: 'Dọc 4:5', ratio: 4 / 5 },
  { id: 'classic', label: 'Ngang 4:3', ratio: 4 / 3 },
  { id: 'wide', label: 'Rộng 16:9', ratio: 16 / 9 },
];

const MAX_ZOOM = 4;

export default function PhotoCropper({
  file,
  onDone,
  onCancel,
}: {
  /** Tệp GỐC do người dùng chọn — cắt từ đây để không nén hai lần. */
  file: File;
  onDone: (result: CompressResult) => void;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [aspectId, setAspectId] = useState('orig');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  // Giải mã ảnh một lần, giữ lại bitmap cho cả xem trước lẫn lúc cắt thật.
  useEffect(() => {
    let cancelled = false;
    let created: ImageBitmap | null = null;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    void loadBitmap(file)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        created = bmp;
        setBitmap(bmp);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc được ảnh này');
      });

    return () => {
      cancelled = true;
      created?.close();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Khoá cuộn nền + Esc để thoát.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  /*
   * Kích thước vùng chứa đo bằng ResizeObserver chứ không lấy một lần lúc mở:
   * xoay ngang điện thoại hoặc bàn phím ảo bật lên là chiều cao đổi, mà khung
   * cắt tính sai kích thước thì vùng ảnh cắt ra lệch hẳn so với thứ nhìn thấy.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bitmap]);

  const imageW = bitmap?.width ?? 0;
  const imageH = bitmap?.height ?? 0;

  const aspect = useMemo(() => {
    const option = ASPECTS.find((a) => a.id === aspectId) ?? ASPECTS[0]!;
    if (option.ratio !== null) return option.ratio;
    return imageW > 0 && imageH > 0 ? imageW / imageH : 1;
  }, [aspectId, imageW, imageH]);

  const frame = useMemo(
    () => fitFrame(aspect, stage.width, stage.height),
    [aspect, stage.width, stage.height],
  );

  const view: CropView = {
    imageW,
    imageH,
    frameW: frame.width,
    frameH: frame.height,
    zoom,
    offsetX: offset.x,
    offsetY: offset.y,
  };

  const scale = coverScale(view) * Math.max(1, zoom);

  // Đổi tỉ lệ khung thì đưa ảnh về giữa: giữ nguyên độ dời cũ sẽ cho ra một
  // khung nhìn lệch lạc mà người dùng không hiểu vì sao.
  function pickAspect(id: string) {
    setAspectId(id);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function applyZoom(next: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    // Thu nhỏ lại có thể làm độ dời cũ vượt biên ⇒ kẹp lại ngay.
    setOffset((o) => clampOffset({ ...view, zoom: z, offsetX: o.x, offsetY: o.y }));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!bitmap) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
      dragRef.current = null;
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, offset };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      applyZoom((distance / pinchRef.current.distance) * pinchRef.current.zoom);
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    setOffset(
      clampOffset({
        ...view,
        offsetX: drag.offset.x + (e.clientX - drag.x),
        offsetY: drag.offset.y + (e.clientY - drag.y),
      }),
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }

  async function confirm() {
    if (!bitmap || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cropBitmap(bitmap, cropRegionFor(view), file.size);
      onDone(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không cắt được ảnh này');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#12080F]"
      role="dialog"
      aria-modal="true"
      aria-label="Chỉnh tỉ lệ ảnh"
    >
      <header className="flex shrink-0 items-center justify-between px-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-full px-4 text-[14px] font-semibold text-white/80"
        >
          Huỷ
        </button>
        <b className="text-[14.5px] text-white">Chỉnh ảnh</b>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!bitmap || busy}
          className="min-h-11 rounded-full px-4 text-[14px] font-bold text-love-300 disabled:opacity-40"
        >
          {busy ? 'Đang cắt...' : 'Xong'}
        </button>
      </header>

      {/*
        Đo kích thước ở thẻ TRONG, không phải thẻ có padding: `clientWidth` tính
        cả padding, lấy nhầm là khung cắt rộng hơn chỗ thật sự còn trống và ảnh
        bị tràn ra ngoài mép.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-3">
        <div ref={stageRef} className="relative flex size-full items-center justify-center">
        {error ? (
          <p role="alert" className="px-6 text-center text-[13px] font-semibold text-white/85">
            {error}
          </p>
        ) : !bitmap || !previewUrl ? (
          <p className="text-[13px] font-semibold text-white/70">Đang mở ảnh...</p>
        ) : (
          <div
            className="relative touch-none select-none overflow-hidden rounded-[18px] bg-black"
            style={{ width: frame.width, height: frame.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={previewUrl}
              alt="Ảnh đang chỉnh"
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: imageW * scale,
                height: imageH * scale,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />

            {/* Lưới một phần ba — mẹo bố cục quen thuộc của mọi app máy ảnh. */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <span className="absolute left-1/3 top-0 h-full w-px bg-white/25" />
              <span className="absolute left-2/3 top-0 h-full w-px bg-white/25" />
              <span className="absolute left-0 top-1/3 h-px w-full bg-white/25" />
              <span className="absolute left-0 top-2/3 h-px w-full bg-white/25" />
              <span className="absolute inset-0 rounded-[18px] ring-2 ring-white/70" />
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-1">
        <div className="flex items-center gap-3">
          <span className="text-[15px] text-white/70" aria-hidden>
            −
          </span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!bitmap}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Mức phóng to"
            className="h-11 flex-1 accent-love-400"
          />
          <span className="text-[15px] text-white/70" aria-hidden>
            +
          </span>
        </div>

        <div className="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4">
          {ASPECTS.map((a) => {
            const on = a.id === aspectId;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => pickAspect(a.id)}
                aria-pressed={on}
                className={`min-h-11 shrink-0 rounded-full px-4 text-[12.5px] font-bold transition ${
                  on ? 'bg-white text-ink-700' : 'bg-white/12 text-white/80'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        <p className="mt-1.5 text-center text-[11px] text-white/50">
          Kéo để chọn phần muốn giữ · chụm hai ngón để phóng to
        </p>
      </div>
    </div>
  );
}
