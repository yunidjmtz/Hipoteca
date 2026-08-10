/**
 * Contrato HTTP de Hipotecas API. Mientras la variable no esté configurada,
 * la aplicación continúa usando el catálogo de demostración de la Fase 1.
 */

const CLAVE_SESION = 'hipotecas-api-access-token';
const CLAVE_CODIGO_INMOBILIARIA = 'hipotecas-api-agency-code';
const BASE_URL = import.meta.env.VITE_HIPOTECAS_API_URL?.replace(/\/$/, '');
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface SesionApi {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string; readonly email: string | null };
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

interface RespuestaSesion {
  readonly user: { readonly id: string; readonly email: string | null };
  readonly session: { readonly access_token: string; readonly refresh_token: string } | null;
}

export function apiHipotecasConfigurada(): boolean {
  return BASE_URL !== undefined && PUBLISHABLE_KEY !== undefined && PUBLISHABLE_KEY !== '';
}

export function tokenSesionApi(): string | null {
  return localStorage.getItem(CLAVE_SESION);
}

export function cerrarSesionApi(): void {
  localStorage.removeItem(CLAVE_SESION);
}

export function codigoInmobiliariaApi(): string | null {
  return localStorage.getItem(CLAVE_CODIGO_INMOBILIARIA);
}

export function guardarCodigoInmobiliariaApi(code: string | null): void {
  if (code === null) localStorage.removeItem(CLAVE_CODIGO_INMOBILIARIA);
  else localStorage.setItem(CLAVE_CODIGO_INMOBILIARIA, code.trim().toUpperCase());
}

async function solicitar<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  if (!apiHipotecasConfigurada()) throw new Error('La API de Hipotecas no está configurada.');
  const token = tokenSesionApi();
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/json',
      apikey: PUBLISHABLE_KEY ?? '',
      ...(opciones.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...opciones.headers,
    },
  });
  if (respuesta.status === 204) return undefined as T;
  const cuerpo: unknown = await respuesta.json();
  if (!respuesta.ok) {
    const mensaje =
      typeof cuerpo === 'object' &&
      cuerpo !== null &&
      'error' in cuerpo &&
      typeof cuerpo.error === 'string'
        ? cuerpo.error
        : 'No se pudo completar la solicitud.';
    throw new Error(mensaje);
  }
  return cuerpo as T;
}

function guardarSesion(respuesta: RespuestaSesion): SesionApi {
  if (respuesta.session === null) {
    throw new Error('Confirma tu correo electrónico antes de iniciar sesión.');
  }
  localStorage.setItem(CLAVE_SESION, respuesta.session.access_token);
  return {
    accessToken: respuesta.session.access_token,
    refreshToken: respuesta.session.refresh_token,
    user: respuesta.user,
  };
}

export async function crearCuentaApi(email: string, password: string): Promise<SesionApi> {
  return guardarSesion(
    await solicitar<RespuestaSesion>('/v1/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  );
}

export async function iniciarSesionApi(email: string, password: string): Promise<SesionApi> {
  return guardarSesion(
    await solicitar<RespuestaSesion>('/v1/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  );
}

export async function canjearCodigoInmobiliariaApi(
  code: string,
): Promise<{ readonly agency: InmobiliariaApi }> {
  return solicitar('/v1/agency-links/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function previsualizarCodigoInmobiliariaApi(
  code: string,
): Promise<{ readonly agency: InmobiliariaApi }> {
  return solicitar('/v1/agency-links/preview', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function desvincularInmobiliariaApi(): Promise<void> {
  await solicitar('/v1/agency-links', { method: 'DELETE' });
}

export async function catalogoApi(): Promise<{
  readonly agency: InmobiliariaApi | null;
  readonly properties: ViviendaCatalogoApi[];
}> {
  return solicitar('/v1/catalog/properties');
}

export async function catalogoPorCodigoApi(code: string): Promise<{
  readonly agency: InmobiliariaApi;
  readonly properties: ViviendaCatalogoApi[];
}> {
  return solicitar(`/v1/catalog/properties?code=${encodeURIComponent(code)}`);
}

export async function anadirFavoritoCatalogoApi(agencyPropertyId: string): Promise<void> {
  await solicitar('/v1/favorites', {
    method: 'POST',
    body: JSON.stringify({ agencyPropertyId }),
  });
}

export async function panelAgenteApi(): Promise<{
  readonly agency: InmobiliariaApi;
  readonly role: 'agent' | 'admin';
}> {
  return solicitar('/v1/agent/me');
}

export async function viviendasAgenteApi(): Promise<{
  readonly properties: ViviendaAgenciaApi[];
}> {
  return solicitar('/v1/agent/properties');
}

export async function crearViviendaAgenteApi(
  vivienda: BorradorViviendaAgenciaApi,
): Promise<{ readonly property: ViviendaAgenciaApi }> {
  return solicitar('/v1/agent/properties', {
    method: 'POST',
    body: JSON.stringify(vivienda),
  });
}

export async function actualizarViviendaAgenteApi(
  id: string,
  vivienda: BorradorViviendaAgenciaApi,
): Promise<{ readonly property: ViviendaAgenciaApi }> {
  return solicitar(`/v1/agent/properties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(vivienda),
  });
}

export async function codigosInvitacionAgenteApi(): Promise<{
  readonly codes: CodigoInvitacionApi[];
}> {
  return solicitar('/v1/agent/invitation-codes');
}

export async function generarCodigoInvitacionAgenteApi(input: {
  readonly expiresAt: string | null;
  readonly maxUses: number;
}): Promise<{ readonly code: CodigoInvitacionApi }> {
  return solicitar('/v1/agent/invitation-codes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revocarCodigoInvitacionAgenteApi(
  id: string,
): Promise<{ readonly code: CodigoInvitacionApi }> {
  return solicitar(`/v1/agent/invitation-codes/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
  });
}
