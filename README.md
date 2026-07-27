# Dashboard Portal

Portal interno seguro para centralizar el acceso a dashboards empresariales. Utiliza Supabase Auth para autenticación, PostgreSQL para perfiles/permisos/auditoría, Route Handlers de Next.js como capa backend y un puente servidor-servidor firmado hacia Google Apps Script para una integración posterior con Google Sheets.

## Tecnologías

- Next.js 16 con App Router
- TypeScript y React
- Supabase JS
- Supabase Auth
- Supabase PostgreSQL
- Row Level Security (RLS)
- Next.js Route Handlers
- Google Apps Script
- CSS propio, responsive

## Estructura principal

```text
dashboard-portal/
├── app/
│   ├── api/
│   │   ├── activity/login/route.ts
│   │   ├── admin/
│   │   │   ├── audit/route.ts
│   │   │   ├── invite/route.ts
│   │   │   ├── permissions/route.ts
│   │   │   └── users/route.ts
│   │   ├── dashboard/
│   │   │   ├── route.ts
│   │   │   └── update/route.ts
│   │   └── me/route.ts
│   ├── admin/page.tsx
│   ├── dashboard/[id]/page.tsx
│   ├── portal/page.tsx
│   ├── set-password/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── apps-script/Code.gs
├── lib/
├── supabase/migrations/001_initial.sql
├── .env.example
└── package.json
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa únicamente los secretos en tu entorno local o plataforma de despliegue.

```env
NEXT_PUBLIC_SUPABASE_URL=https://aadbtmyyfydmxeclqzvm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable__n20snD8R6lGUOMIWFvSlg_70BYNBvU

SUPABASE_SECRET_KEY=
APPS_SCRIPT_URL=
APPS_SCRIPT_SECRET=
```

El navegador solamente utiliza las dos variables `NEXT_PUBLIC_*`. `SUPABASE_SECRET_KEY` y `APPS_SCRIPT_SECRET` son exclusivamente de servidor.

### Secretos que nunca deben subirse al repositorio

- `SUPABASE_SECRET_KEY`
- claves `sb_secret_` o `service_role`
- `APPS_SCRIPT_SECRET`
- contraseña de PostgreSQL
- `SPREADSHEET_ID` si se decide tratarlo como configuración privada
- credenciales privadas de Google
- archivos `service-account.json`, claves `.pem`, `.p12`, `.pfx`, etc.

`.gitignore` ya excluye entornos locales, credenciales habituales, logs, `node_modules` y `.next`.

## Ejecutar localmente

Requisitos: Node.js 22+ y npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre `http://localhost:3000`.

Para validar producción:

```bash
npm run build
npm start
```

## Configurar Supabase

### 1. Desactivar registro público

En Supabase Auth, configura el proyecto para que los usuarios no puedan registrarse por sí mismos. Este portal no tiene ninguna interfaz de `sign up`; las cuentas se crean mediante invitación administrativa desde el backend.

Configura también la política de contraseñas de Supabase con longitud mínima de 10 caracteres para que la regla exista tanto en la interfaz como en Auth.

### 2. Ejecutar la migración

Ejecuta el contenido de:

```text
supabase/migrations/001_initial.sql
```

Puedes pegarlo en el SQL Editor de Supabase o ejecutarlo mediante Supabase CLI dentro de tu flujo de migraciones.

La migración:

- crea `profiles`, `dashboards`, `dashboard_access` y `audit_log`;
- crea `ventas`, `inventarios` y `produccion`;
- habilita RLS en las cuatro tablas;
- no crea policies para `anon` ni `authenticated`;
- revoca acceso directo de esos roles;
- crea un trigger sobre `auth.users` para generar `profiles`;
- importa usuarios de `auth.users` que ya existían;
- crea índices de auditoría.

### 3. Crear el primer administrador

Primero crea/invita el usuario desde Supabase Auth. Después de que exista su fila en `profiles`, cambia su rol manualmente con una operación administrativa en SQL:

```sql
update public.profiles
set role = 'admin', active = true
where email = 'TU_CORREO_ADMIN@EMPRESA.COM';
```

No se otorga el rol `admin` desde metadata del navegador ni automáticamente desde datos de invitación.

### 4. Clave privada de servidor

