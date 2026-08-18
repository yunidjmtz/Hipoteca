const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';
const LONGITUD_MAXIMA_URL = 2_048;
const TAMANO_MAXIMO_PETICION = 4 * 1_024;
const TAMANO_MAXIMO_RESPUESTA_PROVEEDOR = 256 * 1_024;
const PRECIO_MAXIMO_EUROS = 1_000_000_000;
const SUPERFICIE_MAXIMA_M2 = 10_000;
const HABITACIONES_MAXIMAS = 100;

const ESQUEMA_VIVIENDA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titulo: {
      type: 'string',
      maxLength: 300,
      description: 'Título literal del anuncio.',
    },
    direccion: {
      type: 'string',
      maxLength: 500,
      description: 'Dirección o zona publicada en el anuncio, incluida la ciudad.',
    },
    precioEuros: {
      type: 'number',
      exclusiveMinimum: 0,
      maximum: PRECIO_MAXIMO_EUROS,
      description: 'Precio de venta en euros, sin símbolo ni separadores.',
    },
    superficieM2: {
      type: 'integer',
      minimum: 1,
      maximum: SUPERFICIE_MAXIMA_M2,
      description: 'Superficie construida en metros cuadrados.',
    },
    habitaciones: {
      type: 'integer',
      minimum: 0,
      maximum: HABITACIONES_MAXIMAS,
      description: 'Número de habitaciones o dormitorios.',
    },
    esExterior: {
      type: 'boolean',
      description: 'Indica si la vivienda se anuncia como exterior.',
    },
    tieneTrastero: {
      type: 'boolean',
      description: 'Indica si el anuncio incluye trastero.',
    },
    tieneGaraje: {
      type: 'boolean',
      description: 'Indica si el anuncio incluye garaje o plaza de garaje.',
    },
  },
};

