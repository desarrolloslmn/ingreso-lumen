# Dashboard Portal — versión estática para GitHub Pages

Esta versión está hecha para publicarse directamente en **GitHub Pages** sin Netlify, Vercel, Node.js ni build de Next.js.

GitHub Pages sirve archivos estáticos, por eso esta versión usa:

- `index.html`
- `styles.css`
- `app.js`
- Supabase Auth desde navegador
- Supabase PostgreSQL con RLS
- rutas hash tipo `#/portal`, `#/admin`, `#/dashboard/ventas`

## Qué debes subir a GitHub

Sube estos archivos y carpetas en la raíz del repositorio:

```text
index.html
styles.css
app.js
.nojekyll
.gitignore
README.md
supabase/
```

No subas archivos `.env`, `.env.local`, secretos, service accounts ni credenciales privadas.

## Cómo activar GitHub Pages

En tu repositorio:

1. Entra a **Settings → Pages**.
2. En **Build and deployment**, selecciona **Deploy from a branch**.
3. Selecciona la rama `main`.
4. Selecciona la carpeta `/root`.
5. Guarda.

Tu portal debería abrir en una URL similar a:

```text
https://desarrolloslmn.github.io/ingreso-lumen/
```

La navegación interna usa hash, por ejemplo:

```text
https://desarrolloslmn.github.io/ingreso-lumen/#/portal
https://desarrolloslmn.github.io/ingreso-lumen/#/admin
https://desarrolloslmn.github.io/ingreso-lumen/#/dashboard/ventas
```

## Configurar Supabase

Ejecuta en Supabase SQL Editor:

```text
supabase/migrations/001_github_pages_static.sql
```

La migración crea:

- `profiles`
- `dashboards`
- `dashboard_access`
- `audit_log`
- dashboards iniciales: `ventas`, `inventarios`, `produccion`
- RLS compatible con frontend estático
- trigger para crear `profiles` desde `auth.users`
- auditoría de eventos

## Crear el primer administrador

Primero crea el usuario en **Supabase → Authentication → Users**.

Después ejecuta:

```sql
update public.profiles
set role = 'admin', active = true
where email = 'TU_CORREO_ADMIN@EMPRESA.COM';
```

Luego inicia sesión desde GitHub Pages.

## Redirect URLs de Supabase

En **Supabase → Authentication → URL Configuration**, agrega tu URL de GitHub Pages:

```text
https://desarrolloslmn.github.io/ingreso-lumen/
```

También puedes agregar:

```text
https://desarrolloslmn.github.io/ingreso-lumen/#/set-password
```

## Limitaciones importantes de esta versión estática

GitHub Pages no puede guardar variables privadas ni ejecutar backend. Por eso esta versión **no puede** hacer de forma segura:

- `supabase.auth.admin.inviteUserByEmail()` desde el portal.
- Operaciones con `SUPABASE_SECRET_KEY`.
- Firmas HMAC privadas hacia Apps Script.
- Escritura real en Google Sheets con un secreto oculto.

En esta versión:

- El login funciona con `supabase.auth.signInWithPassword()`.
- El portal muestra dashboards autorizados usando RLS.
- Admin puede activar/desactivar usuarios existentes.
- Admin puede cambiar permisos por dashboard.
- La bitácora registra login, vistas, denegaciones, cambios de permisos y actualizaciones simuladas.
- Las invitaciones de usuarios se hacen manualmente desde Supabase Auth.
- Las actualizaciones de dashboard registran auditoría, pero no escriben en Google Sheets.

Para conectar Google Sheets con secreto real más adelante, necesitarás una capa externa segura, por ejemplo Supabase Edge Functions, Apps Script con validación propia pública limitada, Netlify Functions o Vercel Functions.

## Seguridad

Esta versión no incluye secretos reales.

El navegador solo usa:

```text
NEXT_PUBLIC_SUPABASE_URL equivalente:
https://aadbtmyyfydmxeclqzvm.supabase.co

NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY equivalente:
sb_publishable__n20snD8R6lGUOMIWFvSlg_70BYNBvU
```

La seguridad depende de Supabase Auth + RLS. No agregues policies amplias para `anon`.

## Desactivar registro público

Mantén desactivado el registro público si quieres que solo entren usuarios creados/invitados manualmente desde Supabase.
