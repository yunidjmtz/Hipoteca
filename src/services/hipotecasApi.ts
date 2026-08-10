/**
 * Contrato HTTP de Hipotecas API. Mientras la variable no esté configurada,
 * la aplicación continúa usando el catálogo de demostración de la Fase 1.
 */

const CLAVE_SESION = 'hipotecas-api-access-token';
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

export async function anadirFavoritoCatalogoApi(agencyPropertyId: string): Promise<void> {
  await solicitar('/v1/favorites', {
    method: 'POST',
    body: JSON.stringify({ agencyPropertyId }),
  });
}
