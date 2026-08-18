# Hipotecas — guía persistente para agentes

Lee este archivo antes de modificar arquitectura, Supabase, Netlify o el flujo de inmobiliarias.

## Proyecto

- Aplicación React 19 + TypeScript + Vite para planificar la compra de vivienda e hipotecas.
- Repositorio: `yunidjmtz/Hipoteca`, rama de producción: `main`.
- Sitio Netlify: `hipotecasyuni` — https://hipotecasyuni.netlify.app
- Plan de producto inmobiliario: `docs/plan-inmobiliarias.md`.

## Comandos de trabajo (Windows / PowerShell)

Usar las variantes `.cmd` para npm y npx, porque la ejecución de scripts de PowerShell puede estar restringida.

```powershell
npm.cmd run lint
npx.cmd tsc -b
npm.cmd test
npx.cmd --yes netlify-cli deploy --prod --build
```

Antes de publicar, ejecutar como mínimo lint, TypeScript y tests. No usar comandos destructivos de Git.

## Backend Supabase

- Proyecto: `hipotecas_yuni` (`imkkagpmacwqzymmjvai`, región `eu-west-1`).
- El MCP de Supabase se configuró con ese `project_ref`; si no está disponible en una sesión, usar la CLI:

```powershell
npx.cmd --yes supabase projects list
npx.cmd --yes supabase db query --linked "select 1"
```

- La base remota ya contiene el esquema inmobiliario, RLS y funciones. Tablas principales:
  `real_estate_agencies`, `agency_users`, `agency_properties`,
  `agency_invitation_codes`, `client_agency_links`, `client_favorites` y
  `agency_audit_log`.
- No crear una migración que vuelva a crear esas tablas. El historial remoto de
  migraciones es anterior a este repositorio; `supabase db push --linked` se
  bloqueará. No ejecutar `supabase migration repair` para forzarlo. Inspeccionar
  primero el esquema mediante `supabase db query --linked`.
- La función Edge que expone la API para el frontend está en
  `supabase/functions/hipotecas-api/index.ts` y se despliega así:

```powershell
npx.cmd --yes supabase functions deploy hipotecas-api --project-ref imkkagpmacwqzymmjvai --use-api
```

- URL base de la API:
  `https://imkkagpmacwqzymmjvai.supabase.co/functions/v1/hipotecas-api`
- Rutas actuales:
  - `POST /v1/auth/anonymous`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/sign-up`
  - `POST /v1/auth/sign-in`
  - `POST /v1/agency-links/preview`
  - `POST /v1/agency-links/redeem`
  - `DELETE /v1/agency-links`
  - `GET /v1/catalog/properties`
  - `POST /v1/favorites`
- La función gestiona rutas públicas y JWT manualmente. Mantener
  `verify_jwt = false` en `supabase/config.toml`; las rutas protegidas deben
  validar el token y operar con un cliente Supabase con el JWT del usuario.
- El flujo cliente sin cuenta usa una sesión anónima de Supabase. Producción
  tiene **Allow anonymous sign-ins** activo desde el 18 de agosto de 2026 y el
  límite nativo explícito de 30 altas anónimas por hora e IP. CAPTCHA/Turnstile
  sigue siendo una mejora recomendada cuando haya claves del proveedor.
- No usar `supabase config push` con el `config.toml` mínimo del repositorio:
  también intenta sincronizar valores locales no declarados y servicios de
  Storage dependientes del plan. Cambiar Auth de forma dirigida mediante el
  Dashboard o la Management API y verificar después URL, MFA y correo.
- El canje de código se realiza de forma atómica mediante la función SQL remota
  `redeem_agency_invitation_code`. Respeta siempre RLS: clientes solo ven el
  catálogo publicado de su inmobiliaria vinculada y agentes solo operan su
  propia inmobiliaria.
- Las correcciones de `supabase/sql/agency-operations.sql`,
  `supabase/sql/superadmin-operations.sql` y `supabase/sql/rls-hardening.sql`
  están aplicadas en producción desde el 18 de agosto de 2026. Las políticas
  antiguas de vínculos, favoritos y códigos ya no existen; no volver a aplicar
  los ficheros salvo que un cambio concreto lo requiera y se haya revisado.

## Frontend y variables de entorno

- El cliente HTTP está en `src/services/hipotecasApi.ts`.
- La experiencia está en `src/pages/Ofertas.tsx`: usa Supabase si ambas
  variables están definidas; sin ellas conserva el catálogo de demostración.
- Variables de build públicas requeridas:

```env
VITE_HIPOTECAS_API_URL=https://imkkagpmacwqzymmjvai.supabase.co/functions/v1/hipotecas-api
VITE_SUPABASE_PUBLISHABLE_KEY=<clave-publicable-de-Supabase>
```

- Están configuradas en Netlify para `production`, `deploy-preview`,
  `branch-deploy` y `dev`. Nunca guardar claves secretas, tokens, `.env` ni
  `supabase/.temp/` en Git.
- Para consultar una clave publicable en una sesión autorizada:

```powershell
npx.cmd --yes supabase projects api-keys --project-ref imkkagpmacwqzymmjvai --output json
```

No usar `--reveal`: no hacen falta claves secretas para el frontend.

## Netlify

- El proyecto se vincula con:

```powershell
npx.cmd --yes netlify-cli link --id 0121b5eb-1636-4683-8822-645b4790b7db
```

- El push a `main` activa el despliegue continuo de Netlify. Si se necesita
  publicar manualmente, usar el comando de despliegue indicado arriba.
- Solo `netlify/functions/importar-anuncio.mjs` debe existir como función
  Netlify. No volver a añadir archivos `.d.mts` a `netlify/functions/`: Netlify
  los interpreta como funciones y rechaza el despliegue.

## Estado y próximo bloque

- Fase 1 (catálogo demo): completada.
- Fase 2 para cliente: backend, autenticación, canje, catálogo y favoritos
  activos en producción.
- Siguiente funcionalidad: Fase 3, panel privado de agentes para gestionar
  viviendas y generar/revocar códigos.
