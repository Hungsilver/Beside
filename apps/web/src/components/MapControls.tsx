import { useState } from 'react';
import { MAP_STYLES, type MapStyleId } from '@/lib/map-styles';

/**
 * Cụm nút nổi bên phải bản đồ.
 *
 * Mặc định chỉ hiện một nút loại bản đồ; bấm mới xoè ra danh sách. Trên khung
 * 390px, bốn nút xếp sẵn sẽ chiếm mất một dải bản đồ mà người dùng hầu như
 * không đổi loại bản đồ thường xuyên.
 */
export default function MapControls({
  styleId,
  onStyleChange,
  photoPinsOn,
  onTogglePhotoPins,
  photoPinCount,
  onFitBoth,
  canFitBoth,
}: {
  styleId: MapStyleId;
  onStyleChange: (id: MapStyleId) => void;
  photoPinsOn: boolean;
  onTogglePhotoPins: () => void;
  photoPinCount: number;
  onFitBoth: () => void;
  canFitBoth: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = MAP_STYLES.find((s) => s.id === styleId) ?? MAP_STYLES[0]!;

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2.5">
      {open && (
        <div className="flex flex-col gap-1 rounded-2xl bg-white/95 p-1.5 shadow-[0_4px_16px_rgba(35,19,32,0.18)] backdrop-blur">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onStyleChange(s.id);
                setOpen(false);
              }}
              aria-pressed={s.id === styleId}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition ${
                s.id === styleId ? 'bg-love-100 text-love-700' : 'text-ink-600'
              }`}
            >
              <span className="text-[16px]">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <FloatButton
        label={`Loại bản đồ: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
        active={open}
      >
        {current.emoji}
      </FloatButton>

      {/*
        Ẩn ghim ảnh: khi hai người check-in nhiều, bản đồ đặc kín ảnh và không
        còn nhìn ra ai đang ở đâu. Chỉ hiện nút khi thật sự có ảnh để ẩn.
      */}
      {photoPinCount > 0 && (
        <FloatButton
          label={photoPinsOn ? 'Ẩn ảnh check-in trên bản đồ' : 'Hiện ảnh check-in trên bản đồ'}
          onClick={onTogglePhotoPins}
          active={photoPinsOn}
        >
          {photoPinsOn ? '📷' : '🚫'}
        </FloatButton>
      )}

      {canFitBoth && (
        <FloatButton label="Đưa cả hai vào khung nhìn" onClick={onFitBoth}>
          👥
        </FloatButton>
      )}
    </div>
  );
}

function FloatButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-11 items-center justify-center rounded-full text-[18px] shadow-[0_2px_10px_rgba(35,19,32,0.18)] transition ${
        active ? 'bg-love-100 ring-[1.5px] ring-love-300' : 'bg-white/95 backdrop-blur'
      }`}
    >
      {children}
    </button>
  );
}
