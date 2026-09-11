import { Link } from 'react-router-dom';
import {
  buildMessagingUrl,
  LIVE_STALE_AFTER_MS,
  MESSAGING_APP_LABELS,
  type MessagingApp,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { useCouple, useLoveSummary } from '@/lib/couple-api';
import { usePartnerLatest } from '@/lib/location-api';
import { useRealtime } from '@/lib/realtime';
import { Screen, Spinner } from '@/components/ui';
import TabBar from '@/components/TabBar';
import Avatar from '@/components/Avatar';

/**
 * Trang chủ — Phase 1 mới dựng phần đếm ngày yêu và thẻ người ấy.
 * Bản đồ, check-in, lịch trình sẽ gắn vào ở Phase 2–4 (xem ARCHITECTURE.md §9).
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const coupleQuery = useCouple();
  const loveQuery = useLoveSummary();
  const partnerQuery = usePartnerLatest();
  const { partnerPresence } = useRealtime();

  if (coupleQuery.isLoading || loveQuery.isLoading) {
    return <Spinner />;
  }

  const couple = coupleQuery.data;
  const love = loveQuery.data;
  const partner = couple?.partner ?? null;

  const partnerPoint = partnerQuery.data?.location ?? null;
  const distanceM = partnerQuery.data?.distanceM ?? null;
  const partnerIsLive =
    Boolean(partnerPresence?.live) &&
    Boolean(partnerPoint) &&
    Date.now() - (partnerPoint?.ts ?? 0) < LIVE_STALE_AFTER_MS;
  const partnerStatus = partnerPoint
    ? `Cập nhật ${relativeTime(Date.now() - partnerPoint.ts)}`
    : 'Chưa có vị trí nào';

  const messagingUrl = partner
    ? buildMessagingUrl({
        app: partner.messagingApp as MessagingApp,
        handle: partner.messagingHandle,
      })
    : null;

  return (
    <Screen>
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-[11.5px] text-ink-400">{greeting()}</p>
          <h1 className="text-[24px] font-extrabold tracking-tight">
            Chào {user?.displayName}
          </h1>
        </div>
        <Link
          to="/cai-dat"
          aria-label="Cài đặt"
          className="love-gradient flex size-11 items-center justify-center rounded-full p-[3px]"
        >
          <Avatar
            url={user?.avatarUrl ?? null}
            name={user?.displayName ?? '?'}
            size={38}
            className="border-2 border-white"
            fallbackClassName="bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D] text-white"
          />
        </Link>
      </header>

      {/* Bộ đếm ngày yêu — bấm vào để xem đủ danh sách mốc sắp tới */}
      {love && (
        <Link
          to="/ngay-yeu"
          className="love-gradient relative block overflow-hidden rounded-[var(--radius-hero)] p-5 text-white shadow-[0_18px_48px_rgba(139,92,246,0.16)]"
        >
          <p className="text-[12px] font-bold tracking-[1.2px] opacity-90">
            CHÚNG MÌNH ĐÃ BÊN NHAU
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[54px] font-extrabold leading-none tabular-nums tracking-tight">
              {love.daysTogether.toLocaleString('vi-VN')}
            </span>
            <span className="text-[16px] font-bold opacity-90">ngày</span>
          </div>
          <p className="mt-1.5 text-[12.5px] opacity-90">
            Từ {formatDate(love.anniversaryAt)} · {love.years} năm {love.months} tháng{' '}
            {love.days} ngày
          </p>

          {love.nextMilestone && (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-semibold opacity-90">
                <span>
                  💍 Còn {love.nextMilestone.daysLeft} ngày tới mốc{' '}
                  {love.nextMilestone.title}
                </span>
                <span>{love.nextMilestone.progressPercent}%</span>
              </div>
              <div className="h-[7px] overflow-hidden rounded-full bg-white/30">
                <i
                  className="block h-full rounded-full bg-white"
                  style={{ width: `${love.nextMilestone.progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <span className="mt-4 block text-[12px] font-semibold opacity-90">
            Xem mọi mốc sắp tới →
          </span>
        </Link>
      )}

      {/* Thẻ người ấy */}
      {partner && (
        <section className="card mt-3.5">
          <div className="flex items-center gap-3">
            <Avatar
              url={partner.avatarUrl}
              name={partner.displayName}
              size={48}
              fallbackClassName="bg-gradient-to-br from-[#9BC4FF] to-[#6A7BFF] text-white"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="truncate text-[15.5px]">{partner.displayName}</b>
                {partnerIsLive && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-[#03372A]">
                    <i className="size-1.5 animate-pulse rounded-full bg-[#03A47B]" />
                    Trực tiếp
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-ink-500">{partnerStatus}</p>
            </div>
            {distanceM !== null && (
              <div className="shrink-0 text-right">
                <b className="block text-[15px]">{formatDistance(distanceM)}</b>
                <span className="text-[11.5px] text-ink-400">cách bạn</span>
              </div>
            )}
          </div>

          <Link to="/ban-do" className="btn-primary mt-3 w-full">
            🧭 Xem trên bản đồ
          </Link>

          {messagingUrl ? (
            <a
              href={messagingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost mt-3 w-full"
            >
              💬 Nhắn {MESSAGING_APP_LABELS[partner.messagingApp as MessagingApp]}
            </a>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink-100 px-4 py-3 text-[12.5px] text-ink-500">
              Người ấy chưa cấu hình app nhắn tin, nên chưa có nút nhắn nhanh.
            </p>
          )}
        </section>
      )}

      {/* Dẫn thẳng tới đúng màn cần sửa, không bắt người dùng tự dò trong Cài đặt. */}
      {!user?.messagingHandle && (
        <Link to="/cai-dat/nhan-tin" className="card mt-3.5 block">
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            Còn thiếu một chút
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
            Bạn chưa cài số Zalo/Messenger, nên người ấy chưa có nút nhắn tin nhanh.
            <br />
            <b className="text-love-600">Bấm vào đây để thêm →</b>
          </p>
        </Link>
      )}

      {/*
        Thay đúng chỗ thẻ "Sắp có" từng quảng cáo thông báo đẩy — thứ đã làm xong
        từ Phase 4, nên nó chỉ còn là chữ thừa. Trò chơi vào đây chứ không thêm
        khe thứ sáu vào thanh tab: bố cục 5 khe đã chốt trong ADR.
      */}
      <Link to="/hoc-cung-nhau" className="card mt-3.5 block">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-[22px]">
            📚
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-[15.5px]">Học cùng nhau</b>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
              Đồng hồ Pomodoro chạy chung trên cả hai máy
            </p>
          </div>
          <span className="shrink-0 text-[18px] text-ink-400">›</span>
        </div>
      </Link>

      <Link to="/tro-choi" className="card mt-3.5 block">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-[22px]">
            🎲
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-[15.5px]">Chơi cùng nhau</b>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
              Cờ caro và tiến lên — mỗi lượt 30 giây
            </p>
          </div>
          <span className="shrink-0 text-[18px] text-ink-400">›</span>
        </div>
      </Link>

      <div className="flex-1" />
      <div className="h-[100px]" />
      <TabBar />
    </Screen>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function relativeTime(deltaMs: number): string {
  const s = Math.max(0, Math.round(deltaMs / 1000));
  if (s < 60) return 'vừa xong';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      hour12: false,
    }),
  );
  if (hour < 5) return 'Khuya rồi đó ✨';
  if (hour < 11) return 'Chào buổi sáng ☀️';
  if (hour < 14) return 'Buổi trưa vui vẻ 🍜';
  if (hour < 18) return 'Buổi chiều nhẹ nhàng 🌤️';
  return 'Tối muộn rồi ✨';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
