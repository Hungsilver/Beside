import { useEffect, useState } from 'react';
import { formatLatLng, googleMapsDirectionsUrl, type LatLng } from '@beside/shared';

/**
 * Khối "toạ độ + sao chép + chỉ đường", dùng chung cho mọi chỗ có một điểm
 * trên bản đồ: khoảnh khắc đã ghim và vị trí của người ấy.
 *
 * Gom về một chỗ vì đây là phần dễ lệch nhất nếu chép đôi: định dạng toạ độ
 * (dấu CHẤM thập phân, nếu không Google Maps hiểu sai), cách dựng link
 * (`maps/dir/?api=1`, không dùng scheme riêng — xem ARCHITECTURE.md §7.3), và
 * cách xử lý khi trình duyệt không cho sao chép.
 *
 * Hiện toạ độ đầy đủ ở đây là đúng luật: R3 cấm ghi toạ độ chính xác vào *log*,
 * còn đây là dữ liệu của chính couple đang xem, hiện trên máy họ.
 */
export default function CoordinateCard({
  point,
  title,
  note,
}: {
  point: LatLng | null;
  /** Dòng đậm phía trên toạ độ — tên địa điểm, hoặc "Vị trí lúc 14:05". */
  title?: string | null;
  /** Câu lưu ý thêm, ví dụ khi đối phương đang bật làm mờ vị trí. */
  note?: string | null;
}) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  // Trả câu "Đã sao chép" về trạng thái thường sau vài giây.
  useEffect(() => {
    if (copied === 'idle') return;
    const id = window.setTimeout(() => setCopied('idle'), 2200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const coords = point ? formatLatLng(point) : '';
  const mapsUrl = point ? googleMapsDirectionsUrl(point) : null;

  async function copyCoords() {
    if (!coords) return;
    try {
      // `navigator.clipboard` chỉ tồn tại trên ngữ cảnh bảo mật (https hoặc
      // localhost). Mở app qua http trong mạng LAN là không có nó — báo cho
      // người dùng biết thay vì để nút bấm vào không phản ứng gì.
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(coords);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }

  return (
    <>
      <div className="rounded-2xl bg-plum-100/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="text-[16px]" aria-hidden>
            📍
          </span>
          <div className="min-w-0 flex-1">
            {title && <b className="block truncate text-[13.5px]">{title}</b>}
            <p className="mt-0.5 select-all break-all font-mono text-[12.5px] text-ink-700">
              {coords || 'Không có toạ độ'}
            </p>
            {note && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{note}</p>}
          </div>
        </div>

        {coords && (
          <button
            type="button"
            onClick={() => void copyCoords()}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-white text-[12.5px] font-bold text-ink-700"
          >
            {copied === 'ok'
              ? '✓ Đã sao chép toạ độ'
              : copied === 'fail'
                ? 'Không sao chép được — chạm giữ để chọn'
                : '⧉ Sao chép toạ độ'}
          </button>
        )}
      </div>

      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-3 flex min-h-12 w-full items-center justify-center"
        >
          🧭 Chỉ đường bằng Google Maps
        </a>
      )}
    </>
  );
}
