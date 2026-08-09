import { describe, expect, it } from 'vitest';
import { detectarFuenteAnuncio } from '@/services/propertySourceDetector';

describe('detectarFuenteAnuncio', () => {
  it('extrae portal e identificador de Idealista sin acceder a la red', () => {
    expect(detectarFuenteAnuncio('https://www.idealista.com/inmueble/123456789/')).toEqual({
      portal: 'idealista', url: 'https://www.idealista.com/inmueble/123456789/', listingId: '123456789',
    });
  });

  it('acepta Fotocasa y rechaza dominios o rutas no admitidos', () => {
    expect(detectarFuenteAnuncio('https://www.fotocasa.es/es/comprar/vivienda/madrid-capital/123456789/d')).toMatchObject({ portal: 'fotocasa', listingId: '123456789' });
    expect(detectarFuenteAnuncio('https://example.com/inmueble/123')).toBeNull();
    expect(detectarFuenteAnuncio('javascript:alert(1)')).toBeNull();
  });
});
