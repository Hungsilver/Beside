import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useCouple } from '@/lib/couple-api';
import { RealtimeProvider } from '@/lib/realtime';
import { sendPassivePing } from '@/lib/use-live-location';
import { Spinner } from '@/components/ui';
import LoginScreen from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import PairScreen from '@/screens/PairScreen';
import HomeScreen from '@/screens/HomeScreen';
import SettingsScreen from '@/screens/SettingsScreen';

// MapLibre nặng gần 1MB — chỉ tải khi người dùng thật sự mở bản đồ,
// để lần mở app đầu tiên trên mạng di động không phải chờ.
const MapScreen = lazy(() => import('@/screens/MapScreen'));
const CheckinScreen = lazy(() => import('@/screens/CheckinScreen'));
const FeedScreen = lazy(() => import('@/screens/FeedScreen'));
const CalendarScreen = lazy(() => import('@/screens/CalendarScreen'));

export default function App() {
  const { user, isRestoring } = useAuth();

  // Chưa biết đã đăng nhập hay chưa → KHÔNG được render màn đăng nhập,
  // nếu không người dùng sẽ thấy màn login nhấp nháy mỗi lần mở app.
  if (isRestoring) return <Spinner label="Đang mở Beside..." />;

  if (!user) {
    return (
      <Routes>
        <Route path="/dang-nhap" element={<LoginScreen />} />
        <Route path="/dang-ky" element={<RegisterScreen />} />
        <Route path="*" element={<Navigate to="/dang-nhap" replace />} />
      </Routes>
    );
  }

  return (
    <RealtimeProvider>
      <PassivePing />
      <Routes>
        <Route path="/ghep-doi" element={<PairScreen />} />
        {/* Cài đặt mở được ngay cả khi chưa ghép đôi — để sửa hồ sơ trước cũng được */}
        <Route path="/cai-dat" element={<SettingsScreen />} />
        <Route
          path="/ban-do"
          element={
            <RequireCouple>
              <Suspense fallback={<Spinner label="Đang mở bản đồ..." />}>
                <MapScreen />
              </Suspense>
            </RequireCouple>
          }
        />
        <Route
          path="/check-in"
          element={
            <RequireCouple>
              <Suspense fallback={<Spinner />}>
                <CheckinScreen />
              </Suspense>
            </RequireCouple>
          }
        />
        <Route
          path="/ky-niem"
          element={
            <RequireCouple>
              <Suspense fallback={<Spinner label="Đang mở kỷ niệm..." />}>
                <FeedScreen />
              </Suspense>
            </RequireCouple>
          }
        />
        <Route
          path="/lich"
          element={
            <RequireCouple>
              <Suspense fallback={<Spinner label="Đang mở lịch..." />}>
                <CalendarScreen />
              </Suspense>
            </RequireCouple>
          }
        />
        <Route path="/" element={<RequireCouple>{<HomeScreen />}</RequireCouple>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RealtimeProvider>
  );
}

/** Đã đăng nhập nhưng chưa ghép đôi thì phải ghép đôi trước. */
function RequireCouple({ children }: { children: React.ReactNode }) {
  const coupleQuery = useCouple();

  if (coupleQuery.isLoading) return <Spinner />;

  const couple = coupleQuery.data;
  const paired = Boolean(couple && couple.members.length >= 2);

  if (!paired) return <Navigate to="/ghep-doi" replace />;
  return <>{children}</>;
}

/**
 * Lớp L2 (ARCHITECTURE.md §2): gửi một điểm vị trí mỗi khi app được mở hoặc
 * quay lại tiền cảnh. Nhờ đó đối phương luôn thấy "lần cuối ở đâu" kể cả khi
 * không ai bật chia sẻ trực tiếp.
 */
function PassivePing() {
  const { user } = useAuth();
  const coupleId = user?.coupleId ?? null;

  useEffect(() => {
    if (!coupleId) return;

    sendPassivePing();

    const onVisible = () => {
      if (document.visibilityState === 'visible') sendPassivePing();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [coupleId]);

  return null;
}
