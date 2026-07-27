import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';

const SUPABASE_URL = 'https://aadbtmyyfydmxeclqzvm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__n20snD8R6lGUOMIWFvSlg_70BYNBvU';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const app = document.querySelector('#app');
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

let currentProfile = null;

const dashboardSamples = {
  ventas: [
    { indicador: 'Ventas del mes', valor: 'Pendiente de conectar Google Sheets', estado: 'Demo estática' },
    { indicador: 'Ticket promedio', valor: 'Pendiente', estado: 'Demo estática' },
    { indicador: 'Conversión', valor: 'Pendiente', estado: 'Demo estática' },
  ],
  inventarios: [
    { indicador: 'SKU activos', valor: 'Pendiente de conectar Google Sheets', estado: 'Demo estática' },
    { indicador: 'Stock crítico', valor: 'Pendiente', estado: 'Demo estática' },
    { indicador: 'Rotación', valor: 'Pendiente', estado: 'Demo estática' },
  ],
  produccion: [
    { indicador: 'Órdenes abiertas', valor: 'Pendiente de conectar Google Sheets', estado: 'Demo estática' },
    { indicador: 'Cumplimiento', valor: 'Pendiente', estado: 'Demo estática' },
    { indicador: 'Incidencias', valor: 'Pendiente', estado: 'Demo estática' },
  ],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeJson(value) {
  return escapeHtml(JSON.stringify(value ?? {}, null, 2));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function currentRoute() {
  const hash = window.location.hash || '#/';
  const route = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!route || route === '/') return '/';
  return route.startsWith('/') ? route : `/${route}`;
}

function navigate(path) {
  window.location.hash = path;
}

function setLoading(message = 'Cargando…') {
  app.innerHTML = `
    <main class="app-shell">
      ${topbarTemplate()}
      <section class="page-container">
        <div class="loading-panel">${escapeHtml(message)}</div>
      </section>
    </main>
  `;
}

function topbarTemplate(profile = currentProfile) {
  return `
    <header class="topbar">
      <a href="#/portal" class="brand-inline" aria-label="Dashboard Portal">
        <span class="brand-mark brand-mark-small">DP</span>
        <span>Dashboard Portal</span>
      </a>
      <div class="topbar-actions">
        ${profile?.role === 'admin' ? '<a href="#/admin" class="button button-secondary">Administración</a>' : ''}
        <button type="button" class="button button-ghost" id="sign-out-button">Cerrar sesión</button>
      </div>
    </header>
  `;
}

function bindSignOut() {
  const button = document.querySelector('#sign-out-button');
  if (!button) return;
  button.addEventListener('click', async () => {
    await supabase.auth.signOut();
    currentProfile = null;
    navigate('/');
  });
}

async function getSessionUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session?.user ?? null;
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,name,role,active,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(`No fue posible consultar el perfil: ${error.message}`);
  if (!data) throw new Error('Tu usuario todavía no tiene perfil autorizado.');
  return data;
}

async function requireActiveProfile() {
  const user = await getSessionUser();
  if (!user) {
    navigate('/');
    throw new Error('No hay una sesión activa.');
  }

  const profile = await loadProfile(user.id);
  if (!profile.active) {
    await supabase.auth.signOut();
    currentProfile = null;
    navigate('/');
    throw new Error('Tu cuenta está desactivada.');
  }

  currentProfile = profile;
  return profile;
}

async function requireAdminProfile() {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') {
    navigate('/portal');
    throw new Error('No tienes permisos de administrador.');
  }
  return profile;
}

async function logAudit(action, dashboardId = null, details = {}) {
  try {
    if (!currentProfile) return;
    await supabase.from('audit_log').insert({
      actor_id: currentProfile.id,
      actor_email: currentProfile.email,
      action,
      dashboard_id: dashboardId,
      details,
    });
  } catch (error) {
    console.warn('No fue posible registrar auditoría:', error);
  }
}

