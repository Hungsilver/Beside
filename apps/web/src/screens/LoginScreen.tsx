import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema } from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api-client';
import { BrandMark, Field, FormError, Screen } from '@/components/ui';

export default function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // chặn bấm hai lần

    setFormError(null);
    setFieldErrors({});

    // Kiểm tra ngay ở client bằng CHÍNH schema server dùng — cùng một luật.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_');
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      void navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormError(err.message);
        if (err.fieldErrors) {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.fieldErrors)) {
            if (v[0]) errs[k] = v[0];
          }
          setFieldErrors(errs);
        }
      } else {
        setFormError('Có lỗi không xác định. Thử lại nhé.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-4 text-[28px] font-extrabold tracking-tight">Beside</h1>
          <p className="mt-1.5 text-[14px] text-ink-500">
            Ở cạnh nhau, dù đang ở đâu.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormError message={formError} />

          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ten@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />

          <Field
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />

          <button type="submit" className="btn-primary mt-2" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-ink-500">
          Chưa có tài khoản?{' '}
          <Link to="/dang-ky" className="font-bold text-love-600">
            Đăng ký
          </Link>
        </p>
      </div>
    </Screen>
  );
}
