import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error La función JavaScript la carga Netlify sin declaración TypeScript.
import importarAnuncioSinTipos from '../../netlify/functions/importar-anuncio.mjs';

const importarAnuncio = importarAnuncioSinTipos as (
  request: Request,
  apiKeyConfigurada?: string,
) => Promise<Response>;

const URL_ANUNCIO = 'https://www.idealista.com/inmueble/111994685/';

function peticion(body: unknown, headers: HeadersInit = {}): Request {
  return new Request('http://localhost/.netlify/functions/importar-anuncio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function respuestaFirecrawl(json: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        json,
        metadata: { sourceURL: URL_ANUNCIO, statusCode: 200 },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('función Netlify importar-anuncio', () => {
  it('rechaza métodos, tipos de contenido, cuerpos y URLs fuera del contrato', async () => {
    const metodo = await importarAnuncio(
      new Request('http://localhost', { method: 'GET' }),
      'fc-x',
    );
    expect(metodo.status).toBe(405);
    expect(metodo.headers.get('Allow')).toBe('POST');

    const tipo = await importarAnuncio(
      new Request('http://localhost', { method: 'POST', body: '{}' }),
      'fc-x',
    );
    expect(tipo.status).toBe(415);

    const urlConCredenciales = await importarAnuncio(
      peticion({ url: 'https://usuario@idealista.com/inmueble/123/' }),
      'fc-x',
    );
    expect(urlConCredenciales.status).toBe(400);

    const grande = await importarAnuncio(
      peticion({ url: URL_ANUNCIO }, { 'Content-Length': '5000' }),
      'fc-x',
    );
    expect(grande.status).toBe(413);
  });

  it('envía un esquema sin campos obligatorios y no inventa booleanos ausentes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      respuestaFirecrawl({
        titulo: 'Piso en venta',
        direccion: 'Zaragoza',
        precioEuros: 215_000,
        superficieM2: 105,
        habitaciones: 3,
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const respuesta = await importarAnuncio(
      peticion({ url: `${URL_ANUNCIO}?utm_source=x` }),
      'fc-x',
    );

    expect(respuesta.status).toBe(200);
    await expect(respuesta.json()).resolves.toEqual({
      fuente: 'idealista',
      url: URL_ANUNCIO,
      titulo: 'Piso en venta',
      direccion: 'Zaragoza',
      precioEuros: 215_000,
      superficieM2: 105,
      habitaciones: 3,
    });
    const opciones = fetcher.mock.calls[0]?.[1];
    if (typeof opciones?.body !== 'string') throw new TypeError('Falta el cuerpo enviado a Firecrawl.');
    const cuerpo = JSON.parse(opciones.body) as {
      formats: Array<{ schema: { required?: string[] }; prompt: string }>;
      maxAge: number;
      storeInCache: boolean;
    };
    expect(cuerpo.formats[0]?.schema.required).toBeUndefined();
    expect(cuerpo.formats[0]?.prompt).toContain('No deduzcas');
    expect(cuerpo.maxAge).toBe(0);
    expect(cuerpo.storeInCache).toBe(false);
  });

  it('conserva falsos explícitos y rechaza respuestas incompletas o de otra procedencia', async () => {
    const datos = {
      titulo: 'Piso interior',
      direccion: 'Zaragoza',
      precioEuros: 215_000,
      superficieM2: 105,
      habitaciones: 3,
      esExterior: false,
      tieneGaraje: false,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respuestaFirecrawl(datos))
      .mockResolvedValueOnce(respuestaFirecrawl({ ...datos, superficieM2: 20_000 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              json: datos,
              metadata: {
                sourceURL: 'https://www.idealista.com/inmueble/999/',
                statusCode: 200,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetcher);

    const explicitos = await importarAnuncio(peticion({ url: URL_ANUNCIO }), 'fc-x');
    expect(await explicitos.json()).toMatchObject({ esExterior: false, tieneGaraje: false });

    const fueraDeLimite = await importarAnuncio(peticion({ url: URL_ANUNCIO }), 'fc-x');
    expect(fueraDeLimite.status).toBe(422);

    const otraProcedencia = await importarAnuncio(peticion({ url: URL_ANUNCIO }), 'fc-x');
    expect(otraProcedencia.status).toBe(502);
    await expect(otraProcedencia.json()).resolves.toEqual({
      error: 'No se pudo verificar la procedencia del anuncio importado.',
    });
  });

  it('conserva el límite temporal del proveedor y no intenta interpretar su cuerpo de error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('<html>límite</html>', {
          status: 429,
          headers: { 'Content-Type': 'text/html', 'Retry-After': '30' },
        }),
      ),
    );

    const respuesta = await importarAnuncio(peticion({ url: URL_ANUNCIO }), 'fc-x');

    expect(respuesta.status).toBe(429);
    expect(respuesta.headers.get('Retry-After')).toBe('30');
  });
});
