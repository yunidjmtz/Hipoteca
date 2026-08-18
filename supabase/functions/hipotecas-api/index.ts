import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonObject = Record<string, unknown>;

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MAX_REQUEST_BODY_BYTES = 1_600_000;
const INVITATION_CODE_PATTERN = /^CASA-[A-Z0-9]{4,12}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno de la función.');
}
const configuredSupabaseUrl: string = supabaseUrl;
const configuredSupabaseAnonKey: string = supabaseAnonKey;

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'DELETE, GET, PATCH, POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

class RequestInputError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestInputError';
    this.status = status;
  }
}

async function readBody(request: Request): Promise<JsonObject | null> {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new RequestInputError('La petición debe usar contenido JSON.', 415);
  }

  const contentLength = request.headers.get('Content-Length');
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new RequestInputError('La petición supera el tamaño permitido.', 413);
  }

  try {
    if (request.body === null) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestInputError('La petición supera el tamaño permitido.', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch (cause) {
    if (cause instanceof RequestInputError) throw cause;
    return null;
  }
}

function stringField(body: JsonObject | null, field: string, maxLength = 10_000): string | null {
  const value = body?.[field];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed !== '' && trimmed.length <= maxLength ? trimmed : null;
}

function optionalStringField(
  body: JsonObject | null,
  field: string,
  maxLength = 10_000,
): string | null | undefined {
  const value = body?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : undefined;
}

function optionalProfileField(
  body: JsonObject | null,
  field: string,
  maxLength = 1_500_000,
): string | null {
  const value = body?.[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : null;
}

function positiveIntegerField(body: JsonObject | null, field: string, minimum = 1): number | null {
  const value = body?.[field];
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : null;
}

function invitationCodeField(body: JsonObject | null): string | null {
  const code = stringField(body, 'code', 17)?.toUpperCase() ?? null;
  return code !== null && INVITATION_CODE_PATTERN.test(code) ? code : null;
}

function uuidField(body: JsonObject | null, field: string): string | null {
  const value = stringField(body, field, 36);
  return value !== null && UUID_PATTERN.test(value) ? value : null;
}

function optionalCoordinateField(
  body: JsonObject | null,
  field: string,
): number | null | undefined {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validHttpUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validLogoDataUrl(value: string | null): boolean {
  return (
    value === null ||
    (/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length <= 1_500_000)
  );
}

function validPropertyImage(value: string): boolean {
  return (
    validHttpUrl(value) ||
    (/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length <= 1_500_000)
  );
}

type PropertyStatus = 'draft' | 'published' | 'withdrawn';

type AgentPropertyPayload = {
  title: string;
  price_cents: number;
  zone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  area_m2: number;
  bedrooms: number;
  bathrooms: number;
  description: string;
  main_image_url: string;
  gallery_urls: string[];
  listing_url: string;
  status: PropertyStatus;
};

function propertyPayload(body: JsonObject | null): AgentPropertyPayload | null {
  const title = stringField(body, 'title', 300);
  const priceCents = positiveIntegerField(body, 'priceCents');
  const zone = stringField(body, 'zone', 300);
  const address = optionalStringField(body, 'address', 500);
  const latitude = optionalCoordinateField(body, 'latitude');
  const longitude = optionalCoordinateField(body, 'longitude');
  const areaM2 = positiveIntegerField(body, 'areaM2');
  const bedrooms = positiveIntegerField(body, 'bedrooms', 0);
  const bathrooms = positiveIntegerField(body, 'bathrooms', 0);
  const description = stringField(body, 'description', 10_000);
  const mainImageUrl = stringField(body, 'mainImageUrl', 1_500_000);
  const listingUrl = stringField(body, 'listingUrl', 2_048);
  const status = body?.status;
  const galleryUrls = body?.galleryUrls;
  if (
    title === null ||
    priceCents === null ||
    zone === null ||
    address === undefined ||
    latitude === undefined ||
    longitude === undefined ||
    areaM2 === null ||
    bedrooms === null ||
    bathrooms === null ||
    description === null ||
    mainImageUrl === null ||
    listingUrl === null ||
    !validPropertyImage(mainImageUrl) ||
    !validHttpUrl(listingUrl) ||
    priceCents > 100_000_000_000 ||
    areaM2 > 10_000 ||
    bedrooms > 100 ||
    bathrooms > 100 ||
    (latitude === null) !== (longitude === null) ||
    (latitude !== null && (latitude < -90 || latitude > 90)) ||
    (longitude !== null && (longitude < -180 || longitude > 180)) ||
    !Array.isArray(galleryUrls) ||
    galleryUrls.length > 12 ||
    !galleryUrls.every((url) => typeof url === 'string' && validHttpUrl(url)) ||
    (status !== 'draft' && status !== 'published' && status !== 'withdrawn')
  ) {
    return null;
  }
  return {
    title,
    price_cents: priceCents,
    zone,
    address: address === '' ? null : address,
    latitude,
    longitude,
    area_m2: areaM2,
    bedrooms,
    bathrooms,
    description,
    main_image_url: mainImageUrl,
    gallery_urls: galleryUrls.map((url) => url.trim()),
    listing_url: listingUrl,
    status,
  };
}

function apiClient(accessToken?: string) {
  return createClient(configuredSupabaseUrl, configuredSupabaseAnonKey, {
    global:
      accessToken === undefined
        ? undefined
        : { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient() {
  if (supabaseServiceRoleKey === undefined) return null;
  return createClient(configuredSupabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function agencyFromInvitationCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!INVITATION_CODE_PATTERN.test(normalizedCode)) {
    return { agency: null, unavailable: false };
  }
  const admin = adminClient();
  if (admin === null) return { agency: null, unavailable: true };
  const { data: invitation, error: invitationError } = await admin
    .from('agency_invitation_codes')
    .select(
      'status, expires_at, max_uses, uses_count, agency:real_estate_agencies(id, name, brand, active)',
    )
    .eq('code', normalizedCode)
    .maybeSingle();
  if (invitationError !== null) return { agency: null, unavailable: true };
  const agency = invitation?.agency as
    { id: string; name: string; brand: string; active: boolean } | null | undefined;
  const expiresAtValue = invitation?.expires_at;
  const expiresAt =
    expiresAtValue === null
      ? null
      : typeof expiresAtValue === 'string'
        ? new Date(expiresAtValue)
        : undefined;
  if (
    invitation === null ||
    expiresAt === undefined ||
    invitation.status !== 'active' ||
    invitation.uses_count >= invitation.max_uses ||
    (expiresAt !== null && (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date())) ||
    agency === null ||
    agency === undefined ||
    !agency.active
  ) {
    return { agency: null, unavailable: false };
  }
  return { agency: { id: agency.id, name: agency.name, brand: agency.brand }, unavailable: false };
}

async function authenticatedClient(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (authorization === null || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (token === '') return null;

  const client = apiClient(token);
  const { data, error: authError } = await client.auth.getUser(token);
  if (authError !== null || data.user === null) return null;
  return { client, user: data.user };
}

async function agentContext(client: ReturnType<typeof apiClient>, userId: string) {
  const { data, error: membershipError } = await client
    .from('agency_users')
    .select('agency_id, role, agency:real_estate_agencies(id, name, brand, active)')
    .eq('user_id', userId)
    .in('role', ['agent', 'admin'])
    .maybeSingle();
  const agency = data?.agency as
    { id: string; name: string; brand: string; active: boolean } | null | undefined;
  if (
    membershipError !== null ||
    data === null ||
    agency === null ||
    agency === undefined ||
    !agency.active
  ) {
    return null;
  }
  return { agencyId: data.agency_id as string, role: data.role as 'agent' | 'admin', agency };
}

async function superAdminContext(client: ReturnType<typeof apiClient>, userId: string) {
  const { data, error: superAdminError } = await client
    .from('super_admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return superAdminError === null && data !== null;
}

function sessionResponse(user: { id: string; email?: string | null }, session: unknown) {
  const email =
    typeof user.email === 'string' && user.email.trim() !== '' ? user.email.trim() : null;
  if (session === null) {
    return json({ user: { id: user.id, email }, session: null });
  }
  if (typeof session !== 'object') return error('La sesión recibida no es válida.', 500);
  const accessToken = 'access_token' in session ? session.access_token : undefined;
  const refreshToken = 'refresh_token' in session ? session.refresh_token : undefined;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return error('La sesión recibida no es válida.', 500);
  }
  return json({
    user: { id: user.id, email },
    session: { access_token: accessToken, refresh_token: refreshToken },
  });
}

function invitationCodeView(value: unknown): JsonObject | null {
  const code = typeof value === 'object' && value !== null ? (value as JsonObject) : null;
  if (
    code === null ||
    typeof code.id !== 'string' ||
    typeof code.code !== 'string' ||
    (code.expires_at !== null && typeof code.expires_at !== 'string') ||
    typeof code.max_uses !== 'number' ||
    typeof code.uses_count !== 'number' ||
    (code.status !== 'active' &&
      code.status !== 'used' &&
      code.status !== 'expired' &&
      code.status !== 'revoked') ||
    typeof code.created_at !== 'string' ||
    (code.revoked_at !== null && typeof code.revoked_at !== 'string')
  ) {
    return null;
  }
  return {
    id: code.id,
    code: code.code,
    expires_at: code.expires_at,
    max_uses: code.max_uses,
    uses_count: code.uses_count,
    status: code.status,
    created_at: code.created_at,
    revoked_at: code.revoked_at,
  };
}

async function routeRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders() });

  // El runtime puede entregar la URL pública completa o una ruta ya prefijada
  // con el nombre de la función, según el entorno de ejecución.
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/(?:functions\/v1\/)?hipotecas-api/, '');

  if (request.method === 'POST' && path === '/v1/auth/anonymous') {
    const { data, error: anonymousError } = await apiClient().auth.signInAnonymously();
    if (anonymousError !== null || data.user === null || data.session === null) {
      return error(
        anonymousError?.status === 429
          ? 'Se han creado demasiadas sesiones. Inténtalo más tarde.'
          : 'No se puede iniciar la vinculación anónima en este momento.',
        anonymousError?.status === 429 ? 429 : 503,
      );
    }
    return sessionResponse(data.user, data.session);
  }

  if (request.method === 'POST' && path === '/v1/auth/refresh') {
    const refreshToken = stringField(await readBody(request), 'refreshToken', 20_000);
    if (refreshToken === null) return error('Falta la sesión que se quiere renovar.');
    const { data, error: refreshError } = await apiClient().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (refreshError !== null || data.user === null || data.session === null) {
      return error('La sesión ha caducado. Vuelve a iniciar la vinculación.', 401);
    }
    return sessionResponse(data.user, data.session);
  }

  if (request.method === 'POST' && path === '/v1/auth/sign-up') {
    const body = await readBody(request);
    const email = stringField(body, 'email', 320);
    const password = stringField(body, 'password', 1_024);
    if (email === null || password === null || password.length < 8) {
      return error('Indica un correo válido y una contraseña de al menos 8 caracteres.');
    }
    const { data, error: signUpError } = await apiClient().auth.signUp({ email, password });
    if (signUpError !== null || data.user === null) {
      return error('No se pudo crear la cuenta con esos datos.', 422);
    }
    return sessionResponse(data.user, data.session);
  }

  if (request.method === 'POST' && path === '/v1/auth/sign-in') {
    const body = await readBody(request);
    const email = stringField(body, 'email', 320);
    const password = stringField(body, 'password', 1_024);
    if (email === null || password === null) return error('Indica tu correo y contraseña.');
    const { data, error: signInError } = await apiClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInError !== null || data.user === null) {
      return error('El correo o la contraseña no son correctos.', 401);
    }
    return sessionResponse(data.user, data.session);
  }

  if (request.method === 'POST' && path === '/v1/agency-links/preview') {
    const code = invitationCodeField(await readBody(request));
    if (code === null) return error('Indica el código de invitación.');
    const result = await agencyFromInvitationCode(code);
    if (result.unavailable) return error('No se puede comprobar el código en este momento.', 503);
    if (result.agency === null) return error('El código no es válido o ya no está activo.', 422);
    return json({ agency: result.agency });
  }

  const authenticated = await authenticatedClient(request);
  if (authenticated === null) return error('Debes iniciar sesión para realizar esta acción.', 401);

  if (request.method === 'POST' && path === '/v1/agency-links/redeem') {
    const code = invitationCodeField(await readBody(request));
    if (code === null) return error('Indica el código de invitación.');
    const { data, error: redeemError } = await authenticated.client.rpc(
      'redeem_agency_invitation_code',
      {
        p_code: code,
      },
    );
    const resultado = data as { agency?: { id?: string; name?: string; brand?: string } } | null;
    if (
      redeemError !== null ||
      resultado?.agency?.id === undefined ||
      resultado.agency.name === undefined ||
      resultado.agency.brand === undefined
    ) {
      return error(
        redeemError?.code === 'P0001' ? redeemError.message : 'No se pudo canjear el código.',
        422,
      );
    }
    return json({ agency: resultado.agency });
  }

  if (request.method === 'DELETE' && path === '/v1/agency-links') {
    const { error: unlinkError } = await authenticated.client
      .from('client_agency_links')
      .delete()
      .eq('client_id', authenticated.user.id);
    if (unlinkError !== null) return error('No se pudo desvincular la inmobiliaria.', 422);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'GET' && path === '/v1/catalog/properties') {
    const { data: link, error: linkError } = await authenticated.client
      .from('client_agency_links')
      .select('agency:real_estate_agencies(id, name, brand)')
      .maybeSingle();
    if (linkError !== null) return error('No se pudo cargar la inmobiliaria vinculada.', 500);
    if (link === null || link.agency === null) return json({ agency: null, properties: [] });

    const agency = link.agency as unknown as { id: string; name: string; brand: string };
    const { data: properties, error: propertiesError } = await authenticated.client
      .from('agency_properties')
      .select(
        'id, title, price_cents, zone, area_m2, bedrooms, bathrooms, description, main_image_url, listing_url, status',
      )
      .eq('agency_id', agency.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5_000);
    if (propertiesError !== null) return error('No se pudo cargar el catálogo.', 500);
    return json({ agency, properties: properties ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/favorites') {
    const agencyPropertyId = uuidField(await readBody(request), 'agencyPropertyId');
    if (agencyPropertyId === null) return error('Indica la vivienda que quieres guardar.');
    const { data: visibleProperty, error: propertyError } = await authenticated.client
      .from('agency_properties')
      .select('id')
      .eq('id', agencyPropertyId)
      .maybeSingle();
    if (propertyError !== null || visibleProperty === null) {
      return error('La vivienda no está disponible en tu catálogo.', 404);
    }
    const { error: favoriteError } = await authenticated.client.from('client_favorites').insert({
      client_id: authenticated.user.id,
      agency_property_id: agencyPropertyId,
    });
    if (favoriteError !== null) {
      return error(
        favoriteError.code === '23505'
          ? 'Esta vivienda ya está en tus favoritos.'
          : 'No se pudo añadir la vivienda a favoritos.',
        favoriteError.code === '23505' ? 409 : 422,
      );
    }
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const isSuperAdmin = await superAdminContext(authenticated.client, authenticated.user.id);
  if (path.startsWith('/v1/superadmin/') && !isSuperAdmin) {
    return error('Tu cuenta no tiene acceso a la administración de inmobiliarias.', 403);
  }

  if (request.method === 'GET' && path === '/v1/superadmin/me' && isSuperAdmin) {
    return json({ email: authenticated.user.email ?? null });
  }

  if (request.method === 'GET' && path === '/v1/superadmin/agencies' && isSuperAdmin) {
    const { data, error: agenciesError } = await authenticated.client
      .from('real_estate_agencies')
      .select(
        'id, name, brand, website, address, phone, contact_email, logo_url, active, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(1_000);
    if (agenciesError !== null) return error('No se pudieron cargar las inmobiliarias.', 500);
    return json({ agencies: data ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/superadmin/agencies' && isSuperAdmin) {
    const body = await readBody(request);
    const name = stringField(body, 'name', 200);
    const brand = stringField(body, 'brand', 200);
    const website = optionalProfileField(body, 'website', 2_048);
    const address = optionalProfileField(body, 'address', 500);
    const phone = optionalProfileField(body, 'phone', 32);
    const contactEmail = optionalProfileField(body, 'contactEmail', 320);
    const logoDataUrl = optionalProfileField(body, 'logoDataUrl', 1_500_000);
    if (
      name === null ||
      brand === null ||
      website === null ||
      address === null ||
      phone === null ||
      contactEmail === null ||
      logoDataUrl === null ||
      (website !== '' && !validHttpUrl(website)) ||
      (contactEmail !== '' && !validEmail(contactEmail)) ||
      !validLogoDataUrl(logoDataUrl === '' ? null : logoDataUrl)
    ) {
      return error('Indica los datos válidos de la inmobiliaria.', 422);
    }
    const { data, error: agencyError } = await authenticated.client.rpc('create_agency', {
      p_name: name,
      p_brand: brand,
      p_website: website === '' ? null : website,
      p_address: address === '' ? null : address,
      p_logo_url: logoDataUrl === '' ? null : logoDataUrl,
      p_phone: phone === '' ? null : phone,
      p_contact_email: contactEmail === '' ? null : contactEmail,
    });
    if (agencyError !== null || data === null) {
      return error('No se pudo crear la inmobiliaria.', 422);
    }
    const result = data as { agency?: Record<string, unknown> };
    if (
      result.agency === undefined ||
      typeof result.agency.id !== 'string' ||
      typeof result.agency.name !== 'string' ||
      typeof result.agency.brand !== 'string'
    ) {
      return error('No se pudo crear la inmobiliaria.', 422);
    }
    return json({ agency: result.agency }, 201);
  }

  const superadminAgencyMatch = path.match(/^\/v1\/superadmin\/agencies\/([0-9a-f-]{36})$/i);
  if (request.method === 'PATCH' && superadminAgencyMatch !== null && isSuperAdmin) {
    const body = await readBody(request);
    const name = stringField(body, 'name', 200);
    const brand = stringField(body, 'brand', 200);
    const website = optionalProfileField(body, 'website', 2_048);
    const address = optionalProfileField(body, 'address', 500);
    const phone = optionalProfileField(body, 'phone', 32);
    const contactEmail = optionalProfileField(body, 'contactEmail', 320);
    const logoDataUrl = optionalProfileField(body, 'logoDataUrl', 1_500_000);
    const active = body?.active;
    if (
      name === null ||
      brand === null ||
      website === null ||
      address === null ||
      phone === null ||
      contactEmail === null ||
      logoDataUrl === null ||
      typeof active !== 'boolean' ||
      (website !== '' && !validHttpUrl(website)) ||
      (contactEmail !== '' && !validEmail(contactEmail)) ||
      !validLogoDataUrl(logoDataUrl === '' ? null : logoDataUrl)
    ) {
      return error('Indica los datos válidos de la inmobiliaria.', 422);
    }
    const { data, error: updateError } = await authenticated.client.rpc('update_agency_details', {
      p_agency_id: superadminAgencyMatch[1],
      p_name: name,
      p_brand: brand,
      p_active: active,
      p_website: website === '' ? null : website,
      p_address: address === '' ? null : address,
      p_logo_url: logoDataUrl === '' ? null : logoDataUrl,
      p_phone: phone === '' ? null : phone,
      p_contact_email: contactEmail === '' ? null : contactEmail,
    });
    const result = data as { agency?: Record<string, unknown> } | null;
    if (updateError !== null || result?.agency === undefined) {
      return error('No se pudo actualizar la inmobiliaria.', 422);
    }
    return json({ agency: result.agency });
  }

  if (request.method === 'DELETE' && superadminAgencyMatch !== null && isSuperAdmin) {
    const { error: deleteError } = await authenticated.client.rpc('delete_agency', {
      p_agency_id: superadminAgencyMatch[1],
    });
    if (deleteError !== null) return error('No se pudo eliminar la inmobiliaria.', 422);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const employeesMatch = path.match(/^\/v1\/superadmin\/agencies\/([0-9a-f-]{36})\/employees$/i);
  if (request.method === 'GET' && employeesMatch !== null && isSuperAdmin) {
    const { data, error: employeesError } = await authenticated.client.rpc(
      'list_agency_employees',
      {
        p_agency_id: employeesMatch[1],
      },
    );
    if (employeesError !== null) return error('No se pudieron cargar los empleados.', 422);
    return json({ employees: data ?? [] });
  }

  if (request.method === 'POST' && employeesMatch !== null && isSuperAdmin) {
    const body = await readBody(request);
    const email = stringField(body, 'email', 320);
    const password = stringField(body, 'password', 1_024);
    const role = body?.role;
    if (
      email === null ||
      !validEmail(email) ||
      password === null ||
      password.length < 8 ||
      (role !== 'agent' && role !== 'admin')
    ) {
      return error('Indica el correo, el rol y una contraseña de al menos 8 caracteres.', 422);
    }
    const admin = adminClient();
    if (admin === null) return error('No se puede crear la cuenta del empleado.', 503);
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError !== null || userData.user === null) {
      return error(userError?.message ?? 'No se pudo crear la cuenta del empleado.', 422);
    }
    const { data, error: assignmentError } = await authenticated.client.rpc(
      'assign_agency_employee',
      {
        p_agency_id: employeesMatch[1],
        p_user_id: userData.user.id,
        p_role: role,
      },
    );
    if (assignmentError !== null || data === null) {
      await admin.auth.admin.deleteUser(userData.user.id);
      return error('No se pudo asignar el empleado.', 422);
    }
    const employee = data as Record<string, unknown>;
    return json({ employee: { ...employee, email } }, 201);
  }

  const employeeMatch = path.match(
    /^\/v1\/superadmin\/agencies\/([0-9a-f-]{36})\/employees\/([0-9a-f-]{36})$/i,
  );
  if (request.method === 'PATCH' && employeeMatch !== null && isSuperAdmin) {
    const role = (await readBody(request))?.role;
    if (role !== 'agent' && role !== 'admin') return error('Indica un rol válido.', 422);
    const { error: roleError } = await authenticated.client.rpc('update_agency_employee_role', {
      p_agency_id: employeeMatch[1],
      p_user_id: employeeMatch[2],
      p_role: role,
    });
    if (roleError !== null) return error('No se pudo actualizar el rol del empleado.', 422);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'DELETE' && employeeMatch !== null && isSuperAdmin) {
    const { error: removeError } = await authenticated.client.rpc('remove_agency_employee', {
      p_agency_id: employeeMatch[1],
      p_user_id: employeeMatch[2],
    });
    if (removeError !== null) return error('No se pudo retirar el empleado.', 422);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const agent = await agentContext(authenticated.client, authenticated.user.id);
  if (path.startsWith('/v1/agent/') && agent === null) {
    return error('Tu cuenta no tiene acceso al panel de inmobiliaria.', 403);
  }

  if (request.method === 'GET' && path === '/v1/agent/me' && agent !== null) {
    return json({
      agency: { id: agent.agency.id, name: agent.agency.name, brand: agent.agency.brand },
      role: agent.role,
    });
  }

  if (request.method === 'GET' && path === '/v1/agent/properties' && agent !== null) {
    const { data, error: propertiesError } = await authenticated.client
      .from('agency_properties')
      .select(
        'id, title, price_cents, zone, address, latitude, longitude, area_m2, bedrooms, bathrooms, description, main_image_url, gallery_urls, listing_url, status, published_at, created_at, updated_at',
      )
      .eq('agency_id', agent.agencyId)
      .order('updated_at', { ascending: false })
      .limit(5_000);
    if (propertiesError !== null) return error('No se pudieron cargar las viviendas.', 500);
    return json({ properties: data ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/agent/properties' && agent !== null) {
    const payload = propertyPayload(await readBody(request));
    if (payload === null) {
      return error('Revisa los datos de la vivienda, las coordenadas y las URLs.', 422);
    }
    const { data, error: createError } = await authenticated.client
      .from('agency_properties')
      .insert({
        ...payload,
        agency_id: agent.agencyId,
        published_at: payload.status === 'published' ? new Date().toISOString() : null,
      })
      .select(
        'id, title, price_cents, zone, address, latitude, longitude, area_m2, bedrooms, bathrooms, description, main_image_url, gallery_urls, listing_url, status, published_at, created_at, updated_at',
      )
      .single();
    if (createError !== null) return error('No se pudo crear la vivienda.', 422);
    return json({ property: data }, 201);
  }

  const propertyMatch = path.match(/^\/v1\/agent\/properties\/([0-9a-f-]{36})$/i);
  if (request.method === 'PATCH' && propertyMatch !== null && agent !== null) {
    const payload = propertyPayload(await readBody(request));
    if (payload === null) {
      return error('Revisa los datos de la vivienda, las coordenadas y las URLs.', 422);
    }
    const { data: current, error: currentError } = await authenticated.client
      .from('agency_properties')
      .select('id, status')
      .eq('id', propertyMatch[1])
      .eq('agency_id', agent.agencyId)
      .maybeSingle();
    if (currentError !== null || current === null)
      return error('No se encontró esa vivienda.', 404);
    const publicationPatch =
      payload.status === 'published' && current.status === 'published'
        ? {}
        : { published_at: payload.status === 'published' ? new Date().toISOString() : null };
    const { data, error: updateError } = await authenticated.client
      .from('agency_properties')
      .update({
        ...payload,
        ...publicationPatch,
      })
      .eq('id', propertyMatch[1])
      .eq('agency_id', agent.agencyId)
      .select(
        'id, title, price_cents, zone, address, latitude, longitude, area_m2, bedrooms, bathrooms, description, main_image_url, gallery_urls, listing_url, status, published_at, created_at, updated_at',
      )
      .single();
    if (updateError !== null) return error('No se pudo actualizar la vivienda.', 422);
    return json({ property: data });
  }

  if (request.method === 'GET' && path === '/v1/agent/invitation-codes' && agent !== null) {
    const { data, error: codesError } = await authenticated.client
      .from('agency_invitation_codes')
      .select('id, code, expires_at, max_uses, uses_count, status, created_at, revoked_at')
      .eq('agency_id', agent.agencyId)
      .order('created_at', { ascending: false })
      .limit(10_000);
    if (codesError !== null) return error('No se pudieron cargar los códigos.', 500);
    const now = Date.now();
    const codes = (data ?? []).map((code) => {
      if (
        code.status !== 'active' ||
        code.expires_at === null ||
        new Date(code.expires_at).valueOf() > now
      ) {
        return code;
      }
      return { ...code, status: 'expired' };
    });
    return json({ codes });
  }

  if (request.method === 'POST' && path === '/v1/agent/invitation-codes' && agent !== null) {
    const body = await readBody(request);
    const maxUses = body?.maxUses === undefined ? 1 : positiveIntegerField(body, 'maxUses');
    if (maxUses === null) return error('El límite de usos debe ser un entero positivo.', 422);
    if (maxUses > 10000) return error('El límite de usos no puede superar 10.000.', 422);
    const expiresAtText = optionalStringField(body, 'expiresAt');
    if (expiresAtText === undefined) return error('La fecha de caducidad no es válida.', 422);
    const expiresAt =
      expiresAtText === null || expiresAtText === '' ? null : new Date(expiresAtText);
    if (
      expiresAt instanceof Date &&
      (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date())
    ) {
      return error('La fecha de caducidad debe ser futura.', 422);
    }
    const { data, error: generateError } = await authenticated.client.rpc(
      'generate_agency_invitation_code',
      {
        p_expires_at: expiresAt === null ? null : expiresAt.toISOString(),
        p_max_uses: maxUses,
      },
    );
    if (generateError !== null || data === null) {
      return error('No se pudo generar el código.', 422);
    }
    const code = invitationCodeView(data);
    if (code === null) return error('No se pudo generar el código.', 500);
    return json({ code }, 201);
  }

  const codeMatch = path.match(/^\/v1\/agent\/invitation-codes\/([0-9a-f-]{36})\/revoke$/i);
  if (request.method === 'POST' && codeMatch !== null && agent !== null) {
    const { data, error: revokeError } = await authenticated.client.rpc(
      'revoke_agency_invitation_code',
      { p_code_id: codeMatch[1] },
    );
    if (revokeError !== null || data === null) {
      return error(
        revokeError?.code === 'P0001' ? revokeError.message : 'No se pudo revocar el código.',
        422,
      );
    }
    const code = invitationCodeView(data);
    if (code === null) return error('No se pudo revocar el código.', 500);
    return json({ code });
  }

  return error('Ruta no encontrada.', 404);
}

export async function handleRequest(request: Request): Promise<Response> {
  try {
    return await routeRequest(request);
  } catch (cause) {
    if (cause instanceof RequestInputError) return error(cause.message, cause.status);
    return error('No se pudo completar la solicitud.', 500);
  }
}

Deno.serve(handleRequest);