function authShellTemplate(error = '') {
  return `
    <main class="auth-shell">
      <section class="auth-card" aria-labelledby="login-title">
        <div class="brand-mark" aria-hidden="true">DP</div>
        <div class="auth-heading">
          <p class="eyebrow">Portal interno</p>
          <h1 id="login-title">Acceso a dashboards</h1>
          <p>Ingresa con tus credenciales corporativas autorizadas.</p>
        </div>

        <form id="login-form" class="form-stack">
          <label class="field">
            <span>Correo electrónico</span>
            <input name="email" type="email" autocomplete="email" placeholder="nombre@empresa.com" required />
          </label>
          <label class="field">
            <span>Contraseña</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          ${error ? `<div class="alert alert-error" role="alert">${escapeHtml(error)}</div>` : ''}
          <button type="submit" class="button button-primary button-full">Ingresar</button>
        </form>
        <p class="auth-footnote">Acceso restringido. No hay registro público en este portal.</p>
      </section>
    </main>
  `;
}

async function renderLogin(error = '') {
  const user = await getSessionUser().catch(() => null);
  if (user) {
    try {
      const profile = await loadProfile(user.id);
      if (profile.active) {
        currentProfile = profile;
        navigate('/portal');
        return;
      }
      await supabase.auth.signOut();
    } catch {
      await supabase.auth.signOut();
    }
  }

  app.innerHTML = authShellTemplate(error);
  const form = document.querySelector('#login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Validando…';

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error('Correo o contraseña incorrectos.');

      const profile = await requireActiveProfile();
      await logAudit('LOGIN', null, { source: 'github_pages_static' });
      currentProfile = profile;
      navigate('/portal');
    } catch (submitError) {
      await supabase.auth.signOut();
      currentProfile = null;
      renderLogin(submitError instanceof Error ? submitError.message : 'No fue posible iniciar sesión.');
    }
  });
}

