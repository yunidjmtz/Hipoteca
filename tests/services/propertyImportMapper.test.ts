import { describe, expect, it } from 'vitest';
import { mapImportedDataToExistingForm } from '@/services/propertyImportMapper';

describe('mapImportedDataToExistingForm', () => {
  it('conserva los baños como dato comparable y no los relega a las notas', () => {
    const resultado = mapImportedDataToExistingForm(
      { bathrooms: 2, floor: 4 },
      'Piso de 2 baños en planta 4',
      null,
    );

    expect(resultado.banos).toBe(2);
    expect(resultado.notas).toBe('Planta: 4');
  });

  it('no borra texto ni booleanos locales cuando la extracción remota no los acredita', () => {
    const resultado = mapImportedDataToExistingForm(
      { title: 'Piso publicado', price: 200_000 },
      '',
      {
        portal: 'idealista',
        url: 'https://www.idealista.com/inmueble/123/',
        listingId: '123',
      },
    );

    expect(resultado).toMatchObject({
      nombre: 'Piso publicado',
      anuncioUrl: 'https://www.idealista.com/inmueble/123/',
      sourcePortal: 'idealista',
      sourceListingId: '123',
    });
    expect(resultado.rawListingText).toBeUndefined();
    expect(resultado.esExterior).toBeUndefined();
    expect(resultado.tieneGaraje).toBeUndefined();
    expect(resultado.tieneTrastero).toBeUndefined();
  });
});
