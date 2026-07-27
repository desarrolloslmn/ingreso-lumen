'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type MeResponse = {
  profile: {
    active: boolean;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        throw new Error('Correo o contraseña incorrectos.');
      }

      try {
        const me = await apiFetch<MeResponse>('/api/me');
        if (!me.profile.active) throw new Error('La cuenta está desactivada.');
      } catch (validationError) {
        await supabase.auth.signOut();
        throw validationError;
      }

      await apiFetch('/api/activity/login', { method: 'POST' });
      router.replace('/portal');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">DP</div>
        <div className="auth-heading">
          <p className="eyebrow">Portal interno</p>
          <h1 id="login-title">Acceso a dashboards</h1>
          <p>Ingresa con tus credenciales corporativas autorizadas.</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@empresa.com"
              required
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

          <button type="submit" className="button button-primary button-full" disabled={loading}>
            {loading ? 'Validando…' : 'Ingresar'}
          </button>
        </form>

        <p className="auth-footnote">Acceso restringido a personal autorizado.</p>
      </section>
    </main>
  );
}
