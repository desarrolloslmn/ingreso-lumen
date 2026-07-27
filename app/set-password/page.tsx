'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Validando invitación…');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareSession() {
      try {
        const supabase = getSupabaseBrowser();
        const code = new URLSearchParams(window.location.search).get('code');
        let { data } = await supabase.auth.getSession();

        if (!data.session && code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
          data = { session: exchanged.data.session };
        }

        if (!data.session) {
          throw new Error('La invitación no contiene una sesión válida o ya expiró.');
        }

        if (!cancelled) {
          setReady(true);
          setMessage('Define una contraseña de al menos 10 caracteres.');
        }
      } catch (sessionError) {
        if (!cancelled) {
          setError(sessionError instanceof Error ? sessionError.message : 'No fue posible validar la invitación.');
          setMessage('Solicita una nueva invitación a un administrador.');
        }
      }
    }

    void prepareSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 10) {
      setError('La contraseña debe tener mínimo 10 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/portal');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar la contraseña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="password-title">
        <div className="brand-mark" aria-hidden="true">DP</div>
        <div className="auth-heading">
          <p className="eyebrow">Activación de cuenta</p>
          <h1 id="password-title">Establecer contraseña</h1>
          <p>{message}</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!ready || saving}
              required
            />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={!ready || saving}
              required
            />
          </label>

          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

          <button className="button button-primary button-full" type="submit" disabled={!ready || saving}>
            {saving ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </section>
    </main>
  );
}
