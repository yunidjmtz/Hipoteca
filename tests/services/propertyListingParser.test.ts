import { describe, expect, it } from 'vitest';
import { parsePropertyListing } from '@/services/propertyListingParser';

describe('parsePropertyListing', () => {
  it('interpreta un anuncio típico de Idealista sin inventar características', () => {
    const resultado = parsePropertyListing(`199.900 €
75 m²
3 hab.
1 baño
Planta 1ª exterior con ascensor
Terraza
Trastero
Calefacción central
Aire acondicionado`, 'idealista');

    expect(resultado).toMatchObject({
      sourcePortal: 'idealista', price: 199900, builtArea: 75, rooms: 3, bathrooms: 1,
      floor: 1, exterior: true, elevator: true, terrace: true, storageRoom: true,
      heating: 'central', airConditioning: true,
    });
    expect(resultado.garage).toBeUndefined();
  });

  it('acepta las variaciones frecuentes de superficie, dormitorios y planta', () => {
    const resultado = parsePropertyListing(`185.000 €
82 m2
3 dormitorios
2 baños
2ª planta
Ascensor
Balcón
Calefacción individual de gas natural`);

    expect(resultado).toMatchObject({
      price: 185000, builtArea: 82, rooms: 3, bathrooms: 2, floor: 2,
      elevator: true, balcony: true, heating: 'individual de gas natural',
    });
  });

  it('distingue ausencia de información de una negativa explícita', () => {
    const sinDatos = parsePropertyListing('Piso de 75 metros cuadrados y 3 habitaciones');
    const negativos = parsePropertyListing('Piso interior sin ascensor, sin terraza y sin garaje');

    expect(sinDatos.elevator).toBeUndefined();
    expect(sinDatos.garage).toBeUndefined();
    expect(negativos).toMatchObject({ exterior: false, elevator: false, terrace: false, garage: false });
  });

  it('reconoce garaje, trastero, exterior e interior', () => {
    expect(parsePropertyListing('Exterior · plaza de garaje · trastero')).toMatchObject({
      exterior: true, garage: true, storageRoom: true,
    });
    expect(parsePropertyListing('Interior')).toMatchObject({ exterior: false });
  });

  it('recupera ubicación y metros de una captura OCR de Idealista', () => {
    const resultado = parsePropertyListing(`Piso en venta en Calle de Juan II de Aragón
Pol Universidad Romareda, Zaragoza
319.000 €
88 m? 3 hab. 6ª planta exterior con ascensor
Garaje incluido`);

    expect(resultado).toMatchObject({
      title: 'Piso en venta en Calle de Juan II de Aragón',
      address: 'Pol Universidad Romareda, Zaragoza',
      price: 319000,
      builtArea: 88,
      rooms: 3,
      floor: 6,
      exterior: true,
      elevator: true,
      garage: true,
    });
  });

  it('recompone un título cortado antes de la ciudad en una captura OCR', () => {
    const resultado = parsePropertyListing(`139.900 €
2 habs. 1baño 69m* 12 Planta
Piso en venta en Calle de la Coruña, Barrio
Torrero
Zaragoza Capital`);

    expect(resultado).toMatchObject({
      title: 'Piso en venta en Calle de la Coruña, Barrio Torrero',
      address: 'Zaragoza Capital',
      price: 139900,
      builtArea: 69,
      rooms: 2,
      bathrooms: 1,
    });
  });

  it('elimina el enlace de mapa y su icono de la ubicación importada', () => {
    const resultado = parsePropertyListing(`Piso en venta
Pol Universidad Romareda, Zaragoza O) Ver mapa
319.000 €`);

    expect(resultado.address).toBe('Pol Universidad Romareda, Zaragoza');
  });
});
