import { z } from 'zod';

const zDatosAnuncioImportado = z.object({
  fuente: z.literal('idealista'),
  url: z.string().url(),
  titulo: z.string().min(1),
  direccion: z.string().min(1),
  precioEuros: z.number().finite().positive(),
  superficieM2: z.number().int().positive(),
  habitaciones: z.number().int().min(0),
  esExterior: z.boolean(),
  tieneTrastero: z.boolean(),
  tieneGaraje: z.boolean(),
});

const zErrorImportacion = z.object({ error: z.string().min(1) });

export type DatosAnuncioImportado = z.infer<typeof zDatosAnuncioImportado>;

const ENDPOINT_IMPORTACION = '/.netlify/functions/importar-anuncio';

export function esUrlIdealistaValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    const host = url.hostname.toLowerCase();
    const esIdealista = host === 'idealista.com' || host === 'www.idealista.com';
    return url.protocol === 'https:' && esIdealista && /^\/inmueble\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export async function importarAnuncioIdealista(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<DatosAnuncioImportado> {
  const enlace = url.trim();
  if (!esUrlIdealistaValida(enlace)) {
    throw new Error('Pega un enlace de anuncio de Idealista válido.');
  }

  let respuesta: Response;
  try {
    respuesta = await fetcher(ENDPOINT_IMPORTACION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: enlace }),
    });
  } catch {
    throw new Error('No se pudo conectar con el servicio de importación.');
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
    contenido = await respuesta.json();
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
  return datos.data;
}
