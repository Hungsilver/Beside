import { Link, useNavigate } from 'react-router-dom';
import {
  MESSAGING_APP_LABELS,
  msToFloatingDate,
  type MessagingApp,
} from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { useCouple, useLoveSummary } from '@/lib/couple-api';
import { usePush } from '@/lib/push-api';
import Avatar from '@/components/Avatar';
import { Spinner } from '@/components/ui';
import {
  GroupNote,
  SettingsAction,
  SettingsGroup,
  SettingsLink,
} from './SettingsKit';

/**
 * Màn Cài đặt — DANH SÁCH, không phải một trang biểu mẫu dài.
 *
 * Mỗi hàng nói luôn giá trị đang dùng ở mép phải, nên liếc một cái là biết app
 * đang bật những gì mà không phải mở từng mục. Việc sửa nằm ở màn con, mỗi màn
 * đúng một việc (xem `SettingsKit`).
 *
 * Mở được cả khi CHƯA ghép đôi — người dùng cần sửa hồ sơ trước khi có couple,
 * nên mọi thứ thuộc về couple chỉ hiện khi đã ghép.
 */
export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const coupleQuery = useCouple();
  const paired = (coupleQuery.data?.members.length ?? 0) >= 2;
  const loveQuery = useLoveSummary(paired);
  const push = usePush();

  if (!user) return <Spinner />;

  const partner = coupleQuery.data?.partner ?? null;

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-10 safe-top safe-bottom">
        <header className="flex items-center gap-3 py-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Quay lại"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[17px]"
          >
            ‹
          </button>
          <h1 className="text-[22px] font-extrabold tracking-tight">Cài đặt</h1>
        </header>

        {/* ── Thẻ hồ sơ ─────────────────────────────────────────────────────
            Đưa danh tính lên đầu thay vì một ô nhập tên: mở Cài đặt ra là thấy
            ngay "mình đang là ai trong app này", đúng như mọi app khác. Cả thẻ
            là một liên kết, vùng chạm rộng hết chiều ngang. */}
        <Link
          to="/cai-dat/ho-so"
          aria-label="Chỉnh sửa hồ sơ cá nhân"
          className="love-gradient relative block overflow-hidden rounded-[var(--radius-hero)] p-5 text-white shadow-[0_10px_30px_rgba(234,47,101,0.28)]"
        >
          {/* Hai vòng sáng mờ cho nền bớt phẳng — thuần trang trí. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/15"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-8 size-36 rounded-full bg-white/10"
          />

          <div className="relative flex items-center gap-3.5">
            <Avatar
              url={user.avatarUrl}
              name={user.displayName}
              size={68}
              className="ring-[3px] ring-white/70"
              fallbackClassName="bg-white/25 text-white"
            />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[19px] font-extrabold">{user.displayName}</b>
              <p className="mt-0.5 truncate text-[12.5px] text-white/85">
                {user.bio?.trim() || user.email || 'Thêm vài dòng về bạn'}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-bold">
                Chỉnh sửa hồ sơ ›
              </span>
            </div>
          </div>

          {paired && partner && (
            <div className="relative mt-4 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3.5 py-2.5">
              <Avatar
                url={partner.avatarUrl}
                name={partner.displayName}
                size={32}
                fallbackClassName="bg-white/25 text-white"
              />
              <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                Bên {partner.displayName}
                {loveQuery.data ? ` · ${loveQuery.data.daysTogether} ngày` : ''}
              </p>
              <span className="text-[16px]" aria-hidden>
                💞
              </span>
            </div>
          )}
        </Link>

        <div className="mt-5">
          <SettingsGroup label="Tài khoản">
            <SettingsLink
              to="/cai-dat/ho-so"
              icon="🙋"
              tone="love"
              title="Hồ sơ cá nhân"
              desc="Ảnh, tên, ngày sinh, địa chỉ"
            />
            <SettingsLink
              to="/cai-dat/nhan-tin"
              icon="💬"
              tone="plum"
              title="Nút nhắn tin"
              desc="Mở thẳng Zalo hoặc Messenger"
              value={messagingValue(user.messagingApp, user.messagingHandle)}
            />
            {paired && coupleQuery.data && (
              <SettingsLink
                to="/cai-dat/ca-doi"
                icon="💞"
                tone="love"
                title="Chuyện của hai đứa"
                desc="Ngày yêu, huỷ ghép đôi"
                value={formatVnDate(coupleQuery.data.anniversaryAt)}
              />
            )}
          </SettingsGroup>

          <SettingsGroup label="Ứng dụng">
            <SettingsLink
              to="/cai-dat/thong-bao"
              icon="🔔"
              tone="mint"
              title="Thông báo"
              desc="Nhắc hẹn, báo khi tới nơi"
              value={pushValue(push.state)}
            />
            <SettingsLink
              to="/cai-dat/rieng-tu"
              icon="🔒"
              tone="plum"
              title="Quyền riêng tư"
              desc="Ẩn danh, làm mờ vị trí"
              value={privacyValue(user.privacy)}
            />
            {paired && (
              <SettingsLink
                to="/dia-diem"
                icon="🗺️"
                tone="ink"
                title="Địa điểm quen"
                desc="Nhà, công ty, quán quen"
              />
            )}
            <SettingsLink
              to="/chu-ky"
              icon="🌙"
              tone="plum"
              title="Chu kỳ của bạn"
              desc="Riêng tư — mặc định người ấy không thấy"
            />
            <SettingsLink
              to="/cai-dat/bo-nho"
              icon="🧹"
              tone="ink"
              title="Bộ nhớ & cập nhật"
              desc="Xoá bộ nhớ đệm khi giao diện không đổi"
              value={`bản ${__BUILD_ID__}`}
            />
          </SettingsGroup>

          <SettingsGroup>
            <SettingsAction
              onClick={() => void logout()}
              icon="↩"
              tone="ink"
              title="Đăng xuất"
              desc="Xoá dữ liệu đã lưu trên máy này"
            />
          </SettingsGroup>
          <GroupNote>
            Đăng xuất không xoá tài khoản. Muốn xoá dữ liệu chung của hai người thì
            vào <b>Chuyện của hai đứa</b>.
          </GroupNote>
        </div>

        <p className="py-7 text-center text-[11.5px] text-ink-400">
          Beside v0.1.0 · {user.email}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function messagingValue(app: string, handle: string | null): string {
  if (!handle) return 'Chưa cài';
  const label = MESSAGING_APP_LABELS[app as MessagingApp] ?? app;
  return `${label} · ${handle}`;
}

function pushValue(state: string): string {
  switch (state) {
    case 'on':
      return 'Đang bật';
    case 'off':
      return 'Đã tắt';
    case 'denied':
      return 'Bị chặn';
    case 'checking':
      return '...';
    default:
      // unsupported · need-install · server-off — người dùng không tự bật được
      return 'Chưa dùng được';
  }
}

function privacyValue(privacy: {
  ghostMode: boolean;
  shareLive: boolean;
  fuzzRadiusM: number;
}): string {
  // Nêu đúng MỘT điều, theo thứ tự ảnh hưởng mạnh dần tới người ấy.
  if (privacy.ghostMode) return 'Đang ẩn danh';
  if (privacy.fuzzRadiusM > 0) return 'Đang làm mờ';
  if (!privacy.shareLive) return 'Tắt trực tiếp';
  return 'Bình thường';
}

/**
 * `2023-02-14` (ngày trôi nổi) → `14/02/2023`.
 *
 * Ngày kỷ niệm là NGÀY TRÔI NỔI (§6.3): đọc theo UTC, không đổi múi giờ — đổi
 * sang giờ VN sẽ nhảy mất một ngày. Chuỗi hỏng thì trả lại nguyên văn thay vì
 * ném lỗi làm trắng cả màn Cài đặt.
 */
function formatVnDate(iso: string): string {
  let ymd = iso;
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    ymd = msToFloatingDate(ms);
  }
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
