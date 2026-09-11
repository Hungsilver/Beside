import { useAppUpdate } from '@/lib/app-update';

/**
 * Dải mời tải lại khi đã có bản mới.
 *
 * Cố ý KHÔNG tự tải lại: người dùng có thể đang gõ dở một lời nhắn hay đang
 * giữa ván bài, cướp trang của họ để cập nhật là tệ hơn hẳn việc chờ thêm vài
 * phút. Nhưng cũng không im lặng — im lặng chính là lỗi cũ: bản mới cài xong
 * rồi nằm chờ mãi và người dùng không biết vì sao giao diện không đổi.
 *
 * Neo ở ĐỈNH màn hình để không đụng thanh tab và các nút nổi ở đáy.
 */
export default function UpdateBanner() {
  const { needRefresh, update } = useAppUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-[430px] px-4 pt-[max(env(safe-area-inset-top),10px)]"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink-900/95 px-4 py-3 text-white shadow-[0_8px_28px_rgba(35,19,32,0.35)] backdrop-blur">
        <span className="text-[18px]" aria-hidden>
          ✨
        </span>
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-relaxed">
          Đã có bản Beside mới
        </p>
        <button
          type="button"
          onClick={update}
          className="min-h-11 shrink-0 rounded-full bg-white px-4 text-[13px] font-bold text-ink-900"
        >
          Tải lại
        </button>
      </div>
    </div>
  );
}
