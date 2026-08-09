const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';

const ESQUEMA_VIVIENDA = {
  type: 'object',
  required: [
    'titulo',
    'direccion',
    'precioEuros',
    'superficieM2',
    'habitaciones',
    'esExterior',
    'tieneTrastero',
    'tieneGaraje',
  ],
  properties: {
    titulo: {
      type: 'string',
      description: 'Título literal del anuncio.',
    },
    direccion: {
      type: 'string',
      description: 'Dirección o zona publicada en el anuncio, incluida la ciudad.',
    },
    precioEuros: {
      type: 'number',
      description: 'Precio de venta en euros, sin símbolo ni separadores.',
    },
    superficieM2: {
      type: 'integer',
      description: 'Superficie construida en metros cuadrados.',
    },
    habitaciones: {
      type: 'integer',
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

function json(contenido, status = 200) {
  return new Response(JSON.stringify(contenido), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function urlIdealista(valor) {
  if (typeof valor !== 'string') return null;
  try {
    const url = new URL(valor.trim());
    const host = url.hostname.toLowerCase();
    const esIdealista = host === 'idealista.com' || host === 'www.idealista.com';
    if (url.protocol !== 'https:' || !esIdealista || !/^\/inmueble\/\d+\/?$/.test(url.pathname)) {
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
  return typeof valor === 'object' && valor !== null ? valor : null;
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
  if (typeof valor === 'string') return valor.toLowerCase() === 'true';
  return false;
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
    direccion === '' ||
    !Number.isFinite(precioEuros) ||
    precioEuros <= 0 ||
    !Number.isInteger(superficieM2) ||
    superficieM2 <= 0 ||
    !Number.isInteger(habitaciones) ||
    habitaciones < 0
  ) {
    return null;
  }

  return {
    fuente: 'idealista',
    url,
    titulo,
    direccion,
    precioEuros,
    superficieM2,
    habitaciones,
    esExterior: booleano(datos.esExterior),
    tieneTrastero: booleano(datos.tieneTrastero),
    tieneGaraje: booleano(datos.tieneGaraje),
  };
}

export default async function importarAnuncio(
  request,
  apiKeyConfigurada = process.env.FIRECRAWL_API_KEY,
) {
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  let entrada;
  try {
    entrada = await request.json();
  } catch {
    return json({ error: 'La petición no contiene JSON válido.' }, 400);
  }

  const url = urlIdealista(objeto(entrada)?.url);
  if (url === null) {
    return json({ error: 'Pega un enlace de anuncio de Idealista válido.' }, 400);
  }

  const apiKey = apiKeyConfigurada?.trim();
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
              'Extrae únicamente los datos publicados del inmueble. Usa la superficie construida, no la útil. Si garaje o trastero no aparecen, responde false.',
            schema: ESQUEMA_VIVIENDA,
          },
        ],
        onlyMainContent: true,
        location: { country: 'ES', languages: ['es-ES'] },
        proxy: 'auto',
        waitFor: 1000,
        timeout: 45000,
        storeInCache: false,
      }),
      signal: AbortSignal.timeout(50000),
    });
  } catch {
    return json({ error: 'El proveedor externo no pudo consultar el anuncio.' }, 502);
  }

  let contenido;
  try {
    contenido = await respuesta.json();
  } catch {
    return json({ error: 'El proveedor externo devolvió una respuesta no válida.' }, 502);
  }

  if (!respuesta.ok) {
    const status = respuesta.status === 429 ? 429 : 502;
    return json(
      {
        error:
          status === 429
            ? 'El servicio de importación ha alcanzado su límite. Inténtalo más tarde.'
            : 'No se pudo leer el anuncio. Puede estar retirado o protegido.',
      },
      status,
    );
  }

  const datosFirecrawl = objeto(objeto(contenido)?.data);
  const datos = normalizarDatos(datosFirecrawl?.json, url);
  if (datos === null) {
    return json(
      { error: 'No se encontraron título, dirección, precio, superficie y habitaciones.' },
      422,
    );
  }

  return json(datos);
}