function json(contenido, status = 200, headers = {}) {
  return new Response(JSON.stringify(contenido), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function urlIdealista(valor) {
  if (typeof valor !== 'string') return null;
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

function objeto(valor) {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : null;
}

async function leerJsonLimitado(respuesta, limiteBytes) {
  const longitud = respuesta.headers.get('Content-Length');
  const longitudDeclarada = longitud === null ? NaN : Number(longitud);
  if (Number.isFinite(longitudDeclarada) && longitudDeclarada > limiteBytes) {
    throw new Error('cuerpo-demasiado-grande');
  }
  if (respuesta.body === null) throw new Error('cuerpo-vacio');

  const lector = respuesta.body.getReader();
  const partes = [];
  let tamano = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    tamano += value.byteLength;
    if (tamano > limiteBytes) {
      await lector.cancel();
      throw new Error('cuerpo-demasiado-grande');
    }
    partes.push(value);
  }

  const bytes = new Uint8Array(tamano);
  let posicion = 0;
  for (const parte of partes) {
    bytes.set(parte, posicion);
    posicion += parte.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor !== 'string') return NaN;
  const limpio = valor
    .replace(/\s/g, '')
    .replace(/[€m²]/gi, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  return Number(limpio);
}

function booleano(valor) {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor !== 'string') return undefined;
  const normalizado = valor.trim().toLowerCase();
  if (normalizado === 'true') return true;
  if (normalizado === 'false') return false;
  return undefined;
}

function normalizarDatos(valor, url) {
  const datos = objeto(valor);
  if (datos === null) return null;

  const titulo = texto(datos.titulo);
  const direccion = texto(datos.direccion);
  const precioEuros = numero(datos.precioEuros);
  const superficieM2 = numero(datos.superficieM2);
  const habitaciones = numero(datos.habitaciones);

  if (
    titulo === '' ||
    titulo.length > 300 ||
    direccion === '' ||
    direccion.length > 500 ||
    !Number.isFinite(precioEuros) ||
    precioEuros <= 0 ||
    precioEuros > PRECIO_MAXIMO_EUROS ||
    !Number.isInteger(superficieM2) ||
    superficieM2 <= 0 ||
    superficieM2 > SUPERFICIE_MAXIMA_M2 ||
    !Number.isInteger(habitaciones) ||
    habitaciones < 0 ||
    habitaciones > HABITACIONES_MAXIMAS
  ) {
    return null;
  }

  const esExterior = booleano(datos.esExterior);
  const tieneTrastero = booleano(datos.tieneTrastero);
  const tieneGaraje = booleano(datos.tieneGaraje);

  return {
    fuente: 'idealista',
    url,
    titulo,
    direccion,
    precioEuros,
    superficieM2,
    habitaciones,
    ...(esExterior === undefined ? {} : { esExterior }),
    ...(tieneTrastero === undefined ? {} : { tieneTrastero }),
    ...(tieneGaraje === undefined ? {} : { tieneGaraje }),
  };
}

export default async function importarAnuncio(
  request,
  apiKeyConfigurada = process.env.FIRECRAWL_API_KEY,
) {
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405, { Allow: 'POST' });
  }

  const contentTypePeticion = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentTypePeticion.includes('application/json')) {
    return json({ error: 'La petición debe usar contenido JSON.' }, 415);
  }

  let entrada;
  try {
    entrada = await leerJsonLimitado(request, TAMANO_MAXIMO_PETICION);
  } catch (errorLectura) {
    if (errorLectura instanceof Error && errorLectura.message === 'cuerpo-demasiado-grande') {
      return json({ error: 'La petición supera el tamaño permitido.' }, 413);
    }
    return json({ error: 'La petición no contiene JSON válido.' }, 400);
  }

  const url = urlIdealista(objeto(entrada)?.url);
  if (url === null) {
    return json({ error: 'Pega un enlace de anuncio de Idealista válido.' }, 400);
  }

  const apiKey = typeof apiKeyConfigurada === 'string' ? apiKeyConfigurada.trim() : '';
  if (!apiKey) {
    return json(
      {
        error:
          'El importador no está configurado. Falta FIRECRAWL_API_KEY en las variables del servidor.',
      },
      503,
    );
  }

  let respuesta;
  try {
    respuesta = await fetch(FIRECRAWL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: [
          {
            type: 'json',
            prompt:
              'Extrae únicamente datos que aparezcan de forma explícita en el anuncio. No deduzcas ni completes valores ausentes. Usa la superficie construida, no la útil. Omite cualquier campo que no conste, incluidas las características booleanas.',
            schema: ESQUEMA_VIVIENDA,
          },
        ],
        onlyMainContent: true,
        location: { country: 'ES', languages: ['es-ES'] },
        proxy: 'auto',
        waitFor: 1000,
        timeout: 45000,
        maxAge: 0,
        removeBase64Images: true,
        blockAds: true,
        storeInCache: false,
      }),
      signal: AbortSignal.timeout(50000),
    });
  } catch (errorExterno) {
    if (errorExterno instanceof DOMException && errorExterno.name === 'TimeoutError') {
      return json({ error: 'El proveedor externo tardó demasiado en responder.' }, 504);
    }
    return json({ error: 'El proveedor externo no pudo consultar el anuncio.' }, 502);
  }

  if (!respuesta.ok) {
    const status =
      respuesta.status === 429 ? 429 : [408, 504].includes(respuesta.status) ? 504 : 502;
    const retryAfter = respuesta.headers.get('Retry-After');
    return json(
      {
        error:
          status === 429
            ? 'El servicio de importación ha alcanzado su límite. Inténtalo más tarde.'
            : status === 504
              ? 'El proveedor externo tardó demasiado en responder.'
              : 'No se pudo leer el anuncio. Puede estar retirado o protegido.',
      },
      status,
      retryAfter === null ? {} : { 'Retry-After': retryAfter.slice(0, 100) },
    );
  }

  const contentTypeProveedor = respuesta.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentTypeProveedor.includes('application/json')) {
    return json({ error: 'El proveedor externo devolvió una respuesta no válida.' }, 502);
  }

  let contenido;
  try {
    contenido = await leerJsonLimitado(respuesta, TAMANO_MAXIMO_RESPUESTA_PROVEEDOR);
  } catch {
    return json({ error: 'El proveedor externo devolvió una respuesta no válida.' }, 502);
  }

  const contenidoFirecrawl = objeto(contenido);
  const datosFirecrawl = objeto(contenidoFirecrawl?.data);
  const metadatos = objeto(datosFirecrawl?.metadata);
  const urlProcedencia = urlIdealista(metadatos?.sourceURL);
  const estadoOrigen = metadatos?.statusCode;
  const idEsperado = /^\/inmueble\/(\d+)\/?$/.exec(new URL(url).pathname)?.[1];
  const idProcedencia =
    urlProcedencia === null
      ? undefined
      : /^\/inmueble\/(\d+)\/?$/.exec(new URL(urlProcedencia).pathname)?.[1];
  if (
    contenidoFirecrawl?.success !== true ||
    urlProcedencia === null ||
    idEsperado === undefined ||
    idProcedencia !== idEsperado ||
    (typeof estadoOrigen === 'number' && (!Number.isInteger(estadoOrigen) || estadoOrigen >= 400))
  ) {
    return json({ error: 'No se pudo verificar la procedencia del anuncio importado.' }, 502);
  }
  const datos = normalizarDatos(datosFirecrawl?.json, url);
  if (datos === null) {
    return json(
      { error: 'No se encontraron título, dirección, precio, superficie y habitaciones.' },
      422,
    );
  }

  return json(datos);
}
