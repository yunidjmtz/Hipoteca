import { sumCents, type Cents, ZERO } from '@/core/money';
import type { PartidaReforma, ViviendaGuardada } from '@/domain/types';

export interface FuenteVivienda {
  readonly catalogoViviendaId?: string | undefined;
  readonly sourcePortal?: 'idealista' | 'fotocasa' | undefined;
  readonly sourceListingId?: string | undefined;
  readonly sourceUrl?: string | undefined;
}

export interface ViviendaCatalogoFuente {
  readonly id: string;
  readonly nombre: string;
  readonly precioVenta: Cents;
  readonly zona: string;
  readonly superficieM2: number;
  readonly habitaciones: number;
  readonly banos: number;
  readonly anuncioUrl: string;
  readonly descripcion: string;
  readonly tieneGaraje: boolean;
  readonly tieneTrastero: boolean;
}

export interface InmobiliariaCatalogoFuente {
  readonly nombre: string;
}

export function totalReformas(reformas: readonly PartidaReforma[]): Cents {
  return sumCents(reformas.map((reforma) => reforma.costeEstimado));
}

/**
 * Conserva una serie de cambios de precio sin repetir el último valor conocido.
 * La fecha de cambio también sirve de respaldo para viviendas antiguas sin fecha.
 */
export function actualizarHistorialPrecio(
  historial: readonly { readonly price: Cents; readonly date: string }[],
  precioAnterior: Cents,
  fechaAnterior: string,
  precioNuevo: Cents,
  fechaCambio: string,
): Array<{ price: Cents; date: string }> {
  if (precioAnterior === precioNuevo) return [...historial];

  const resultado = [...historial];
  const anadirSiCambia = (price: Cents, date: string) => {
    if (resultado.at(-1)?.price !== price) resultado.push({ price, date });
  };

  if (precioAnterior > ZERO) {
    anadirSiCambia(precioAnterior, fechaAnterior === '' ? fechaCambio : fechaAnterior);
  }
  if (precioNuevo > ZERO) anadirSiCambia(precioNuevo, fechaCambio);
  return resultado;
}

export function mismaFuenteVivienda(a: FuenteVivienda, b: FuenteVivienda): boolean {
  if (
    a.catalogoViviendaId !== undefined &&
    a.catalogoViviendaId !== '' &&
    b.catalogoViviendaId !== undefined &&
    b.catalogoViviendaId !== ''
  ) {
    return a.catalogoViviendaId === b.catalogoViviendaId;
  }

  if (
    a.sourcePortal !== undefined &&
    b.sourcePortal !== undefined &&
    a.sourceListingId !== undefined &&
    a.sourceListingId !== '' &&
    b.sourceListingId !== undefined &&
    b.sourceListingId !== ''
  ) {
    return a.sourcePortal === b.sourcePortal && a.sourceListingId === b.sourceListingId;
  }

  const urlA = a.sourceUrl?.trim() ?? '';
  const urlB = b.sourceUrl?.trim() ?? '';
  return urlA !== '' && urlA === urlB;
}

export function viviendaFavoritaDesdeCatalogo(
  vivienda: ViviendaCatalogoFuente,
  inmobiliaria: InmobiliariaCatalogoFuente,
  fecha: string,
): ViviendaGuardada {
  return {
    id: `catalogo-${vivienda.id}`,
    nombre: vivienda.nombre,
    fecha,
    direccion: vivienda.zona,
    anuncioUrl: vivienda.anuncioUrl,
    telefono: '',
    sourceUrl: vivienda.anuncioUrl,
    sourceListingId: vivienda.id,
    rawListingText: '',
    priceHistory: [{ price: vivienda.precioVenta, date: fecha }],
    precioVenta: vivienda.precioVenta,
    presupuestoReforma: ZERO,
    reforma: '',
    superficieM2: vivienda.superficieM2,
    habitaciones: vivienda.habitaciones,
    banos: vivienda.banos,
    // El catálogo actual no publica este dato. No debe inventarse como positivo,
    // porque participa en el filtro de necesidades y en la recomendación.
    esExterior: false,
    tieneTrastero: vivienda.tieneTrastero,
    tieneGaraje: vivienda.tieneGaraje,
    reformas: [],
    notas: vivienda.descripcion,
    origenInmobiliaria: inmobiliaria.nombre,
    catalogoViviendaId: vivienda.id,
  };
}

/**
 * Actualiza precios de favoritos aún publicados y conserva como retiradas las
 * fichas que ya no aparecen en el catálogo de la inmobiliaria vinculada.
 */
export function sincronizarFavoritosCatalogo(
  viviendas: readonly ViviendaGuardada[],
  catalogo: readonly ViviendaCatalogoFuente[],
  inmobiliaria: InmobiliariaCatalogoFuente,
  fechaCambio: string,
): ViviendaGuardada[] {
  const porId = new Map(catalogo.map((vivienda) => [vivienda.id, vivienda]));
  let hayCambios = false;

  const resultado = viviendas.map((guardada) => {
    if (guardada.catalogoViviendaId === undefined) return guardada;
    const publicada = porId.get(guardada.catalogoViviendaId);
    if (publicada !== undefined) {
      const cambioPrecio = publicada.precioVenta !== guardada.precioVenta;
      const vuelveAEstarDisponible = guardada.yaNoDisponible === true;
      if (!cambioPrecio && !vuelveAEstarDisponible) return guardada;

      hayCambios = true;
      const base = { ...guardada };
      delete base.yaNoDisponible;
      return {
        ...base,
        precioVenta: publicada.precioVenta,
        priceHistory: actualizarHistorialPrecio(
          guardada.priceHistory ?? [],
          guardada.precioVenta,
          guardada.fecha,
          publicada.precioVenta,
          fechaCambio,
        ),
      };
    }

    if (guardada.origenInmobiliaria === inmobiliaria.nombre && guardada.yaNoDisponible !== true) {
      hayCambios = true;
      return { ...guardada, yaNoDisponible: true };
    }
    return guardada;
  });

  return hayCambios ? resultado : [...viviendas];
}
