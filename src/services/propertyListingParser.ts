import type { PortalInmobiliario } from '@/services/propertySourceDetector';

export interface DatosAnuncioNormalizados {
  readonly sourcePortal?: PortalInmobiliario;
  readonly price?: number;
  readonly title?: string;
  readonly builtArea?: number;
  readonly usableArea?: number;
  readonly rooms?: number;
  readonly bathrooms?: number;
  readonly floor?: number;
  readonly exterior?: boolean;
  readonly elevator?: boolean;
  readonly terrace?: boolean;
  readonly balcony?: boolean;
  readonly garage?: boolean;
  readonly storageRoom?: boolean;
  readonly heating?: string;
  readonly airConditioning?: boolean;
  readonly orientation?: string;
  readonly condition?: string;
  readonly constructionYear?: number;
  readonly communityFees?: number;
  readonly address?: string;
  readonly neighborhood?: string;
  readonly district?: string;
  readonly municipality?: string;
  readonly description?: string;
  readonly pricePerM2?: number;
}

function numero(valor: string): number {
  return Number(valor.replace(/\./g, '').replace(',', '.'));
}

function primeraCoincidencia(texto: string, expresion: RegExp): number | undefined {
  const coincidencia = expresion.exec(texto);
  if (coincidencia === null || coincidencia[1] === undefined) return undefined;
  const resultado = numero(coincidencia[1]);
  return Number.isFinite(resultado) ? resultado : undefined;
}

function precioVenta(texto: string): number | undefined {
  const expresion = /(?:^|\s)([\d.]+(?:,\d+)?)\s*€/gm;
  for (const coincidencia of texto.matchAll(expresion)) {
    const valor = coincidencia[1];
    if (valor === undefined || coincidencia.index === undefined) continue;
    const inicioLinea = texto.lastIndexOf('\n', coincidencia.index) + 1;
    const finLinea = texto.indexOf('\n', coincidencia.index);
    const linea = texto.slice(inicioLinea, finLinea === -1 ? undefined : finLinea).toLowerCase();
    if (
      /(?:comunidad|ibi|honorarios|reserva|tasación|al mes|mensual)/i.test(linea) ||
      /€\s*\/?\s*m(?:²|2)\b/i.test(linea)
    ) {
      continue;
    }
    const resultado = numero(valor);
    // Evita convertir pequeños gastos aislados en el precio del inmueble.
    if (Number.isFinite(resultado) && resultado >= 10_000) return resultado;
  }
  return undefined;
}

function caracteristica(texto: string, nombre: string, positivo: RegExp): boolean | undefined {
  const negativa = new RegExp(`(?:sin|no (?:tiene|dispone de)|carece de)\\s+${nombre}`, 'i');
  if (negativa.test(texto)) return false;
  return positivo.test(texto) ? true : undefined;
}

function textoCoincidente(texto: string, expresion: RegExp): string | undefined {
  const resultado = expresion.exec(texto)?.[1]?.trim();
  return resultado === '' || resultado === undefined ? undefined : resultado;
}

function limpiarUbicacion(valor: string): string {
  const indiceMapa = valor.toLocaleLowerCase('es').indexOf('ver mapa');
  if (indiceMapa === -1) return valor.trim();
  return (
    valor
      .slice(0, indiceMapa)
      .trim()
      // El pin puede llegar del OCR como `O)` o como un pictograma.
      .replace(/\s+[a-z0-9]\)?$/i, '')
      .replace(/\s+\p{Extended_Pictographic}$/u, '')
      .trim()
  );
}

function direccionDesdeContexto(texto: string): { title?: string; address?: string } {
  const lines = texto
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const titleIndex = lines.findIndex((line) =>
    /\b(?:piso|casa|vivienda|ático|apartamento|chalet|estudio|dúplex)\b.*\b(?:venta|alquiler)\b/i.test(
      line,
    ),
  );
  if (titleIndex === -1) return {};
  const following = lines.slice(titleIndex + 1, titleIndex + 4);
  const addressIndex = following.findIndex((line) => {
    if (/[€]|\b(?:m²|m2|m[?¿*]|habs?(?:itaciones)?|baños?|planta)\b/i.test(line)) return false;
    return /(?:\b(?:calle|avenida|av\.?|plaza|paseo|pol\.?|barrio|urbanización|capital|ciudad)\b|,)/i.test(
      line,
    );
  });
  const title = [
    lines[titleIndex],
    ...following
      .slice(0, Math.max(addressIndex, 0))
      .filter((line) => !/[€]|\b\d+\s*(?:m|hab)/i.test(line)),
  ]
    .filter((line): line is string => line !== undefined)
    .join(' ');
  const address = addressIndex === -1 ? undefined : following[addressIndex];
  return {
    ...(title === undefined ? {} : { title }),
    ...(address === undefined ? {} : { address }),
  };
}

/**
 * Convierte texto copiado de un anuncio español a un formato independiente de
 * la interfaz. La ausencia de una característica se conserva como undefined.
 */
