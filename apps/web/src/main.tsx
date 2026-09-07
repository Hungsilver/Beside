import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth-context';
import App from '@/App';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu vị trí/lịch trình thay đổi liên tục → coi là cũ ngay,
      // nhưng vẫn hiện bản cache trong lúc tải lại (không nhấp nháy).
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Không thử lại lỗi 4xx — người dùng sai, thử lại cũng vô ích.
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Không tìm thấy #root trong index.html');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
