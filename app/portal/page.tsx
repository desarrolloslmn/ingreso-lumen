'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type PortalData = {
  profile: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    active: boolean;
  };
  dashboards: Array<{
    id: string;
    name: string;
    description: string | null;
    permission: 'read' | 'write';
  }>;
};

export default function PortalPage() {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    apiFetch<PortalData>('/api/me')
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(async (loadError) => {
        if (loadError instanceof ApiClientError && (loadError.status === 401 || loadError.status === 403)) {
          await getSupabaseBrowser().auth.signOut();
          router.replace('/');
          return;
        }
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el portal.');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace('/');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/portal" className="brand-inline" aria-label="Dashboard Portal">
          <span className="brand-mark brand-mark-small">DP</span>
          <span>Dashboard Portal</span>
        </Link>
        <div className="topbar-actions">
          {data?.profile.role === 'admin' ? (
            <Link href="/admin" className="button button-secondary">Administración</Link>
          ) : null}
          <button type="button" className="button button-ghost" onClick={signOut}>Cerrar sesión</button>
        </div>
      </header>

      <section className="page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Panel de acceso</p>
            <h1>{data ? `Hola, ${data.profile.name}` : 'Dashboards'}</h1>
            <p>Solo aparecen los recursos habilitados para tu cuenta.</p>
          </div>
          {data ? <span className="status-pill status-active">Activo</span> : null}
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {!data && !error ? <div className="loading-panel">Cargando accesos…</div> : null}

        {data ? (
          data.dashboards.length > 0 ? (
            <div className="dashboard-grid">
              {data.dashboards.map((dashboard) => (
                <Link className="dashboard-card" href={`/dashboard/${dashboard.id}`} key={dashboard.id}>
                  <div className="dashboard-card-icon">{dashboard.name.slice(0, 1).toUpperCase()}</div>
                  <div className="dashboard-card-body">
                    <h2>{dashboard.name}</h2>
                    <p>{dashboard.description || 'Dashboard empresarial autorizado.'}</p>
                    <span className={`permission-badge permission-${dashboard.permission}`}>
                      {dashboard.permission === 'write' ? 'Lectura y edición' : 'Solo lectura'}
                    </span>
                  </div>
                  <span className="card-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Sin dashboards asignados</h2>
              <p>Tu cuenta está activa, pero aún no tiene accesos asignados.</p>
            </div>
          )
        ) : null}
      </section>
    </main>
  );
}
