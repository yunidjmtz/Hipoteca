import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { construirFlujoDeCaja } from '@/finance/mortgage';
import { toCents, ZERO } from '@/core/money';
import type { FlujoInput } from '@/domain/types';

// ---------------------------------------------------------------------------
// §9.2 · Invariantes (property-based con fast-check)
// ---------------------------------------------------------------------------

/** Genera un FlujoInput válido para hipoteca fija. */
const arbFlujoFijo = fc
  .record({
    capitalEuros: fc.integer({ min: 10_000, max: 600_000 }),
    // TIN: 0 exacto O entero en [1, 150] / 1000 → evita subnormales (1+r===1)
    tinAnual: fc.oneof(
      fc.constant(0),
      fc.integer({ min: 1, max: 150 }).map((n) => n / 1000),
    ),
    plazoAnios: fc.integer({ min: 1, max: 35 }),
  })
  .map(({ capitalEuros, tinAnual, plazoAnios }): FlujoInput => ({
    capital: toCents(capitalEuros),
    tinAnual,
    plazoMeses: plazoAnios * 12,
    sueloTin: 0,
    fechaPrimeraCuota: '2024-02-01',
    comisionApertura: ZERO,
    vinculaciones: [],
    tipo: 'fija',
  }));

describe('Invariantes del cuadro de amortización — §9.2', () => {
  // Invariante 1: Σ principal == capital inicial
  it('INV-1: Σ principal = capital', () => {
    fc.assert(
      fc.property(arbFlujoFijo, (input) => {
        const lineas = construirFlujoDeCaja(input);
        const cuotas = lineas.slice(1);
        const sumaPrincipal = cuotas.reduce((acc, l) => acc + l.principal, 0);
        return sumaPrincipal === input.capital;
      }),
      { numRuns: 200 },
    );
  });

  // Invariante 2: Σ (intereses + principal) == Σ cuotas
  it('INV-2: Σ (intereses + principal) = Σ cuotas', () => {
    fc.assert(
      fc.property(arbFlujoFijo, (input) => {
        const lineas = construirFlujoDeCaja(input);
        const cuotas = lineas.slice(1);
        const sumaIP = cuotas.reduce((acc, l) => acc + l.intereses + l.principal, 0);
        const sumaCuotas = cuotas.reduce((acc, l) => acc + l.cuota, 0);
        return sumaIP === sumaCuotas;
      }),
      { numRuns: 200 },
    );
  });

  // Invariante 3: pendiente es monotónicamente decreciente
  it('INV-3: pendiente es monotónicamente decreciente', () => {
    fc.assert(
      fc.property(arbFlujoFijo, (input) => {
        const lineas = construirFlujoDeCaja(input);
        const cuotas = lineas.slice(1);
        for (let i = 1; i < cuotas.length; i++) {
          if (cuotas[i]!.pendiente > cuotas[i - 1]!.pendiente) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  // Invariante 4: pendiente[n] == 0 exacto
  it('INV-4: pendiente final = 0 exacto', () => {
    fc.assert(
      fc.property(arbFlujoFijo, (input) => {
        const lineas = construirFlujoDeCaja(input);
        const ultima = lineas[lineas.length - 1];
        return ultima?.pendiente === 0;
      }),
      { numRuns: 200 },
    );
  });

  // Invariante 5: coste_real = capital + Σ intereses + Σ comisiones + Σ costes vinculados
  it('INV-5: coste real total coherente', () => {
    fc.assert(
      fc.property(arbFlujoFijo, (input) => {
        const lineas = construirFlujoDeCaja(input);
        const sumaIntereses = lineas.reduce((acc, l) => acc + l.intereses, 0);
        const sumaComisiones = lineas.reduce((acc, l) => acc + l.comisiones, 0);
        const sumaCostesVinculados = lineas.reduce((acc, l) => acc + l.costesVinculados, 0);
        // coste real = capital + intereses + comisiones + costes vinculados
        const costeReal = input.capital + sumaIntereses + sumaComisiones + sumaCostesVinculados;
        // Por INV-1 y INV-2: Σ cuotas = capital + Σ intereses
        // Por tanto: coste real = Σ cuotas + comisiones + costesVinculados
        const sumaTotal =
          lineas.slice(1).reduce((acc, l) => acc + l.cuota, 0) +
          sumaComisiones +
          sumaCostesVinculados;
        return costeReal === sumaTotal;
      }),
      { numRuns: 200 },
    );
  });
});
