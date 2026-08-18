import { z } from 'zod';

/**
 * Contrato HTTP de Hipotecas API. Mientras la variable no esté configurada,
 * la aplicación continúa usando el catálogo de demostración de la Fase 1.
 */

const CLAVE_SESION = 'hipotecas-api-access-token';
const CLAVE_REFRESH = 'hipotecas-api-refresh-token';
const CLAVE_CODIGO_INMOBILIARIA = 'hipotecas-api-agency-code';
const TAMANO_MAXIMO_RESPUESTA = 8 * 1_024 * 1_024;
const TIEMPO_MAXIMO_SOLICITUD_MS = 30_000;

function normalizarBaseUrl(valor: string | undefined): string | null {
  if (valor === undefined || valor.trim() === '') return null;
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
      return null;
    }
    if (url.username !== '' || url.password !== '') return null;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

const BASE_URL = normalizarBaseUrl(import.meta.env.VITE_HIPOTECAS_API_URL);
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export interface SesionApi {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string; readonly email: string | null };
}

export class ErrorHipotecasApi extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ErrorHipotecasApi';
    this.status = status;
  }
}

export interface InmobiliariaApi {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
}

export interface ViviendaCatalogoApi {
  readonly id: string;
  readonly title: string;
  readonly price_cents: number;
  readonly zone: string;
  readonly area_m2: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly description: string;
  readonly main_image_url: string;
  readonly listing_url: string;
  readonly status: 'draft' | 'published' | 'withdrawn';
}

export type EstadoViviendaAgenciaApi = ViviendaCatalogoApi['status'];