export function parsePropertyListing(
  rawText: string,
  sourcePortal?: PortalInmobiliario,
): DatosAnuncioNormalizados {
  // Tesseract suele confundir el superíndice ² de las capturas con ? o ¿.
  const text = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/(\d)\s*m[?¿]/gi, '$1 m2');
  const normalized = text.toLowerCase();
  const result: { -readonly [K in keyof DatosAnuncioNormalizados]?: DatosAnuncioNormalizados[K] } =
    {};
  if (sourcePortal !== undefined) result.sourcePortal = sourcePortal;

  const price = precioVenta(text);
  if (price !== undefined) result.price = price;
  const usableArea = primeraCoincidencia(
    normalized,
    /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|m[?¿*]|m\b|metros cuadrados)\s+útiles?/i,
  );
  if (usableArea !== undefined) result.usableArea = usableArea;
  const builtAreaExplicit = primeraCoincidencia(
    normalized,
    /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|m[?¿*]|m\b|metros cuadrados)\s+construidos?/i,
  );
  const areaGenerica = primeraCoincidencia(
    normalized,
    /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|m[?¿*]|m\b|metros cuadrados)/i,
  );
  const builtArea =
    builtAreaExplicit ??
    (areaGenerica !== usableArea || usableArea === undefined ? areaGenerica : undefined);
  if (builtArea !== undefined) result.builtArea = builtArea;
  const rooms = primeraCoincidencia(normalized, /(\d+)\s*(?:habs?\.?|habitaciones|dormitorios)/i);
  if (rooms !== undefined) result.rooms = rooms;
  const bathrooms = primeraCoincidencia(normalized, /(\d+)\s*baños?/i);
  if (bathrooms !== undefined) result.bathrooms = bathrooms;
  const floor =
    primeraCoincidencia(normalized, /planta\s*(\d+)(?:ª|º|a|o)?/i) ??
    primeraCoincidencia(normalized, /(\d+)(?:ª|º)\s*planta/i) ??
    primeraCoincidencia(normalized, /^\s*(\d+)(?:ª|º)\s*(?:planta)?\s*$/im);
  if (floor !== undefined) result.floor = floor;

  const exterior = /\binterior\b/i.test(normalized)
    ? false
    : caracteristica(normalized, 'exterior', /\bexterior\b/i);
  if (exterior !== undefined) result.exterior = exterior;
  const elevator = caracteristica(normalized, 'ascensor', /(?:con )?ascensor/i);
  if (elevator !== undefined) result.elevator = elevator;
  const terrace = caracteristica(normalized, 'terraza', /\bterraza\b/i);
  if (terrace !== undefined) result.terrace = terrace;
  const balcony = caracteristica(normalized, 'balcón', /\bbalc[oó]n\b/i);
  if (balcony !== undefined) result.balcony = balcony;
  const garage = caracteristica(
    normalized,
    '(?:garaje|plaza de garaje)',
    /(?:garaje incluido|plaza de garaje|\bgaraje\b)/i,
  );
  if (garage !== undefined) result.garage = garage;
  const storageRoom = caracteristica(normalized, 'trastero', /\btrastero\b/i);
  if (storageRoom !== undefined) result.storageRoom = storageRoom;
  const airConditioning = caracteristica(normalized, 'aire acondicionado', /aire acondicionado/i);
  if (airConditioning !== undefined) result.airConditioning = airConditioning;

  const heating = textoCoincidente(normalized, /calefacción\s+([^\n.,;]+)/i);
  if (heating !== undefined) result.heating = heating;
  const orientation = textoCoincidente(normalized, /orientación\s*[:-]?\s*([^\n,.;]+)/i);
  if (orientation !== undefined) result.orientation = orientation;
  const condition = textoCoincidente(normalized, /(?:estado|conservación)\s*[:-]?\s*([^\n,.;]+)/i);
  if (condition !== undefined) result.condition = condition;
  const constructionYear = primeraCoincidencia(
    normalized,
    /(?:año de construcción|construido en)\s*[:-]?\s*(\d{4})/i,
  );
  if (constructionYear !== undefined) result.constructionYear = constructionYear;
  const communityFees = primeraCoincidencia(
    normalized,
    /(?:gastos? de comunidad|comunidad)\s*[:-]?\s*([\d.]+(?:,\d+)?)\s*€/i,
  );
  if (communityFees !== undefined) result.communityFees = communityFees;
  const pricePerM2 = primeraCoincidencia(normalized, /([\d.]+(?:,\d+)?)\s*€\s*\/?\s*m(?:²|2)/i);
  if (pricePerM2 !== undefined) result.pricePerM2 = pricePerM2;

  const address = textoCoincidente(text, /(?:dirección|ubicación)\s*[:-]\s*([^\n]+)/i);
  const context = direccionDesdeContexto(text);
  if (context.title !== undefined) result.title = context.title;
  if (address !== undefined) result.address = limpiarUbicacion(address);
  else if (context.address !== undefined) result.address = limpiarUbicacion(context.address);
  const neighborhood = textoCoincidente(text, /(?:barrio|zona)\s*[:-]\s*([^\n,;]+)/i);
  if (neighborhood !== undefined) result.neighborhood = neighborhood;
  const district = textoCoincidente(text, /distrito\s*[:-]\s*([^\n,;]+)/i);
  if (district !== undefined) result.district = district;
  const municipality = textoCoincidente(text, /(?:municipio|población)\s*[:-]\s*([^\n,;]+)/i);
  if (municipality !== undefined) result.municipality = municipality;
  if (text.trim() !== '') result.description = text.trim();
  return result;
}
