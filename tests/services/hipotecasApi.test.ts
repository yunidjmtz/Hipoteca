import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AGENCY_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function cargarApi() {
  vi.stubEnv(
    'VITE_HIPOTECAS_API_URL',
    'https://project.supabase.co/functions/v1/hipotecas-api/',
  );
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.resetModules();
  return import('@/services/hipotecasApi');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('hipotecasApi', () => {
  it('envía la clave pública y valida la respuesta completa', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({ agency: { id: AGENCY_ID, name: 'Inmobiliaria Sol', brand: 'Sol' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    const api = await cargarApi();

    await expect(api.previsualizarCodigoInmobiliariaApi('CASA-ABCD')).resolves.toEqual({
      agency: { id: AGENCY_ID, name: 'Inmobiliaria Sol', brand: 'Sol' },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://project.supabase.co/functions/v1/hipotecas-api/v1/agency-links/preview',
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('apikey')).toBe(
      'sb_publishable_test',
    );
  });

  it('rechaza respuestas 2xx incompletas en vez de inventar campos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        json({ agency: { id: AGENCY_ID, name: 'Sin marca' } }),
      ),
    );
    const api = await cargarApi();

    await expect(api.previsualizarCodigoInmobiliariaApi('CASA-ABCD')).rejects.toMatchObject({
      name: 'ErrorHipotecasApi',
      status: 200,
      message: 'La API de Hipotecas devolvió una respuesta incompleta.',
    });
  });

  it('crea una sesión anónima antes de canjear y conserva ambos tokens', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          user: { id: USER_ID, email: null },
          session: { access_token: 'access-anonimo', refresh_token: 'refresh-anonimo' },
        }),
      )
      .mockResolvedValueOnce(
        json({ agency: { id: AGENCY_ID, name: 'Inmobiliaria Sol', brand: 'Sol' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    const api = await cargarApi();

    await api.canjearCodigoInmobiliariaApi('CASA-ABCD');

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://project.supabase.co/functions/v1/hipotecas-api/v1/auth/anonymous',
      'https://project.supabase.co/functions/v1/hipotecas-api/v1/agency-links/redeem',
    ]);
    expect(localStorage.getItem('hipotecas-api-access-token')).toBe('access-anonimo');
    expect(localStorage.getItem('hipotecas-api-refresh-token')).toBe('refresh-anonimo');
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-anonimo',
    });
  });

  it('renueva una sesión caducada una sola vez y repite la solicitud protegida', async () => {
    localStorage.setItem('hipotecas-api-access-token', 'access-caducado');
    localStorage.setItem('hipotecas-api-refresh-token', 'refresh-vigente');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: 'Sesión caducada.' }, 401))
      .mockResolvedValueOnce(
        json({
          user: { id: USER_ID, email: null },
          session: { access_token: 'access-nuevo', refresh_token: 'refresh-nuevo' },
        }),
      )
      .mockResolvedValueOnce(json({ agency: null, properties: [] }));
    vi.stubGlobal('fetch', fetcher);
    const api = await cargarApi();

    await expect(api.catalogoApi()).resolves.toEqual({ agency: null, properties: [] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-nuevo',
    });
  });

  it('acepta un 204 únicamente en operaciones sin respuesta', async () => {
    localStorage.setItem('hipotecas-api-access-token', 'access-vigente');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
    const api = await cargarApi();

    await expect(api.anadirFavoritoCatalogoApi(PROPERTY_ID)).resolves.toBeUndefined();
  });

  it('conserva el estado HTTP y rechaza cuerpos no JSON o excesivos', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<html>Error</html>', { status: 503 }))
      .mockResolvedValueOnce(
        json(
          { agency: { id: AGENCY_ID, name: 'Inmobiliaria Sol', brand: 'Sol' } },
          200,
          { 'Content-Length': String(9 * 1_024 * 1_024) },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const api = await cargarApi();

    await expect(api.previsualizarCodigoInmobiliariaApi('CASA-ABCD')).rejects.toMatchObject({
      status: 503,
    });
    await expect(api.previsualizarCodigoInmobiliariaApi('CASA-ABCD')).rejects.toMatchObject({
      status: 200,
      message: 'La API de Hipotecas devolvió una respuesta no válida.',
    });
  });
});