Configura `SUPABASE_SECRET_KEY` con una clave privada de backend generada por Supabase. No uses esa variable en Client Components ni la renombres con prefijo `NEXT_PUBLIC_`.

Las operaciones `supabase.auth.admin.*` viven exclusivamente en Route Handlers del servidor.

## Redirect URLs de Supabase

Agrega las URLs de invitación/recuperación que usarás en Auth > URL Configuration. Para desarrollo, como mínimo:

```text
http://localhost:3000/set-password
```

Para producción, agrega la URL equivalente de tu dominio:

```text
https://tu-dominio.com/set-password
```

La API de invitación usa el origen de la solicitud del servidor para construir el `redirectTo` hacia `/set-password`, así que ese dominio debe estar autorizado en Supabase.

## Flujo de autenticación y autorización

1. La página `/` usa `supabase.auth.signInWithPassword()` con el cliente público.
2. Tras autenticarse, el navegador llama `/api/me` con `Authorization: Bearer <JWT>`.
3. `server-auth.ts` valida el JWT mediante Supabase Auth usando el cliente privado del servidor.
4. Después lee `profiles` desde backend y exige `active = true`.
5. Si la cuenta está desactivada, el frontend cierra la sesión.
6. El acceso a dashboards y a administración se vuelve a validar en cada API; nunca se confía únicamente en ocultar botones en la interfaz.

## Permisos

- `admin`: acceso completo a todos los dashboards activos y a `/admin`.
- `user` + `read`: puede abrir el dashboard.
- `user` + `write`: puede abrir y enviar actualizaciones.
- sin fila en `dashboard_access`: no puede abrir ese dashboard.

Los permisos administrativos se aplican en servidor. Las tablas sensibles no se consultan directamente desde el navegador.

## Auditoría

Se registran como mínimo:

- `LOGIN`
- `DASHBOARD_VIEW`
- `DASHBOARD_ACCESS_DENIED`
- `DASHBOARD_UPDATE`
- `USER_INVITED`
- `USER_ENABLED`
- `USER_DISABLED`
- `PERMISSION_CHANGED`

Para actualizaciones se guarda dashboard, rango, nuevos valores y los valores anteriores cuando Apps Script los devuelve.

## Configurar Google Apps Script después

El archivo `apps-script/Code.gs` no contiene ID real de spreadsheet ni secretos.

### 1. Crear el script

Crea un proyecto de Apps Script y copia el contenido de `apps-script/Code.gs`.

### 2. Configurar Script Properties

En Apps Script agrega:

- `SPREADSHEET_ID`: ID del Google Sheet real.
- `APPS_SCRIPT_SECRET`: secreto fuerte compartido únicamente entre Next.js y Apps Script.

El mismo valor de `APPS_SCRIPT_SECRET` debe configurarse como variable privada en el servidor Next.js.

### 3. Configurar dashboards y rangos permitidos

`Code.gs` contiene:

- nombre de hoja;
- rango de lectura;
- lista `writeRanges` autorizada por dashboard.

Una actualización solamente se acepta si el rango solicitado está completamente contenido dentro de uno de los rangos autorizados. El frontend no puede ampliar ese permiso.

### 4. Desplegar Web App

Despliega Apps Script como Web App y coloca su URL en:

```env
APPS_SCRIPT_URL=
```

El endpoint verifica:

- HMAC SHA-256;
- timestamp con tolerancia máxima de 5 minutos;
- nonce guardado temporalmente en CacheService para reducir replay attacks;
- acción permitida;
- dashboard permitido;
- rango de escritura permitido.

La firma enviada por Next.js se calcula sobre:

```text
HMAC-SHA256(`${timestamp}.${nonce}.${body}`)
```

## Notas de seguridad

- No expongas `SUPABASE_SECRET_KEY` ni `APPS_SCRIPT_SECRET` al navegador.
- No agregues policies RLS amplias para `authenticated` sobre `profiles`, `dashboard_access` o `audit_log`.
- Mantén deshabilitado el registro público si el portal seguirá siendo solo por invitación.
- El hecho de ocultar `/admin` en la UI no es un control de seguridad; `requireAdmin()` valida cada endpoint administrativo.
- Las solicitudes de dashboard y actualización verifican nuevamente usuario, estado y permisos en servidor.
- El rol administrativo nunca se deriva de datos enviados por el frontend.
