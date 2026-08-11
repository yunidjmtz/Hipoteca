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
    'Access-Control-Allow-Methods': 'DELETE, GET, PATCH, POST, OPTIONS',
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

function optionalStringField(body: JsonObject | null, field: string): string | null {
  const value = body?.[field];
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value.trim() : null;
}

function positiveIntegerField(body: JsonObject | null, field: string, minimum = 1): number | null {
  const value = body?.[field];
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : null;
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
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
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
  const title = stringField(body, 'title');
  const priceCents = positiveIntegerField(body, 'priceCents');
  const zone = stringField(body, 'zone');
  const address = optionalStringField(body, 'address');
  const latitude = optionalCoordinateField(body, 'latitude');
  const longitude = optionalCoordinateField(body, 'longitude');
  const areaM2 = positiveIntegerField(body, 'areaM2');
  const bedrooms = positiveIntegerField(body, 'bedrooms', 0);
  const bathrooms = positiveIntegerField(body, 'bathrooms', 0);
  const description = stringField(body, 'description');
  const mainImageUrl = stringField(body, 'mainImageUrl');
  const listingUrl = stringField(body, 'listingUrl');
  const status = body?.status;
  const galleryUrls = body?.galleryUrls;
  if (
    title === null ||
    priceCents === null ||
    zone === null ||
    latitude === undefined ||
    longitude === undefined ||
    areaM2 === null ||
    bedrooms === null ||
    bathrooms === null ||
    description === null ||
    mainImageUrl === null ||
    listingUrl === null ||
    !validHttpUrl(mainImageUrl) ||
    !validHttpUrl(listingUrl) ||
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

async function agencyFromInvitationCode(code: string) {
  const admin = adminClient();
  if (admin === null) return { agency: null, unavailable: true };
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
  return json({ user: { id: user.id, email: user.email ?? null }, session });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders() });

  // El runtime puede entregar la URL pública completa o una ruta ya prefijada
  // con el nombre de la función, según el entorno de ejecución.
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/(?:functions\/v1\/)?hipotecas-api/, '');

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

  if (request.method === 'POST' && path === '/v1/agency-links/preview') {
    const code = stringField(await readBody(request), 'code');
    if (code === null) return error('Indica el código de invitación.');
    const result = await agencyFromInvitationCode(code);
    if (result.unavailable) return error('No se puede comprobar el código en este momento.', 503);
    if (result.agency === null) return error('El código no es válido o ya no está activo.', 422);
    return json({ agency: result.agency });
  }

  if (request.method === 'GET' && path === '/v1/catalog/properties') {
    const code = url.searchParams.get('code');
    if (code !== null) {
      const result = await agencyFromInvitationCode(code);
      const admin = adminClient();
      if (result.unavailable || admin === null) {
        return error('No se puede cargar el catálogo en este momento.', 503);
      }
      if (result.agency === null) return error('El código no es válido o ya no está activo.', 422);
      const { data: properties, error: propertiesError } = await admin
        .from('agency_properties')
        .select(
          'id, title, price_cents, zone, area_m2, bedrooms, bathrooms, description, main_image_url, listing_url, status',
        )
        .eq('agency_id', result.agency.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      if (propertiesError !== null) return error('No se pudo cargar el catálogo.', 500);
      return json({ agency: result.agency, properties: properties ?? [] });
    }
  }

  const authenticated = await authenticatedClient(request);
  if (authenticated === null) return error('Debes iniciar sesión para realizar esta acción.', 401);

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
      .select('id, name, brand, active, created_at')
      .order('created_at', { ascending: false });
    if (agenciesError !== null) return error('No se pudieron cargar las inmobiliarias.', 500);
    return json({ agencies: data ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/superadmin/agencies' && isSuperAdmin) {
    const body = await readBody(request);
    const name = stringField(body, 'name');
    const brand = stringField(body, 'brand');
    const agentEmail = stringField(body, 'agentEmail');
    const agentPassword = stringField(body, 'agentPassword');
    if (
      name === null ||
      brand === null ||
      agentEmail === null ||
      !agentEmail.includes('@') ||
      agentPassword === null ||
      agentPassword.length < 8
    ) {
      return error(
        'Indica los datos de la inmobiliaria y una contraseña de al menos 8 caracteres.',
        422,
      );
    }
    const admin = adminClient();
    if (admin === null)
      return error('No se puede crear la cuenta del agente en este momento.', 503);
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email: agentEmail,
      password: agentPassword,
      email_confirm: true,
    });
    if (userError !== null || userData.user === null) {
      return error(userError?.message ?? 'No se pudo crear la cuenta del agente.', 422);
    }
    const { data, error: agencyError } = await authenticated.client.rpc(
      'create_agency_and_assign_agent',
      {
        p_name: name,
        p_brand: brand,
        p_agent_user_id: userData.user.id,
      },
    );
    if (agencyError !== null || data === null) {
      await admin.auth.admin.deleteUser(userData.user.id);
      return error(agencyError?.message ?? 'No se pudo crear la inmobiliaria.', 422);
    }
    const result = data as {
      agency?: { id?: string; name?: string; brand?: string };
    };
    if (
      result.agency?.id === undefined ||
      result.agency.name === undefined ||
      result.agency.brand === undefined
    ) {
      await admin.auth.admin.deleteUser(userData.user.id);
      return error('No se pudo crear la inmobiliaria.', 422);
    }
    return json(
      {
        agency: {
          id: result.agency.id,
          name: result.agency.name,
          brand: result.agency.brand,
          active: true,
          created_at: new Date().toISOString(),
        },
      },
      201,
    );
  }

  const superadminAgencyMatch = path.match(/^\/v1\/superadmin\/agencies\/([0-9a-f-]{36})$/i);
  if (request.method === 'PATCH' && superadminAgencyMatch !== null && isSuperAdmin) {
    const body = await readBody(request);
    const name = stringField(body, 'name');
    const brand = stringField(body, 'brand');
    const active = body?.active;
    if (name === null || brand === null || typeof active !== 'boolean') {
      return error('Indica el nombre, la marca y el estado de la inmobiliaria.', 422);
    }
    const { data, error: updateError } = await authenticated.client.rpc('update_agency_details', {
      p_agency_id: superadminAgencyMatch[1],
      p_name: name,
      p_brand: brand,
      p_active: active,
    });
    const result = data as { agency?: Record<string, unknown> } | null;
    if (updateError !== null || result?.agency === undefined) {
      return error(updateError?.message ?? 'No se pudo actualizar la inmobiliaria.', 422);
    }
    return json({ agency: result.agency });
  }

  if (request.method === 'DELETE' && superadminAgencyMatch !== null && isSuperAdmin) {
    const { error: deleteError } = await authenticated.client.rpc('delete_agency', {
      p_agency_id: superadminAgencyMatch[1],
    });
    if (deleteError !== null) return error(deleteError.message, 422);
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
    const email = stringField(body, 'email');
    const password = stringField(body, 'password');
    const role = body?.role;
    if (
      email === null ||
      !email.includes('@') ||
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
      return error(assignmentError?.message ?? 'No se pudo asignar el empleado.', 422);
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
    if (roleError !== null) return error(roleError.message, 422);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'DELETE' && employeeMatch !== null && isSuperAdmin) {
    const { error: removeError } = await authenticated.client.rpc('remove_agency_employee', {
      p_agency_id: employeeMatch[1],
      p_user_id: employeeMatch[2],
    });
    if (removeError !== null) return error(removeError.message, 422);
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
      .order('updated_at', { ascending: false });
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
    if (createError !== null) return error(createError.message, 422);
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
    const { data, error: updateError } = await authenticated.client
      .from('agency_properties')
      .update({
        ...payload,
        published_at:
          payload.status === 'published'
            ? current.status === 'published'
              ? undefined
              : new Date().toISOString()
            : null,
      })
      .eq('id', propertyMatch[1])
      .eq('agency_id', agent.agencyId)
      .select(
        'id, title, price_cents, zone, address, latitude, longitude, area_m2, bedrooms, bathrooms, description, main_image_url, gallery_urls, listing_url, status, published_at, created_at, updated_at',
      )
      .single();
    if (updateError !== null) return error(updateError.message, 422);
    return json({ property: data });
  }

  if (request.method === 'GET' && path === '/v1/agent/invitation-codes' && agent !== null) {
    const { data, error: codesError } = await authenticated.client
      .from('agency_invitation_codes')
      .select('id, code, expires_at, max_uses, uses_count, status, created_at, revoked_at')
      .eq('agency_id', agent.agencyId)
      .order('created_at', { ascending: false });
    if (codesError !== null) return error('No se pudieron cargar los códigos.', 500);
    return json({ codes: data ?? [] });
  }

  if (request.method === 'POST' && path === '/v1/agent/invitation-codes' && agent !== null) {
    const body = await readBody(request);
    const maxUses = positiveIntegerField(body, 'maxUses') ?? 1;
    if (maxUses > 10000) return error('El límite de usos no puede superar 10.000.', 422);
    const expiresAtText = optionalStringField(body, 'expiresAt');
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
      return error(generateError?.message ?? 'No se pudo generar el código.', 422);
    }
    return json({ code: data }, 201);
  }

  const codeMatch = path.match(/^\/v1\/agent\/invitation-codes\/([0-9a-f-]{36})\/revoke$/i);
  if (request.method === 'POST' && codeMatch !== null && agent !== null) {
    const { data, error: revokeError } = await authenticated.client.rpc(
      'revoke_agency_invitation_code',
      { p_code_id: codeMatch[1] },
    );
    if (revokeError !== null || data === null) {
      return error(revokeError?.message ?? 'No se pudo revocar el código.', 422);
    }
    return json({ code: data });
  }

  return error('Ruta no encontrada.', 404);
});
