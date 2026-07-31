import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contraste, luminanciaRelativa } from './utilidades/contraste';

/**
 * Además de comprobar la paleta, esto verifica que el arnés de pruebas basadas
 * en propiedades está montado y en verde: los invariantes de §9.2 (cuadro de
 * amortización) se escribirán con este mismo mecanismo en la Fase 1a.
 */
const hexArbitrario = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);

describe('invariantes del cálculo de contraste', () => {
  it('es simétrico', () => {
    fc.assert(
      fc.property(hexArbitrario, hexArbitrario, (a, b) => {
        expect(contraste(a, b)).toBeCloseTo(contraste(b, a), 12);
      }),
    );
  });

  it('está siempre entre 1:1 y 21:1', () => {
    fc.assert(
      fc.property(hexArbitrario, hexArbitrario, (a, b) => {
        const ratio = contraste(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21.01);
      }),
    );
  });

  it('da 21:1 exactamente entre negro y blanco', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(luminanciaRelativa('#ffffff')).toBeCloseTo(1, 6);
    expect(luminanciaRelativa('#000000')).toBeCloseTo(0, 6);
  });
});