export interface ViviendaAgenciaApi extends ViviendaCatalogoApi {
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly gallery_urls: readonly string[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface BorradorViviendaAgenciaApi {
  readonly title: string;
  readonly priceCents: number;
  readonly zone: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly areaM2: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly description: string;
  readonly mainImageUrl: string;
  readonly galleryUrls: readonly string[];
  readonly listingUrl: string;
  readonly status: EstadoViviendaAgenciaApi;
}

export interface CodigoInvitacionApi {
  readonly id: string;
  readonly code: string;
  readonly expires_at: string | null;
  readonly max_uses: number;
  readonly uses_count: number;
  readonly status: 'active' | 'used' | 'expired' | 'revoked';
  readonly created_at: string;
  readonly revoked_at: string | null;
}

export interface InmobiliariaAdministracionApi extends InmobiliariaApi {
  readonly website: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly contact_email: string | null;
  readonly logo_url: string | null;
  readonly active: boolean;
  readonly created_at: string;
}

export interface EmpleadoInmobiliariaApi {
  readonly user_id: string;
  readonly email: string;
  readonly role: 'agent' | 'admin';
  readonly created_at: string;
}

interface RespuestaSesion {
  readonly user: { readonly id: string; readonly email: string | null };
  readonly session: { readonly access_token: string; readonly refresh_token: string } | null;
}

const zUuid = z.string().uuid();
const zTexto = z.string().max(10_000);
const zFecha = z.string().datetime({ offset: true });
const zEstadoVivienda = z.enum(['draft', 'published', 'withdrawn']);
const zInmobiliariaApi = z
  .object({ id: zUuid, name: z.string().min(1).max(200), brand: z.string().min(1).max(200) })
  .strict();
const zViviendaCatalogoApi = z
  .object({
    id: zUuid,
    title: z.string().min(1).max(300),
    price_cents: z.number().int().positive().max(100_000_000_000),
    zone: z.string().min(1).max(300),
    area_m2: z.number().int().positive().max(10_000),
    bedrooms: z.number().int().min(0).max(100),
    bathrooms: z.number().int().min(0).max(100),
    description: zTexto,
    main_image_url: z.string().min(1).max(1_500_000),
    listing_url: z.string().url().max(2_048),
    status: zEstadoVivienda,
  })
  .strict();
const zViviendaAgenciaApi = zViviendaCatalogoApi
  .extend({
    address: z.string().max(500).nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    gallery_urls: z.array(z.string().url().max(2_048)).max(12),
    published_at: zFecha.nullable(),
    created_at: zFecha,
    updated_at: zFecha,
  })
  .strict();
const zCodigoInvitacionApi = z
  .object({
    id: zUuid,
    code: z.string().regex(/^CASA-[A-Z0-9]{4,12}$/),
    expires_at: zFecha.nullable(),
    max_uses: z.number().int().positive().max(10_000),
    uses_count: z.number().int().min(0).max(10_000),
    status: z.enum(['active', 'used', 'expired', 'revoked']),
    created_at: zFecha,
    revoked_at: zFecha.nullable(),
  })
  .strict();
const zInmobiliariaAdministracionApi = zInmobiliariaApi
  .extend({
    website: z.string().url().max(2_048).nullable(),
    address: z.string().max(500).nullable(),
    phone: z.string().max(32).nullable(),
    contact_email: z.string().email().max(320).nullable(),
    logo_url: z.string().max(1_500_000).nullable(),
    active: z.boolean(),
    created_at: zFecha,
  })
  .strict();
const zEmpleadoInmobiliariaApi = z
  .object({
    user_id: zUuid,
    email: z.string().email().max(320),
    role: z.enum(['agent', 'admin']),
    created_at: zFecha,
  })
  .strict();
const zRespuestaSesion = z
  .object({
    user: z.object({ id: zUuid, email: z.string().email().nullable() }).strict(),
    session: z
      .object({
        access_token: z.string().min(1).max(20_000),
        refresh_token: z.string().min(1).max(20_000),
      })
      .strict()
      .nullable(),
  })
  .strict();
const zErrorRespuesta = z.object({ error: z.string().trim().min(1).max(1_000) });
const zRespuestaInmobiliaria = z.object({ agency: zInmobiliariaApi }).strict();
const zRespuestaCatalogo = z
  .object({
    agency: zInmobiliariaApi.nullable(),
    properties: z.array(zViviendaCatalogoApi).max(5_000),
  })
  .strict();
const zRespuestaPanelAgente = z
  .object({ agency: zInmobiliariaApi, role: z.enum(['agent', 'admin']) })
  .strict();
const zRespuestaViviendasAgente = z
  .object({ properties: z.array(zViviendaAgenciaApi).max(5_000) })
  .strict();
const zRespuestaViviendaAgente = z.object({ property: zViviendaAgenciaApi }).strict();
const zRespuestaCodigos = z.object({ codes: z.array(zCodigoInvitacionApi).max(10_000) }).strict();
const zRespuestaCodigo = z.object({ code: zCodigoInvitacionApi }).strict();
const zRespuestaSuperadmin = z.object({ email: z.string().email().max(320).nullable() }).strict();
const zRespuestaInmobiliariasAdministracion = z
  .object({ agencies: z.array(zInmobiliariaAdministracionApi).max(1_000) })
  .strict();
const zRespuestaInmobiliariaAdministracion = z
  .object({ agency: zInmobiliariaAdministracionApi })
  .strict();
const zRespuestaEmpleados = z
  .object({ employees: z.array(zEmpleadoInmobiliariaApi).max(10_000) })
  .strict();
const zRespuestaEmpleado = z.object({ employee: zEmpleadoInmobiliariaApi }).strict();
const zSinContenido = z.undefined();

export function apiHipotecasConfigurada(): boolean {
  return BASE_URL !== null && PUBLISHABLE_KEY !== undefined && PUBLISHABLE_KEY !== '';
}

export function tokenSesionApi(): string | null {
  return localStorage.getItem(CLAVE_SESION);
}

function tokenRefreshApi(): string | null {
  return localStorage.getItem(CLAVE_REFRESH);
}

export function cerrarSesionApi(): void {
  localStorage.removeItem(CLAVE_SESION);
  localStorage.removeItem(CLAVE_REFRESH);
}

export function codigoInmobiliariaApi(): string | null {
  return localStorage.getItem(CLAVE_CODIGO_INMOBILIARIA);
}

export function guardarCodigoInmobiliariaApi(code: string | null): void {
  if (code === null) localStorage.removeItem(CLAVE_CODIGO_INMOBILIARIA);
  else localStorage.setItem(CLAVE_CODIGO_INMOBILIARIA, code.trim().toUpperCase());
}

async function leerJsonLimitado(respuesta: Response): Promise<unknown> {
  const longitud = respuesta.headers.get('Content-Length');
  const longitudDeclarada = longitud === null ? NaN : Number(longitud);
  if (Number.isFinite(longitudDeclarada) && longitudDeclarada > TAMANO_MAXIMO_RESPUESTA) {
    throw new Error('respuesta-demasiado-grande');
  }
  if (respuesta.body === null) throw new Error('respuesta-vacia');

  const lector = respuesta.body.getReader();
  const partes: Uint8Array[] = [];
  let tamano = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    tamano += value.byteLength;
    if (tamano > TAMANO_MAXIMO_RESPUESTA) {
      await lector.cancel();
      throw new Error('respuesta-demasiado-grande');
    }
    partes.push(value);
  }

  const bytes = new Uint8Array(tamano);
  let posicion = 0;
  for (const parte of partes) {
    bytes.set(parte, posicion);
    posicion += parte.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function solicitar<T>(
  ruta: string,
  esquema: z.ZodType<T>,
  opciones: RequestInit = {},
  permitirRenovacion = true,
): Promise<T> {
  if (!apiHipotecasConfigurada()) throw new Error('La API de Hipotecas no está configurada.');
  const token = tokenSesionApi();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL ?? ''}${ruta}`, {
      ...opciones,
      headers: {
        Accept: 'application/json',
        apikey: PUBLISHABLE_KEY ?? '',
        ...(opciones.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...opciones.headers,
      },
      signal: opciones.signal ?? AbortSignal.timeout(TIEMPO_MAXIMO_SOLICITUD_MS),
    });
  } catch (causa) {
    throw new ErrorHipotecasApi(
      causa instanceof DOMException && causa.name === 'TimeoutError'
        ? 'La API de Hipotecas tardó demasiado en responder.'
        : 'No se pudo conectar con la API de Hipotecas.',
      0,
      { cause: causa },
    );
  }
  if (respuesta.status === 204) {
    const vacio = esquema.safeParse(undefined);
    if (vacio.success) return vacio.data;
    throw new ErrorHipotecasApi('La API de Hipotecas devolvió una respuesta incompleta.', 204);
  }

  const contentType = respuesta.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ErrorHipotecasApi(
      'La API de Hipotecas devolvió una respuesta no válida.',
      respuesta.status,
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await leerJsonLimitado(respuesta);
  } catch (causa) {
    throw new ErrorHipotecasApi(
      'La API de Hipotecas devolvió una respuesta no válida.',
      respuesta.status,
      { cause: causa },
    );
  }
  if (!respuesta.ok) {
    const errorValidado = zErrorRespuesta.safeParse(cuerpo);
    const mensaje = errorValidado.success
      ? errorValidado.data.error
      : 'No se pudo completar la solicitud.';
    if (
      respuesta.status === 401 &&
      permitirRenovacion &&
      !ruta.startsWith('/v1/auth/') &&
      tokenRefreshApi() !== null &&
      (await renovarSesionInterna())
    ) {
      return solicitar(ruta, esquema, opciones, false);
    }
    throw new ErrorHipotecasApi(mensaje, respuesta.status);
  }

  const validado = esquema.safeParse(cuerpo);
  if (!validado.success) {
    throw new ErrorHipotecasApi(
      'La API de Hipotecas devolvió una respuesta incompleta.',
      respuesta.status,
      {
        cause: validado.error,
      },
    );
  }
  return validado.data;
}

function guardarSesion(respuesta: RespuestaSesion): SesionApi {
  if (respuesta.session === null) {
    throw new Error('Confirma tu correo electrónico antes de iniciar sesión.');
  }
  localStorage.setItem(CLAVE_SESION, respuesta.session.access_token);
  localStorage.setItem(CLAVE_REFRESH, respuesta.session.refresh_token);
  return {
    accessToken: respuesta.session.access_token,
    refreshToken: respuesta.session.refresh_token,
    user: respuesta.user,
  };
}

async function renovarSesionInterna(): Promise<boolean> {
  const refreshToken = tokenRefreshApi();
  if (refreshToken === null) return false;
  try {
    guardarSesion(
      await solicitar(
        '/v1/auth/refresh',
        zRespuestaSesion,
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        false,
      ),
    );
    return true;
  } catch {
    cerrarSesionApi();
    return false;
  }
}

async function crearSesionAnonimaApi(): Promise<SesionApi> {
  return guardarSesion(
    await solicitar('/v1/auth/anonymous', zRespuestaSesion, { method: 'POST' }, false),
  );
}

export async function crearCuentaApi(email: string, password: string): Promise<SesionApi> {
  return guardarSesion(
    await solicitar('/v1/auth/sign-up', zRespuestaSesion, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  );
}

export async function iniciarSesionApi(email: string, password: string): Promise<SesionApi> {
  return guardarSesion(
    await solicitar('/v1/auth/sign-in', zRespuestaSesion, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  );
}

export async function canjearCodigoInmobiliariaApi(
  code: string,
): Promise<{ readonly agency: InmobiliariaApi }> {
  if (tokenSesionApi() === null) await crearSesionAnonimaApi();
  return solicitar('/v1/agency-links/redeem', zRespuestaInmobiliaria, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function previsualizarCodigoInmobiliariaApi(
  code: string,
): Promise<{ readonly agency: InmobiliariaApi }> {
  return solicitar('/v1/agency-links/preview', zRespuestaInmobiliaria, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function desvincularInmobiliariaApi(): Promise<void> {
  await solicitar('/v1/agency-links', zSinContenido, { method: 'DELETE' });
}

export async function catalogoApi(): Promise<{
  readonly agency: InmobiliariaApi | null;
  readonly properties: ViviendaCatalogoApi[];
}> {
  return solicitar('/v1/catalog/properties', zRespuestaCatalogo);
}

export async function anadirFavoritoCatalogoApi(agencyPropertyId: string): Promise<void> {
  await solicitar('/v1/favorites', zSinContenido, {
    method: 'POST',
    body: JSON.stringify({ agencyPropertyId }),
  });
}

export async function panelAgenteApi(): Promise<{
  readonly agency: InmobiliariaApi;
  readonly role: 'agent' | 'admin';
}> {
  return solicitar('/v1/agent/me', zRespuestaPanelAgente);
}

export async function viviendasAgenteApi(): Promise<{
  readonly properties: ViviendaAgenciaApi[];
}> {
  return solicitar('/v1/agent/properties', zRespuestaViviendasAgente);
}

export async function crearViviendaAgenteApi(
  vivienda: BorradorViviendaAgenciaApi,
): Promise<{ readonly property: ViviendaAgenciaApi }> {
  return solicitar('/v1/agent/properties', zRespuestaViviendaAgente, {
    method: 'POST',
    body: JSON.stringify(vivienda),
  });
}

export async function actualizarViviendaAgenteApi(
  id: string,
  vivienda: BorradorViviendaAgenciaApi,
): Promise<{ readonly property: ViviendaAgenciaApi }> {
  return solicitar(`/v1/agent/properties/${encodeURIComponent(id)}`, zRespuestaViviendaAgente, {
    method: 'PATCH',
    body: JSON.stringify(vivienda),
  });
}

export async function codigosInvitacionAgenteApi(): Promise<{
  readonly codes: CodigoInvitacionApi[];
}> {
  return solicitar('/v1/agent/invitation-codes', zRespuestaCodigos);
}

export async function generarCodigoInvitacionAgenteApi(input: {
  readonly expiresAt: string | null;
  readonly maxUses: number;
}): Promise<{ readonly code: CodigoInvitacionApi }> {
  return solicitar('/v1/agent/invitation-codes', zRespuestaCodigo, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revocarCodigoInvitacionAgenteApi(
  id: string,
): Promise<{ readonly code: CodigoInvitacionApi }> {
  return solicitar(
    `/v1/agent/invitation-codes/${encodeURIComponent(id)}/revoke`,
    zRespuestaCodigo,
    { method: 'POST' },
  );
}

export async function superadminApi(): Promise<{ readonly email: string | null }> {
  return solicitar('/v1/superadmin/me', zRespuestaSuperadmin);
}

export async function inmobiliariasAdministracionApi(): Promise<{
  readonly agencies: InmobiliariaAdministracionApi[];
}> {
  return solicitar('/v1/superadmin/agencies', zRespuestaInmobiliariasAdministracion);
}

export async function crearInmobiliariaAdministracionApi(input: {
  readonly name: string;
  readonly brand: string;
  readonly website: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly contactEmail: string | null;
  readonly logoDataUrl: string | null;
}): Promise<{ readonly agency: InmobiliariaAdministracionApi }> {
  return solicitar('/v1/superadmin/agencies', zRespuestaInmobiliariaAdministracion, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function actualizarInmobiliariaAdministracionApi(
  id: string,
  input: Pick<
    InmobiliariaAdministracionApi,
    'name' | 'brand' | 'website' | 'address' | 'phone' | 'contact_email' | 'logo_url' | 'active'
  >,
): Promise<{ readonly agency: InmobiliariaAdministracionApi }> {
  return solicitar(
    `/v1/superadmin/agencies/${encodeURIComponent(id)}`,
    zRespuestaInmobiliariaAdministracion,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...input,
        contactEmail: input.contact_email,
        logoDataUrl: input.logo_url,
      }),
    },
  );
}

export async function eliminarInmobiliariaAdministracionApi(id: string): Promise<void> {
  await solicitar(`/v1/superadmin/agencies/${encodeURIComponent(id)}`, zSinContenido, {
    method: 'DELETE',
  });
}

export async function empleadosInmobiliariaAdministracionApi(id: string): Promise<{
  readonly employees: EmpleadoInmobiliariaApi[];
}> {
  return solicitar(
    `/v1/superadmin/agencies/${encodeURIComponent(id)}/employees`,
    zRespuestaEmpleados,
  );
}

export async function crearEmpleadoInmobiliariaAdministracionApi(
  agencyId: string,
  input: { readonly email: string; readonly password: string; readonly role: 'agent' | 'admin' },
): Promise<{ readonly employee: EmpleadoInmobiliariaApi }> {
  return solicitar(
    `/v1/superadmin/agencies/${encodeURIComponent(agencyId)}/employees`,
    zRespuestaEmpleado,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function actualizarRolEmpleadoInmobiliariaApi(
  agencyId: string,
  userId: string,
  role: 'agent' | 'admin',
): Promise<void> {
  await solicitar(
    `/v1/superadmin/agencies/${encodeURIComponent(agencyId)}/employees/${encodeURIComponent(userId)}`,
    zSinContenido,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
}

export async function retirarEmpleadoInmobiliariaApi(
  agencyId: string,
  userId: string,
): Promise<void> {
  await solicitar(
    `/v1/superadmin/agencies/${encodeURIComponent(agencyId)}/employees/${encodeURIComponent(userId)}`,
    zSinContenido,
    { method: 'DELETE' },
  );
}
