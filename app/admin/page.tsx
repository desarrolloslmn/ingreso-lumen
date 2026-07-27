'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  created_at: string;
};

type DashboardRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

type AccessRow = {
  user_id: string;
  dashboard_id: string;
  permission: 'read' | 'write';
};

type AdminData = {
  users: UserRow[];
  dashboards: DashboardRow[];
  access: AccessRow[];
};

type AuditEvent = {
  id: number;
  actor_email: string;
  action: string;
  dashboard_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type PermissionChoice = 'none' | 'read' | 'write';

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<Record<string, PermissionChoice>>({});

  async function handleAuthError(loadError: unknown) {
    if (loadError instanceof ApiClientError && (loadError.status === 401 || loadError.status === 403)) {
      if (loadError.status === 401) await getSupabaseBrowser().auth.signOut();
      router.replace(loadError.status === 403 ? '/portal' : '/');
      return true;
    }
    return false;
  }

  async function loadAll() {
    setError('');
    try {
      const [adminData, auditData] = await Promise.all([
        apiFetch<AdminData>('/api/admin/users'),
        apiFetch<{ events: AuditEvent[] }>('/api/admin/audit?limit=150'),
      ]);
      setData(adminData);
      setAudit(auditData.events);
      setInvitePermissions((current) => {
        const next = { ...current };
        for (const dashboard of adminData.dashboards) {
          if (!next[dashboard.id]) next[dashboard.id] = 'none';
        }
        return next;
      });
    } catch (loadError) {
      if (await handleAuthError(loadError)) return;
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar administración.');
    }
  }

  useEffect(() => {
    void loadAll();
    // The page loads once and refreshes explicitly after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accessMap = useMemo(() => {
    const map = new Map<string, PermissionChoice>();
    for (const entry of data?.access ?? []) {
      map.set(`${entry.user_id}:${entry.dashboard_id}`, entry.permission);
    }
    return map;
  }, [data]);

  async function toggleUser(user: UserRow) {
    setBusy(`user:${user.id}`);
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: user.id, active: !user.active }),
      });
      setNotice(`Usuario ${!user.active ? 'activado' : 'desactivado'} correctamente.`);
      await loadAll();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No fue posible actualizar el usuario.');
    } finally {
      setBusy(null);
    }
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('invite');
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/admin/invite', {
        method: 'POST',
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          permissions: invitePermissions,
        }),
      });
      setInviteName('');
      setInviteEmail('');
      setInvitePermissions((current) => {
        const next: Record<string, PermissionChoice> = {};
        for (const key of Object.keys(current)) next[key] = 'none';
        return next;
      });
      setNotice('Invitación enviada correctamente.');
      await loadAll();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'No fue posible invitar al usuario.');
    } finally {
      setBusy(null);
    }
  }

  async function changePermission(userId: string, dashboardId: string, permission: PermissionChoice) {
    const busyKey = `permission:${userId}:${dashboardId}`;
    setBusy(busyKey);
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/admin/permissions', {
        method: 'PATCH',
        body: JSON.stringify({
          userId,
          dashboardId,
          permission: permission === 'none' ? null : permission,
        }),
      });
      setNotice('Permiso actualizado.');
      await loadAll();
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : 'No fue posible cambiar el permiso.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/portal" className="brand-inline">
          <span className="brand-mark brand-mark-small">DP</span>
          <span>Administración</span>
        </Link>
        <Link href="/portal" className="button button-ghost">← Volver al portal</Link>
      </header>

      <section className="page-container admin-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Control central</p>
            <h1>Administración</h1>
            <p>Usuarios, permisos y bitácora de auditoría en un solo lugar.</p>
          </div>
          <span className="status-pill status-admin">Administrador</span>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? <div className="alert alert-success">{notice}</div> : null}
        {!data && !error ? <div className="loading-panel">Cargando consola administrativa…</div> : null}

        {data ? (
          <div className="content-stack">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Usuarios</p>
                  <h2>Estado de cuentas</h2>
                </div>
                <span className="count-badge">{data.users.length}</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Creado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.id}>
                        <td><strong>{user.name}</strong></td>
                        <td>{user.email}</td>
                        <td>{user.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
                        <td>
                          <span className={`status-pill ${user.active ? 'status-active' : 'status-disabled'}`}>
                            {user.active ? 'Activo' : 'Desactivado'}
                          </span>
                        </td>
                        <td>{new Date(user.created_at).toLocaleString('es-MX')}</td>
                        <td>
                          <button
                            type="button"
                            className={`button button-small ${user.active ? 'button-danger-soft' : 'button-secondary'}`}
                            onClick={() => toggleUser(user)}
                            disabled={busy === `user:${user.id}`}
                          >
                            {busy === `user:${user.id}` ? 'Guardando…' : user.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Crear / invitar</p>
                  <h2>Nuevo usuario</h2>
                  <p>La invitación se envía desde el servidor mediante Supabase Auth Admin.</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={inviteUser}>
                <label className="field">
                  <span>Nombre</span>
                  <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} required />
                </label>
                <label className="field">
                  <span>Correo</span>
                  <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
                </label>

                <div className="field field-span-2">
                  <span>Permisos para dashboards</span>
                  <div className="permission-grid">
                    {data.dashboards.filter((dashboard) => dashboard.active).map((dashboard) => (
                      <label className="permission-row" key={dashboard.id}>
                        <span>
                          <strong>{dashboard.name}</strong>
                          <small>{dashboard.description || dashboard.id}</small>
                        </span>
                        <select
                          value={invitePermissions[dashboard.id] ?? 'none'}
                          onChange={(event) => setInvitePermissions((current) => ({
                            ...current,
                            [dashboard.id]: event.target.value as PermissionChoice,
                          }))}
                        >
                          <option value="none">Sin acceso</option>
                          <option value="read">Solo lectura</option>
                          <option value="write">Lectura y edición</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-actions field-span-2">
                  <button type="submit" className="button button-primary" disabled={busy === 'invite'}>
                    {busy === 'invite' ? 'Enviando…' : 'Enviar invitación'}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Permisos</p>
                  <h2>Acceso por dashboard</h2>
                  <p>Los administradores tienen acceso total independientemente de esta matriz.</p>
                </div>
              </div>
              <div className="permission-matrix">
                {data.users.filter((user) => user.role !== 'admin').map((user) => (
                  <div className="permission-user" key={user.id}>
                    <div className="permission-user-header">
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                      <span className={`status-pill ${user.active ? 'status-active' : 'status-disabled'}`}>
                        {user.active ? 'Activo' : 'Desactivado'}
                      </span>
                    </div>
                    <div className="permission-grid">
                      {data.dashboards.filter((dashboard) => dashboard.active).map((dashboard) => {
                        const key = `${user.id}:${dashboard.id}`;
                        const currentPermission = accessMap.get(key) ?? 'none';
                        return (
                          <label className="permission-row" key={dashboard.id}>
                            <span><strong>{dashboard.name}</strong></span>
                            <select
                              value={currentPermission}
                              disabled={busy === `permission:${user.id}:${dashboard.id}`}
                              onChange={(event) => changePermission(user.id, dashboard.id, event.target.value as PermissionChoice)}
                            >
                              <option value="none">Sin acceso</option>
                              <option value="read">Solo lectura</option>
                              <option value="write">Lectura y edición</option>
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Auditoría</p>
                  <h2>Últimos eventos</h2>
                  <p>Ordenados de más reciente a más antiguo.</p>
                </div>
                <span className="count-badge">{audit.length}</span>
              </div>
              <div className="table-wrap">
                <table className="data-table audit-table">
                  <thead>
                    <tr>
                      <th>Fecha / hora</th>
                      <th>Correo</th>
                      <th>Acción</th>
                      <th>Dashboard</th>
                      <th>Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((event) => (
                      <tr key={event.id}>
                        <td>{new Date(event.created_at).toLocaleString('es-MX')}</td>
                        <td>{event.actor_email}</td>
                        <td><code className="action-code">{event.action}</code></td>
                        <td>{event.dashboard_id || '—'}</td>
                        <td><pre className="details-json">{JSON.stringify(event.details ?? {}, null, 2)}</pre></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
