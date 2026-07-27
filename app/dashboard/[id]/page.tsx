'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type DashboardResponse = {
  dashboard: {
    id: string;
    name: string;
    description: string | null;
  };
  permission: 'read' | 'write';
  data: unknown;
};

function GenericDataView({ data }: { data: unknown }) {
  const table = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0 || !data.every(Array.isArray)) return null;
    return data as unknown[][];
  }, [data]);

  if (!table) {
    return <pre className="json-panel">{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table generic-data-table">
        <tbody>
          {table.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{String(cell ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const dashboardId = routeParams.id;
  const [payload, setPayload] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState('F2:F100');
  const [valuesText, setValuesText] = useState('[]');
  const [updateMessage, setUpdateMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadDashboard() {
    setError('');
    try {
      const result = await apiFetch<DashboardResponse>(`/api/dashboard?dashboardId=${encodeURIComponent(dashboardId)}`);
      setPayload(result);
    } catch (loadError) {
      if (loadError instanceof ApiClientError && loadError.status === 401) {
        await getSupabaseBrowser().auth.signOut();
        router.replace('/');
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'No fue posible abrir el dashboard.');
    }
  }

  useEffect(() => {
    void loadDashboard();
    // dashboardId is the only route identity used by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpdateMessage('');
    setError('');

    let values: unknown[];
    try {
      const parsed = JSON.parse(valuesText) as unknown;
      if (!Array.isArray(parsed)) throw new Error();
      values = parsed;
    } catch {
      setError('Values debe ser un arreglo JSON válido.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/dashboard/update', {
        method: 'POST',
        body: JSON.stringify({ dashboardId: dashboardId, range, values }),
      });
      setUpdateMessage('Actualización enviada correctamente.');
      await loadDashboard();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'No fue posible actualizar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/portal" className="brand-inline">
          <span className="brand-mark brand-mark-small">DP</span>
          <span>Dashboard Portal</span>
        </Link>
        <Link href="/portal" className="button button-ghost">← Volver al portal</Link>
      </header>

      <section className="page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>{payload?.dashboard.name || dashboardId}</h1>
            <p>{payload?.dashboard.description || 'Datos empresariales protegidos.'}</p>
          </div>
          {payload ? (
            <span className={`permission-badge permission-${payload.permission}`}>
              {payload.permission === 'write' ? 'Lectura y edición' : 'Solo lectura'}
            </span>
          ) : null}
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {!payload && !error ? <div className="loading-panel">Solicitando datos autorizados…</div> : null}

        {payload ? (
          <div className="content-stack">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Fuente de datos</p>
                  <h2>Vista genérica</h2>
                </div>
              </div>
              <GenericDataView data={payload.data} />
            </section>

            {payload.permission === 'write' ? (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Edición controlada</p>
                    <h2>Actualizar rango autorizado</h2>
                    <p>Apps Script validará que el rango esté incluido en la configuración permitida.</p>
                  </div>
                </div>
                <form className="form-grid" onSubmit={submitUpdate}>
                  <label className="field">
                    <span>Rango</span>
                    <input value={range} onChange={(event) => setRange(event.target.value)} required />
                  </label>
                  <label className="field field-span-2">
                    <span>Values (JSON)</span>
                    <textarea rows={8} value={valuesText} onChange={(event) => setValuesText(event.target.value)} required />
                  </label>
                  <div className="form-actions field-span-2">
                    <button type="submit" className="button button-primary" disabled={saving}>
                      {saving ? 'Actualizando…' : 'Actualizar información'}
                    </button>
                    {updateMessage ? <span className="success-text">{updateMessage}</span> : null}
                  </div>
                </form>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
