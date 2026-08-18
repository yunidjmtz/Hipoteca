import { describe, expect, it } from 'vitest';
import { toCents } from '@/core/money';
import {
  actualizarHistorialPrecio,
  mismaFuenteVivienda,
  sincronizarFavoritosCatalogo,
  viviendaFavoritaDesdeCatalogo,
} from '@/domain/housingCandidate';

const CATALOGO = {
  id: 'propiedad-1',
  nombre: 'Piso del catálogo',
  precioVenta: toCents(200_000),
  zona: 'Centro',
  superficieM2: 80,
  habitaciones: 3,
  banos: 2,
  anuncioUrl: 'https://example.com/propiedad-1',
  descripcion: 'Ficha publicada por la inmobiliaria.',
  tieneGaraje: true,
  tieneTrastero: false,
};

describe('datos de viviendas candidatas', () => {
  it('no duplica el precio anterior y usa una fecha válida como respaldo', () => {
    const historial = actualizarHistorialPrecio(
      [{ price: toCents(200_000), date: '2026-08-01' }],
      toCents(200_000),
      '',
      toCents(210_000),
      '2026-08-16',
    );

    expect(historial).toEqual([
      { price: toCents(200_000), date: '2026-08-01' },
      { price: toCents(210_000), date: '2026-08-16' },
    ]);
  });

  it('inicializa el historial sin registrar un precio cero ficticio', () => {
    expect(
      actualizarHistorialPrecio([], toCents(0), '', toCents(200_000), '2026-08-16'),
    ).toEqual([{ price: toCents(200_000), date: '2026-08-16' }]);
  });

  it('detecta un duplicado por portal e identificador aunque cambie la URL', () => {
    expect(
      mismaFuenteVivienda(
        {
          sourcePortal: 'idealista',
          sourceListingId: '123',
          sourceUrl: 'https://www.idealista.com/inmueble/123/',
        },
        {
          sourcePortal: 'idealista',
          sourceListingId: '123',
          sourceUrl: 'https://www.idealista.com/inmueble/123/?ordenado=1',
        },
      ),
    ).toBe(true);
  });

  it('crea el favorito sin inventar que la vivienda es exterior', () => {
    const favorita = viviendaFavoritaDesdeCatalogo(
      CATALOGO,
      { nombre: 'Inmobiliaria Sol' },
      '2026-08-16',
    );

    expect(favorita.esExterior).toBe(false);
    expect(favorita.catalogoViviendaId).toBe(CATALOGO.id);
    expect(favorita.priceHistory).toEqual([{ price: toCents(200_000), date: '2026-08-16' }]);
  });

  it('registra cambios de precio y conserva como retirada una ficha ausente', () => {
    const favorita = viviendaFavoritaDesdeCatalogo(
      CATALOGO,
      { nombre: 'Inmobiliaria Sol' },
      '2026-08-01',
    );
    const actualizada = sincronizarFavoritosCatalogo(
      [favorita],
      [{ ...CATALOGO, precioVenta: toCents(215_000) }],
      { nombre: 'Inmobiliaria Sol' },
      '2026-08-16',
    )[0];

    expect(actualizada?.precioVenta).toBe(toCents(215_000));
    expect(actualizada?.priceHistory).toEqual([
      { price: toCents(200_000), date: '2026-08-01' },
      { price: toCents(215_000), date: '2026-08-16' },
    ]);

    const retirada = sincronizarFavoritosCatalogo(
      actualizada === undefined ? [] : [actualizada],
      [],
      { nombre: 'Inmobiliaria Sol' },
      '2026-08-16',
    )[0];
    expect(retirada?.yaNoDisponible).toBe(true);
  });
});
