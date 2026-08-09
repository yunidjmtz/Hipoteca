export type PortalInmobiliario = 'idealista' | 'fotocasa';

export interface FuenteAnuncio {
  readonly portal: PortalInmobiliario;
  readonly url: string;
  readonly listingId?: string;
}

/** Identifica enlaces de ficha sin hacer ninguna petición al portal. */
export function detectarFuenteAnuncio(valor: string): FuenteAnuncio | null {
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const idealista = /^\/inmueble\/(\d+)\/?$/.exec(url.pathname);
    if (host === 'idealista.com' && idealista !== null) {
      return { portal: 'idealista', url: url.href, listingId: idealista[1]! };
    }

    // Fotocasa conserva el identificador al final de sus URLs de detalle.
    const fotocasa = /(?:-|\/)(\d+)(?:\.htm)?(?:\/[a-z])?\/?$/.exec(url.pathname);
    if (host === 'fotocasa.es' && fotocasa !== null) {
      return { portal: 'fotocasa', url: url.href, listingId: fotocasa[1]! };
    }
    if (host === 'fotocasa.es') return { portal: 'fotocasa', url: url.href };
    return null;
  } catch {
    return null;
  }
}
