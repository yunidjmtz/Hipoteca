import type { DatosAnuncioNormalizados } from '@/services/propertyListingParser';
import type { FuenteAnuncio, PortalInmobiliario } from '@/services/propertySourceDetector';
import { toCents, type Cents } from '@/core/money';

export interface CamposImportablesVivienda {
  nombre: string;
  direccion: string;
  anuncioUrl: string;
  precioVenta: Cents;
  superficieM2: number;
  habitaciones: number;
  esExterior: boolean;
  tieneTrastero: boolean;
  tieneGaraje: boolean;
  notas: string;
  rawListingText: string;
  sourcePortal?: PortalInmobiliario;
  sourceUrl: string;
  sourceListingId: string;
}

export function mapImportedDataToExistingForm(
  data: DatosAnuncioNormalizados,
  rawText: string,
  source: FuenteAnuncio | null,
): Partial<CamposImportablesVivienda> {
  const patch: Partial<CamposImportablesVivienda> = { rawListingText: rawText };
  if (data.title !== undefined) patch.nombre = data.title;
  if (data.price !== undefined) patch.precioVenta = toCents(data.price);
  if (data.builtArea !== undefined) patch.superficieM2 = Math.round(data.builtArea);
  if (data.rooms !== undefined) patch.habitaciones = Math.round(data.rooms);
  if (data.address !== undefined) patch.direccion = data.address;
  if (data.exterior !== undefined) patch.esExterior = data.exterior;
  if (data.storageRoom !== undefined) patch.tieneTrastero = data.storageRoom;
  if (data.garage !== undefined) patch.tieneGaraje = data.garage;
  if (source !== null) {
    patch.anuncioUrl = source.url;
    patch.sourceUrl = source.url;
    patch.sourcePortal = source.portal;
    if (source.listingId !== undefined) patch.sourceListingId = source.listingId;
  }
  const extras = [
    data.floor === undefined ? undefined : `Planta: ${data.floor}`,
    data.bathrooms === undefined ? undefined : `Baños: ${data.bathrooms}`,
    data.elevator === undefined ? undefined : `Ascensor: ${data.elevator ? 'sí' : 'no'}`,
    data.terrace === undefined ? undefined : `Terraza: ${data.terrace ? 'sí' : 'no'}`,
    data.balcony === undefined ? undefined : `Balcón: ${data.balcony ? 'sí' : 'no'}`,
    data.airConditioning === undefined ? undefined : `Aire acondicionado: ${data.airConditioning ? 'sí' : 'no'}`,
    data.heating === undefined ? undefined : `Calefacción: ${data.heating}`,
    data.orientation === undefined ? undefined : `Orientación: ${data.orientation}`,
    data.condition === undefined ? undefined : `Estado: ${data.condition}`,
  ].filter((value): value is string => value !== undefined);
  if (extras.length > 0) patch.notas = extras.join(' · ');
  return patch;
}
