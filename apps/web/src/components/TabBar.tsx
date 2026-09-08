import { NavLink, useNavigate } from 'react-router-dom';
import { BottomLayer } from '@/components/ui';

/**
 * Thanh tab 5 khe đã chốt ở Phase 0:
 *   Nhà · Bản đồ · [＋ Check-in] · Lịch · Kỷ niệm
 * "Ngày yêu / Địa điểm / Cài đặt" là màn con, vào từ Trang chủ.
 *
 * Các mục chưa có màn hình (Phase 3–4) vẫn hiện nhưng làm mờ, để người dùng
 * thấy được app sẽ có gì — bấm vào thì không đi đâu cả.
 */
const TABS = [
  { to: '/', icon: '🏠', label: 'Nhà', ready: true },
  { to: '/ban-do', icon: '🗺️', label: 'Bản đồ', ready: true },
  { to: '/check-in', icon: '＋', label: '', ready: true, fab: true },
  { to: '/lich', icon: '🗓️', label: 'Lịch', ready: true },
  { to: '/ky-niem', icon: '💖', label: 'Kỷ niệm', ready: true },
] as const;

export default function TabBar() {
  const navigate = useNavigate();

  return (
    <BottomLayer>
      <nav
        className="pointer-events-auto grid grid-cols-5 items-start gap-0.5 border-t border-black/[0.06] bg-white/85 px-3.5 pb-[max(env(safe-area-inset-bottom),20px)] pt-2 backdrop-blur-xl"
        aria-label="Điều hướng chính"
      >
        {TABS.map((t) =>
          'fab' in t && t.fab ? (
            <NavLink
              key={t.to}
              to={t.to}
              aria-label="Tạo khoảnh khắc mới"
              className="flex items-center justify-center pt-1.5"
            >
              <span className="love-gradient -mt-4 flex size-[54px] items-center justify-center rounded-full border-[3px] border-white text-[24px] text-white shadow-[0_10px_30px_rgba(234,47,101,0.35)]">
                {t.icon}
              </span>
            </NavLink>
          ) : t.ready ? (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-[3px] pt-1.5 text-[10.5px] font-semibold transition ${
                  isActive ? 'text-love-600' : 'text-ink-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-[21px] leading-none ${isActive ? '' : 'grayscale opacity-55'}`}>
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </>
              )}
            </NavLink>
          ) : (
            <button
              key={t.to}
              type="button"
              onClick={() => navigate('/')}
              disabled
              className="flex cursor-not-allowed flex-col items-center gap-[3px] pt-1.5 text-[10.5px] font-semibold text-ink-300"
              title="Sắp có"
            >
              <span className="text-[21px] leading-none opacity-40 grayscale">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ),
        )}
      </nav>
    </BottomLayer>
  );
}