async function loadPortalDashboards(profile) {
  const { data: dashboards, error: dashboardError } = await supabase
    .from('dashboards')
    .select('id,name,description,active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (dashboardError) throw new Error(`No fue posible cargar dashboards: ${dashboardError.message}`);

  if (profile.role === 'admin') {
    return (dashboards ?? []).map((dashboard) => ({ ...dashboard, permission: 'write' }));
  }

  const { data: access, error: accessError } = await supabase
    .from('dashboard_access')
    .select('dashboard_id,permission')
    .eq('user_id', profile.id);

  if (accessError) throw new Error(`No fue posible cargar permisos: ${accessError.message}`);

  const permissionMap = new Map((access ?? []).map((entry) => [entry.dashboard_id, entry.permission]));
  return (dashboards ?? [])
    .filter((dashboard) => permissionMap.has(dashboard.id))
    .map((dashboard) => ({ ...dashboard, permission: permissionMap.get(dashboard.id) }));
}

async function renderPortal() {
  setLoading('Cargando accesos…');
  try {
    const profile = await requireActiveProfile();
    const dashboards = await loadPortalDashboards(profile);

    app.innerHTML = `
      <main class="app-shell">
        ${topbarTemplate(profile)}
        <section class="page-container">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Panel de acceso</p>
              <h1>Hola, ${escapeHtml(profile.name || profile.email)}</h1>
              <p>Solo aparecen los dashboards habilitados para tu cuenta.</p>
            </div>
            <span class="status-pill ${profile.role === 'admin' ? 'status-admin' : 'status-active'}">
              ${profile.role === 'admin' ? 'Administrador' : 'Activo'}
            </span>
          </div>

          ${dashboards.length ? `
            <div class="dashboard-grid">
              ${dashboards.map((dashboard) => `
                <a class="dashboard-card" href="#/dashboard/${escapeHtml(dashboard.id)}">
                  <div class="dashboard-card-icon">${escapeHtml((dashboard.name || dashboard.id).slice(0, 1).toUpperCase())}</div>
                  <div class="dashboard-card-body">
                    <h2>${escapeHtml(dashboard.name)}</h2>
                    <p>${escapeHtml(dashboard.description || 'Dashboard empresarial autorizado.')}</p>
                    <span class="permission-badge permission-${escapeHtml(dashboard.permission)}">
                      ${dashboard.permission === 'write' ? 'Lectura y edición' : 'Solo lectura'}
                    </span>
                  </div>
                  <span class="card-arrow" aria-hidden="true">→</span>
                </a>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <h2>Sin dashboards asignados</h2>
              <p>Tu cuenta está activa, pero aún no tiene accesos asignados.</p>
            </div>
          `}
        </section>
      </main>
    `;
    bindSignOut();
  } catch (error) {
    if (currentRoute() !== '/') renderLogin(error instanceof Error ? error.message : 'No fue posible cargar el portal.');
  }
}

function dataTableTemplate(data) {
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object') {
    return `<pre class="code-block">${safeJson(data)}</pre>`;
  }

  const keys = Array.from(new Set(data.flatMap((row) => Object.keys(row ?? {}))));
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data.map((row) => `
            <tr>${keys.map((key) => `<td>${escapeHtml(row?.[key] ?? '')}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function getDashboardPermission(profile, dashboardId) {
  if (profile.role === 'admin') return 'write';

  const { data, error } = await supabase
    .from('dashboard_access')
    .select('permission')
    .eq('user_id', profile.id)
    .eq('dashboard_id', dashboardId)
    .maybeSingle();

  if (error) throw new Error(`No fue posible validar permisos: ${error.message}`);
  return data?.permission ?? null;
}

async function renderDashboard(dashboardId) {
  setLoading('Solicitando datos autorizados…');
  try {
    const profile = await requireActiveProfile();
    const { data: dashboard, error: dashboardError } = await supabase
      .from('dashboards')
      .select('id,name,description,active')
      .eq('id', dashboardId)
      .maybeSingle();

    if (dashboardError) throw new Error(`No fue posible cargar el dashboard: ${dashboardError.message}`);
    if (!dashboard || !dashboard.active) throw new Error('El dashboard no existe o está desactivado.');

    const permission = await getDashboardPermission(profile, dashboardId);
    if (!permission) {
      await logAudit('DASHBOARD_ACCESS_DENIED', dashboardId, { reason: 'missing_permission' });
      app.innerHTML = `
        <main class="app-shell">
          ${topbarTemplate(profile)}
          <section class="page-container">
            <div class="empty-state">
              <h2>Acceso denegado</h2>
              <p>No tienes permisos para abrir este dashboard.</p>
              <p><a href="#/portal" class="button button-secondary">Volver al portal</a></p>
            </div>
          </section>
        </main>
      `;
      bindSignOut();
      return;
    }

    await logAudit('DASHBOARD_VIEW', dashboardId, { permission, source: 'github_pages_static' });
    const demoData = dashboardSamples[dashboardId] ?? [{ aviso: 'Dashboard sin plantilla estática', dashboard: dashboardId }];

    app.innerHTML = `
      <main class="app-shell">
        ${topbarTemplate(profile)}
        <section class="page-container">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Dashboard</p>
              <h1>${escapeHtml(dashboard.name || dashboard.id)}</h1>
              <p>${escapeHtml(dashboard.description || 'Datos empresariales protegidos.')}</p>
            </div>
            <span class="permission-badge permission-${escapeHtml(permission)}">
              ${permission === 'write' ? 'Lectura y edición' : 'Solo lectura'}
            </span>
          </div>

          <div class="content-stack">
            <section class="panel">
              <div class="panel-heading">
                <div>
                  <p class="eyebrow">Fuente de datos</p>
                  <h2>Vista genérica</h2>
                  <p>Esta versión corre en GitHub Pages. Los datos reales de Google Sheets deben conectarse después mediante una función externa o carga manual segura.</p>
                </div>
              </div>
              ${dataTableTemplate(demoData)}
            </section>

            ${permission === 'write' ? `
              <section class="panel">
                <div class="panel-heading">
                  <div>
                    <p class="eyebrow">Edición controlada</p>
                    <h2>Registrar actualización</h2>
                    <p>En modo estático, esta acción registra auditoría en Supabase. No escribe en Google Sheets porque GitHub Pages no puede proteger secretos de servidor.</p>
                  </div>
                </div>
                <form class="form-grid" id="dashboard-update-form">
                  <label class="field">
                    <span>Rango</span>
                    <input name="range" value="F2:F100" required />
                  </label>
                  <label class="field field-span-2">
                    <span>Values (JSON)</span>
                    <textarea name="values" rows="8" required>[{"valor":"nuevo"}]</textarea>
                  </label>
                  <div class="form-actions field-span-2">
                    <button type="submit" class="button button-primary">Registrar actualización</button>
                    <span class="success-text" id="update-result"></span>
                  </div>
                </form>
              </section>
            ` : ''}
          </div>
        </section>
      </main>
    `;

    bindSignOut();
    const form = document.querySelector('#dashboard-update-form');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const result = document.querySelector('#update-result');
        const button = form.querySelector('button');
        result.textContent = '';
        button.disabled = true;
        button.textContent = 'Registrando…';

        try {
          const formData = new FormData(form);
          const range = String(formData.get('range') || '').trim();
          const valuesText = String(formData.get('values') || '[]');
          const values = JSON.parse(valuesText);
          if (!Array.isArray(values)) throw new Error('Values debe ser un arreglo JSON válido.');
          await logAudit('DASHBOARD_UPDATE', dashboardId, {
            range,
            new_values: values,
            source: 'github_pages_static_audit_only',
          });
          result.textContent = 'Actualización registrada en auditoría.';
        } catch (error) {
          result.textContent = error instanceof Error ? error.message : 'No fue posible registrar.';
        } finally {
          button.disabled = false;
          button.textContent = 'Registrar actualización';
        }
      });
    }
  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${topbarTemplate()}
        <section class="page-container">
          <div class="alert alert-error">${escapeHtml(error instanceof Error ? error.message : 'No fue posible abrir el dashboard.')}</div>
          <p><a href="#/portal" class="button button-secondary">Volver al portal</a></p>
        </section>
      </main>
    `;
    bindSignOut();
  }
}

async function loadAdminData() {
  const [usersResult, dashboardsResult, accessResult, auditResult] = await Promise.all([
    supabase.from('profiles').select('id,email,name,role,active,created_at').order('created_at', { ascending: false }),
    supabase.from('dashboards').select('id,name,description,active,created_at').order('name', { ascending: true }),
    supabase.from('dashboard_access').select('user_id,dashboard_id,permission,created_at'),
    supabase.from('audit_log').select('id,actor_email,action,dashboard_id,details,created_at').order('created_at', { ascending: false }).limit(150),
  ]);

  for (const result of [usersResult, dashboardsResult, accessResult, auditResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    users: usersResult.data ?? [],
    dashboards: dashboardsResult.data ?? [],
    access: accessResult.data ?? [],
    audit: auditResult.data ?? [],
  };
}

function permissionValue(access, userId, dashboardId) {
  const row = access.find((entry) => entry.user_id === userId && entry.dashboard_id === dashboardId);
  return row?.permission ?? 'none';
}

function permissionOptions(value) {
  return `
    <option value="none" ${value === 'none' ? 'selected' : ''}>Sin acceso</option>
    <option value="read" ${value === 'read' ? 'selected' : ''}>Solo lectura</option>
    <option value="write" ${value === 'write' ? 'selected' : ''}>Lectura y edición</option>
  `;
}

async function renderAdmin(notice = '', error = '') {
  setLoading('Cargando administración…');
  try {
    const profile = await requireAdminProfile();
    const data = await loadAdminData();

    app.innerHTML = `
      <main class="app-shell">
        ${topbarTemplate(profile)}
        <section class="page-container admin-container">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Control central</p>
              <h1>Administración</h1>
              <p>Gestión estática vía Supabase RLS: usuarios existentes, permisos y auditoría.</p>
            </div>
            <span class="status-pill status-admin">Administrador</span>
          </div>

          ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
          ${notice ? `<div class="alert alert-success">${escapeHtml(notice)}</div>` : ''}

          <div class="alert alert-warning">
            GitHub Pages no puede ejecutar <span class="kbd">auth.admin.inviteUserByEmail()</span> porque eso requiere una secret key privada. Crea o invita usuarios desde Supabase Auth; después aparecerán aquí para activar/desactivar y asignar permisos.
          </div>

          <div class="admin-grid">
            <section class="panel">
              <div class="panel-heading">
                <div>
                  <p class="eyebrow">Usuarios</p>
                  <h2>Estado de cuentas</h2>
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Creación</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.users.map((user) => `
                      <tr>
                        <td>
                          <div class="user-line"><strong>${escapeHtml(user.name || 'Sin nombre')}</strong></div>
                          <div class="muted small-text">${escapeHtml(user.email)}</div>
                        </td>
                        <td><span class="status-pill ${user.role === 'admin' ? 'status-admin' : 'status-user'}">${escapeHtml(user.role)}</span></td>
                        <td><span class="status-pill ${user.active ? 'status-active' : 'status-disabled'}">${user.active ? 'Activo' : 'Desactivado'}</span></td>
                        <td>${escapeHtml(formatDate(user.created_at))}</td>
                        <td>
                          <button
                            type="button"
                            class="button ${user.active ? 'button-danger' : 'button-secondary'}"
                            data-user-toggle="${escapeHtml(user.id)}"
                            ${user.id === profile.id ? 'disabled title="No puedes desactivarte a ti mismo desde aquí"' : ''}
                          >
                            ${user.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="panel">
              <div class="panel-heading">
                <div>
                  <p class="eyebrow">Crear / invitar usuario</p>
                  <h2>Proceso para GitHub Pages</h2>
                </div>
              </div>
              <div class="content-stack">
                <p class="helper-text">En esta versión estática, la invitación segura se hace manualmente desde Supabase:</p>
                <ol class="helper-text">
                  <li>Ve a <strong>Supabase → Authentication → Users</strong>.</li>
                  <li>Invita o crea el usuario.</li>
                  <li>Ejecuta el trigger o espera a que aparezca en <strong>profiles</strong>.</li>
                  <li>Regresa aquí para activar/desactivar y asignar dashboards.</li>
                </ol>
                <p class="helper-text">Redirect recomendado: <span class="kbd">${escapeHtml(window.location.origin + window.location.pathname)}</span></p>
              </div>
            </section>
          </div>

          <section class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Permisos</p>
                <h2>Acceso por dashboard</h2>
                <p>Los administradores tienen acceso completo aunque no tengan filas en permisos.</p>
              </div>
            </div>
            <div class="content-stack">
              ${data.users.map((user) => `
                <div class="permission-row">
                  <div>
                    <strong>${escapeHtml(user.name || user.email)}</strong>
                    <div class="muted small-text">${escapeHtml(user.email)} · ${escapeHtml(user.role)}</div>
                  </div>
                  <div class="permission-list">
                    ${data.dashboards.map((dashboard) => {
                      const selected = permissionValue(data.access, user.id, dashboard.id);
                      return `
                        <label>
                          <span>${escapeHtml(dashboard.name)}</span>
                          <select data-permission-user="${escapeHtml(user.id)}" data-permission-dashboard="${escapeHtml(dashboard.id)}" ${user.role === 'admin' ? 'disabled' : ''}>
                            ${permissionOptions(selected)}
                          </select>
                        </label>
                      `;
                    }).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Auditoría</p>
                <h2>Últimos eventos</h2>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha/hora</th>
                    <th>Correo</th>
                    <th>Acción</th>
                    <th>Dashboard</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.audit.map((event) => `
                    <tr>
                      <td>${escapeHtml(formatDate(event.created_at))}</td>
                      <td>${escapeHtml(event.actor_email || '—')}</td>
                      <td><span class="kbd">${escapeHtml(event.action)}</span></td>
                      <td>${escapeHtml(event.dashboard_id || '—')}</td>
                      <td><pre class="code-block">${safeJson(event.details || {})}</pre></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    `;

    bindSignOut();
    document.querySelectorAll('[data-user-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        const userId = button.getAttribute('data-user-toggle');
        const user = data.users.find((entry) => entry.id === userId);
        if (!user || user.id === profile.id) return;
        button.disabled = true;
        try {
          const newActive = !user.active;
          const { error: updateError } = await supabase.from('profiles').update({ active: newActive }).eq('id', user.id);
          if (updateError) throw updateError;
          await logAudit(newActive ? 'USER_ENABLED' : 'USER_DISABLED', null, {
            target_user_id: user.id,
            target_email: user.email,
          });
          await renderAdmin(`Usuario ${newActive ? 'activado' : 'desactivado'} correctamente.`);
        } catch (actionError) {
          await renderAdmin('', actionError instanceof Error ? actionError.message : 'No fue posible actualizar el usuario.');
        }
      });
    });

    document.querySelectorAll('[data-permission-user]').forEach((select) => {
      select.addEventListener('change', async () => {
        const userId = select.getAttribute('data-permission-user');
        const dashboardId = select.getAttribute('data-permission-dashboard');
        const permission = select.value;
        select.disabled = true;
        try {
          if (permission === 'none') {
            const { error: deleteError } = await supabase
              .from('dashboard_access')
              .delete()
              .eq('user_id', userId)
              .eq('dashboard_id', dashboardId);
            if (deleteError) throw deleteError;
          } else {
            const { error: upsertError } = await supabase
              .from('dashboard_access')
              .upsert({ user_id: userId, dashboard_id: dashboardId, permission });
            if (upsertError) throw upsertError;
          }
          await logAudit('PERMISSION_CHANGED', dashboardId, {
            target_user_id: userId,
            permission: permission === 'none' ? null : permission,
          });
          await renderAdmin('Permiso actualizado correctamente.');
        } catch (permissionError) {
          await renderAdmin('', permissionError instanceof Error ? permissionError.message : 'No fue posible cambiar el permiso.');
        }
      });
    });
  } catch (adminError) {
    app.innerHTML = `
      <main class="app-shell">
        ${topbarTemplate()}
        <section class="page-container">
          <div class="alert alert-error">${escapeHtml(adminError instanceof Error ? adminError.message : 'No fue posible cargar administración.')}</div>
          <p><a href="#/portal" class="button button-secondary">Volver al portal</a></p>
        </section>
      </main>
    `;
    bindSignOut();
  }
}

async function renderSetPassword(message = '', error = '') {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-labelledby="password-title">
        <div class="brand-mark" aria-hidden="true">DP</div>
        <div class="auth-heading">
          <p class="eyebrow">Cuenta invitada</p>
          <h1 id="password-title">Crear contraseña</h1>
          <p>Define una contraseña de al menos 10 caracteres.</p>
        </div>
        ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
        ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ''}
        <form id="set-password-form" class="form-stack">
          <label class="field">
            <span>Nueva contraseña</span>
            <input name="password" type="password" autocomplete="new-password" minlength="10" required />
          </label>
          <label class="field">
            <span>Confirmar contraseña</span>
            <input name="confirm" type="password" autocomplete="new-password" minlength="10" required />
          </label>
          <button type="submit" class="button button-primary button-full">Guardar contraseña</button>
        </form>
        <p class="auth-footnote"><a href="#/">Volver al inicio</a></p>
      </section>
    </main>
  `;

  const form = document.querySelector('#set-password-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const password = String(formData.get('password') || '');
    const confirm = String(formData.get('confirm') || '');

    if (password.length < 10) {
      renderSetPassword('', 'La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (password !== confirm) {
      renderSetPassword('', 'Las contraseñas no coinciden.');
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const profile = await requireActiveProfile();
      currentProfile = profile;
      navigate('/portal');
    } catch (updateError) {
      renderSetPassword('', updateError instanceof Error ? updateError.message : 'No fue posible guardar la contraseña.');
    }
  });
}

function renderNotFound() {
  app.innerHTML = `
    <main class="app-shell">
      ${topbarTemplate()}
      <section class="page-container">
        <div class="empty-state">
          <h2>Página no encontrada</h2>
          <p>La ruta solicitada no existe dentro del portal estático.</p>
          <p><a href="#/portal" class="button button-secondary">Ir al portal</a></p>
        </div>
      </section>
    </main>
  `;
  bindSignOut();
}

async function renderRoute() {
  const route = currentRoute();
  if (route === '/') return renderLogin();
  if (route === '/portal') return renderPortal();
  if (route === '/admin') return renderAdmin();
  if (route === '/set-password') return renderSetPassword();
  if (route.startsWith('/dashboard/')) {
    const dashboardId = decodeURIComponent(route.replace('/dashboard/', '').trim());
    if (dashboardId) return renderDashboard(dashboardId);
  }
  return renderNotFound();
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', renderRoute);
