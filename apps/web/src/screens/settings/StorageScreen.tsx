import { useState } from 'react';
import { clearAppCaches, useAppUpdate } from '@/lib/app-update';
import { GroupNote, SubScreen } from './SettingsKit';

/**
 * Bộ nhớ & cập nhật.
 *
 * Màn này tồn tại vì một triệu chứng rất thật: deploy xong mà máy vẫn hiện
 * giao diện cũ. Nguyên nhân gốc đã sửa ở `lib/app-update.ts` (service worker
 * mới không còn nằm chờ vô hạn), nhưng vẫn cần một lối thoát bằng tay — và
 * cần một chỗ nói thẳng "máy bạn đang chạy bản nào".
 */
export default function StorageScreen() {
  const { needRefresh, update, check } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<'idle' | 'latest'>('idle');
  const [clearing, setClearing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function doCheck() {
    setChecking(true);
    setChecked('idle');
    try {
      const found = await check();
      if (!found) setChecked('latest');
    } finally {
      setChecking(false);
    }
  }

  async function doClear() {
    setClearing(true);
    try {
      await clearAppCaches();
    } finally {
      // Tải lại bằng đường dẫn gốc: nếu đang đứng ở một màn con thì sau khi gỡ
      // service worker, mở lại đúng màn đó có thể rơi vào lúc chưa có gì trong
      // cache. Về trang chủ là chắc chắn nhất.
      window.location.replace('/');
    }
  }

  return (
    <SubScreen title="Bộ nhớ & cập nhật" subtitle="Khi giao diện không chịu đổi sau cập nhật">
      <section className="card">
        <h2 className="text-[14px] font-bold">Phiên bản đang chạy</h2>
        <p className="mt-1.5 font-mono text-[12.5px] text-ink-700">
          Beside v0.1.0 · bản dựng {__BUILD_ID__}
        </p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
          Mã bản dựng đổi sau mỗi lần đưa lên máy chủ. Hai máy cùng mã là đang
          chạy đúng một bản.
        </p>

        {needRefresh ? (
          <button type="button" onClick={update} className="btn-primary mt-3.5 w-full">
            ✨ Có bản mới — tải lại ngay
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void doCheck()}
            disabled={checking}
            className="btn-ghost mt-3.5 w-full"
          >
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra bản mới'}
          </button>
        )}

        {checked === 'latest' && !needRefresh && (
          <p className="mt-2 text-center text-[12px] font-semibold text-[#127A5E]">
            ✓ Đang dùng bản mới nhất
          </p>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="text-[14px] font-bold">Xoá bộ nhớ đệm</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
          Xoá toàn bộ phần app giữ sẵn trong máy: giao diện, dữ liệu xem ngoại
          tuyến, ảnh bản đồ đã tải. App sẽ tải lại từ máy chủ như lần đầu.
        </p>

        <ul className="mt-3 flex flex-col gap-1.5 text-[12px] leading-relaxed text-ink-500">
          <li>✓ Bạn <b>không</b> bị đăng xuất</li>
          <li>✓ Không mất dữ liệu nào trên máy chủ — kỷ niệm, lịch, vị trí vẫn nguyên</li>
          <li>· Lần mở đầu tiên sau đó sẽ tốn chút dung lượng mạng để tải lại</li>
        </ul>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-ghost mt-3.5 w-full"
          >
            🧹 Xoá bộ nhớ đệm & tải lại
          </button>
        ) : (
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="btn-ghost flex-1"
            >
              Thôi
            </button>
            <button
              type="button"
              onClick={() => void doClear()}
              disabled={clearing}
              className="btn-primary flex-1"
            >
              {clearing ? 'Đang xoá...' : 'Xoá & tải lại'}
            </button>
          </div>
        )}
      </section>

      <GroupNote>
        Nếu sau khi xoá mà vẫn thấy giao diện cũ: đóng hẳn app (vuốt khỏi danh
        sách ứng dụng đang chạy) rồi mở lại — iOS giữ tiến trình cũ khá lâu.
      </GroupNote>
    </SubScreen>
  );
}
