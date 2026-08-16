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
});
