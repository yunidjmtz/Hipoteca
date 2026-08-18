import { z } from 'zod';

import type { DatosAnuncioNormalizados } from '@/services/propertyListingParser';

const LONGITUD_MAXIMA_URL = 2_048;
const TAMANO_MAXIMO_RESPUESTA = 64 * 1_024;
const TIEMPO_MAXIMO_IMPORTACION_MS = 60_000;

const zTextoImportado = z.string().trim().min(1).max(500);

const zDatosAnuncioImportado = z
  .object({
    fuente: z.literal('idealista'),
    url: z.string().max(LONGITUD_MAXIMA_URL),
    titulo: zTextoImportado.max(300),
    direccion: zTextoImportado,
    precioEuros: z.number().finite().positive().max(1_000_000_000),
    superficieM2: z.number().int().positive().max(10_000),
    habitaciones: z.number().int().min(0).max(100),
    esExterior: z.boolean().optional(),
    tieneTrastero: z.boolean().optional(),
    tieneGaraje: z.boolean().optional(),
  })
  .strict();

const zErrorImportacion = z.object({ error: z.string().trim().min(1).max(500) });

export type DatosAnuncioImportado = z.infer<typeof zDatosAnuncioImportado>;

const ENDPOINT_IMPORTACION = '/.netlify/functions/importar-anuncio';

export function normalizarUrlIdealista(valor: string): string | null {
  const entrada = valor.trim();
  if (entrada === '' || entrada.length > LONGITUD_MAXIMA_URL) return null;
  try {
    const url = new URL(entrada);
    const host = url.hostname.toLowerCase();
    const esIdealista = host === 'idealista.com' || host === 'www.idealista.com';
    if (
      url.protocol !== 'https:' ||
      !esIdealista ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      !/^\/inmueble\/\d+\/?$/.test(url.pathname)
    ) {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function esUrlIdealistaValida(valor: string): boolean {
  return normalizarUrlIdealista(valor) !== null;
}

async function leerJsonLimitado(respuesta: Response): Promise<unknown> {
  const longitud = respuesta.headers.get('Content-Length');
  if (longitud !== null && Number(longitud) > TAMANO_MAXIMO_RESPUESTA) {
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

export function normalizarAnuncioImportado(datos: DatosAnuncioImportado): DatosAnuncioNormalizados {
  return {
    sourcePortal: 'idealista',
    title: datos.titulo,
    address: datos.direccion,
    price: datos.precioEuros,
    builtArea: datos.superficieM2,
    rooms: datos.habitaciones,
    ...(datos.esExterior === undefined ? {} : { exterior: datos.esExterior }),
    ...(datos.tieneTrastero === undefined ? {} : { storageRoom: datos.tieneTrastero }),
    ...(datos.tieneGaraje === undefined ? {} : { garage: datos.tieneGaraje }),
  };
}

export async function importarAnuncioIdealista(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<DatosAnuncioImportado> {
  const enlace = normalizarUrlIdealista(url);
  if (enlace === null) {
    throw new Error('Pega un enlace de anuncio de Idealista válido.');
  }

  let respuesta: Response;
  try {
    respuesta = await fetcher(ENDPOINT_IMPORTACION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: enlace }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_IMPORTACION_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('El servicio de importación tardó demasiado en responder.', { cause: error });
    }
    throw new Error('No se pudo conectar con el servicio de importación.', { cause: error });
  }

  const contentType = respuesta.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    if (respuesta.status === 404) {
      throw new Error(
        'El importador no está activo en este servidor. En local, inicia la app con npm run dev:netlify.',
      );
    }
    throw new Error('El servicio de importación devolvió una respuesta no válida.');
  }

  let contenido: unknown;
  try {
    contenido = await leerJsonLimitado(respuesta);
  } catch {
    throw new Error('El servicio de importación devolvió una respuesta no válida.');
  }

  if (!respuesta.ok) {
    const error = zErrorImportacion.safeParse(contenido);
    throw new Error(
      error.success ? error.data.error : 'No se pudo importar el anuncio de Idealista.',
    );
  }

  const datos = zDatosAnuncioImportado.safeParse(contenido);
  if (!datos.success) {
    throw new Error('El anuncio no contiene todos los datos necesarios.');
  }
  if (datos.data.url !== enlace) {
    throw new Error('El servicio de importación devolvió datos de otro anuncio.');
  }
  return datos.data;
}
