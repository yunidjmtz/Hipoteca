import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonObject = Record<string, unknown>;

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno de la función.');
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'DELETE, GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readBody(request: Request): Promise<JsonObject | null> {
  try {
    const value: unknown = await request.json();
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function stringField(body: JsonObject | null, field: string): string | null {
  const value = body?.[field];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function apiClient(accessToken?: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global:
      accessToken === undefined
        ? undefined
        : { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient() {
  if (supabaseServiceRoleKey === undefined) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function sessionResponse(user: { id: string; email?: string | null }, session: unknown) {
  return json({ user: { id: user.id, email: user.email ?? null }, session });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders() });

  // El runtime puede entregar la URL pública completa o una ruta ya prefijada
  // con el nombre de la función, según el entorno de ejecución.
  const path = new URL(request.url).pathname.replace(/^\/(?:functions\/v1\/)?hipotecas-api/, '');

  if (request.method === 'POST' && path === '/v1/auth/sign-up') {
    const body = await readBody(request);
    const email = stringField(body, 'email');
    const password = stringField(body, 'password');
    if (email === null || password === null || password.length < 8) {
      return error('Indica un correo válido y una contraseña de al menos 8 caracteres.');
    }
    const { data, error: signUpError } = await apiClient().auth.signUp({ email, password });
    if (signUpError !== null || data.user === null) {
      return error(signUpError?.message ?? 'No se pudo crear la cuenta.', 422);
    }
    return sessionResponse(data.user, data.session);
  }

  if (request.method === 'POST' && path === '/v1/auth/sign-in') {
    const body = await readBody(request);
    const email = stringField(body, 'email');
    const password = stringField(body, 'password');
    if (email === null || password === null) return error('Indica tu correo y contraseña.');
    const { data, error: signInError } = await apiClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInError !== null || data.user === null) {
      return error(signInError?.message ?? 'No se pudo iniciar sesión.', 401);
    }
    return sessionResponse(data.user, data.session);
  }

  const authenticated = await authenticatedClient(request);
  if (authenticated === null) return error('Debes iniciar sesión para realizar esta acción.', 401);

  if (request.method === 'POST' && path === '/v1/agency-links/preview') {
    const code = stringField(await readBody(request), 'code');
    const admin = adminClient();
    if (code === null) return error('Indica el código de invitación.');
    if (admin === null) return error('No se puede comprobar el código en este momento.', 503);
    const { data: invitation, error: invitationError } = await admin
      .from('agency_invitation_codes')
      .select(
        'status, expires_at, max_uses, uses_count, agency:real_estate_agencies(id, name, brand, active)',
      )
      .eq('code', code.toUpperCase())
      .maybeSingle();
    const agency = invitation?.agency as
      { id: string; name: string; brand: string; active: boolean } | null | undefined;
    if (
      invitationError !== null ||
      invitation === null ||
      invitation.status !== 'active' ||
      invitation.uses_count >= invitation.max_uses ||
      (invitation.expires_at !== null && new Date(invitation.expires_at) <= new Date()) ||
      agency === null ||
      agency === undefined ||
      !agency.active
    ) {
      return error('El código no es válido o ya no está activo.', 422);
    }
    return json({ agency: { id: agency.id, name: agency.name, brand: agency.brand } });
  }

  if (request.method === 'POST' && path === '/v1/agency-links/redeem') {
    const code = stringField(await readBody(request), 'code');
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
      return error(redeemError?.message ?? 'No se pudo canjear el código.', 422);
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

    const agency = link.agency as { id: string; name: string; brand: string };
    const { data: properties, error: propertiesError } = await authenticated.client
      .from('agency_properties')
      .select(
        'id, title, price_cents, zone, area_m2, bedrooms, bathrooms, description, main_image_url, listing_url, status',
      )
      .eq('agency_id', agency.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    if (propertiesError !== null) return error('No se pudo cargar el catálogo.', 500);
    return json({ agency, properties: properties ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/favorites') {
    const agencyPropertyId = stringField(await readBody(request), 'agencyPropertyId');
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
          : favoriteError.message,
        favoriteError.code === '23505' ? 409 : 422,
      );
    }
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  return error('Ruta no encontrada.', 404);
});
