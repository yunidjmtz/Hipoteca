import { describe, it, expect } from 'vitest';
import {
  cuotaMensual,
  capitalDesdeCuota,
  construirFlujoDeCaja,
  calcularBonificacionTotal,
} from '@/finance/mortgage';
import { toCents, fromCents, ZERO } from '@/core/money';
import type { FlujoInput, ProductoVinculado } from '@/domain/types';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

function flujoFijo(
  capitalEuros: number,
  tinAnual: number,
  plazoAnios: number,
  fecha = '2024-02-01',
): FlujoInput {
  return {
    capital: toCents(capitalEuros),
    tinAnual,
    plazoMeses: plazoAnios * 12,
    sueloTin: 0,
    fechaPrimeraCuota: fecha,
    comisionApertura: ZERO,
    vinculaciones: [],
    tipo: 'fija',
  };
}

// ---------------------------------------------------------------------------
// §9.1 · caso 1: cuota fija conocida
// ---------------------------------------------------------------------------

describe('cuotaMensual', () => {
  it('caso 1 — cuota positiva para valores normales', () => {
    const c = cuotaMensual(toCents(150_000), 0.03, 240);
    expect(c).toBeGreaterThan(0);
    // Verificación aproximada: 150.000 € al 3 % en 20 años ≈ 832 €/mes
    expect(fromCents(c)).toBeCloseTo(832, 0);
  });

  // §9.1 · caso 2: tipo cero
  it('caso 2 — TIN 0 %: cuota = capital / plazo', () => {
    const capital = toCents(120_000);
    const cuota = cuotaMensual(capital, 0, 120);
    expect(cuota).toBe(toCents(1_000)); // 120.000 / 120 = 1.000 €/mes
  });

  it('capital cero devuelve ZERO', () => {
    expect(cuotaMensual(ZERO, 0.03, 240)).toBe(ZERO);
  });

  it('plazo cero devuelve ZERO', () => {
    expect(cuotaMensual(toCents(100_000), 0.03, 0)).toBe(ZERO);
  });

  it('cuota × plazo > capital (incluye intereses)', () => {
    const capital = toCents(100_000);
    const cuota = cuotaMensual(capital, 0.04, 120);
    expect(cuota * 120).toBeGreaterThan(capital);
  });
});

describe('capitalDesdeCuota — inversa de cuotaMensual', () => {
  it('round-trip: capitalDesdeCuota(cuotaMensual(C)) ≈ C (tolerancia 1 €)', () => {
    const capital = toCents(180_000);
    const cuota = cuotaMensual(capital, 0.035, 300);
    const recuperado = capitalDesdeCuota(cuota, 0.035, 300);
    expect(Math.abs(recuperado - capital)).toBeLessThanOrEqual(100); // ≤ 1 €
  });

  it('TIN 0 %: capital = cuota × plazo', () => {
    const cuota = toCents(1_000);
    expect(capitalDesdeCuota(cuota, 0, 120)).toBe(toCents(120_000));
  });

  it('cuota o plazo no positivos devuelven ZERO', () => {
    expect(capitalDesdeCuota(ZERO, 0.03, 120)).toBe(ZERO);
    expect(capitalDesdeCuota(toCents(1_000), 0.03, 0)).toBe(ZERO);
  });
});

// ---------------------------------------------------------------------------
// §9.1 · caso 20: última cuota con pendiente exactamente cero — R7
// ---------------------------------------------------------------------------

describe('construirFlujoDeCaja', () => {
  it('caso 20 — pendiente final exactamente 0', () => {
    const lineas = construirFlujoDeCaja(flujoFijo(100_000, 0.04, 20));
    const ultima = lineas[lineas.length - 1];
    expect(ultima?.pendiente).toBe(0);
  });

  it('incluye línea 0 (desembolso inicial)', () => {
    const lineas = construirFlujoDeCaja(flujoFijo(100_000, 0.03, 10));
    expect(lineas[0]?.numero).toBe(0);
    expect(lineas[0]?.cuota).toBe(0);
    expect(lineas).toHaveLength(10 * 12 + 1); // 120 cuotas + línea 0
  });

  it('comisión de apertura aparece en la línea 0', () => {
    const input: FlujoInput = {
      ...flujoFijo(100_000, 0.03, 10),
      comisionApertura: toCents(1_000),
    };
    expect(construirFlujoDeCaja(input)[0]?.comisiones).toBe(toCents(1_000));
  });

  it('TIN 0 %: todas las cuotas iguales y pendiente final 0', () => {
    const lineas = construirFlujoDeCaja(flujoFijo(120_000, 0, 10));
    const cuotas = lineas.slice(1);
    const espCuota = toCents(1_000); // 120.000 / 120
    // Todas las cuotas salvo la última deben ser 1.000 €
    cuotas.slice(0, -1).forEach((l) => expect(l.cuota).toBe(espCuota));
    expect(cuotas[cuotas.length - 1]?.pendiente).toBe(0);
  });

  // §9.3 · caso dorado — fórmula francesa verificada al céntimo
  // Capital: 150.000 €, TIN: 3,00 %, Plazo: 20 años (240 meses)
  // r = 0,0025; cuota = 15.000.000 × 0,0025 / (1 − 1,0025^−240)
  //   = 83.189,639... cents → half-up = 83.190 cents = 831,90 €
  // Nota §10: la fórmula r=TIN/12 sin day-count es la convención habitual en ES (decisión 7).
  it('caso dorado — cuota exacta 831,90 €, Σ principal = capital, pendiente = 0', () => {
    const lineas = construirFlujoDeCaja(flujoFijo(150_000, 0.03, 20));
    const cuotas = lineas.slice(1);

    // Cuota mensual exacta al céntimo
    expect(cuotas[0]!.cuota).toBe(toCents(831.9));

    // Suma de principal = capital exacto
    const sumaPrincipal = cuotas.reduce((acc, l) => acc + l.principal, 0);
    expect(sumaPrincipal).toBe(toCents(150_000));

    // Pendiente final = 0 exacto (R7)
    expect(cuotas[cuotas.length - 1]?.pendiente).toBe(0);

    // Coherencia: Σ cuotas = Σ intereses + Σ principal
    const sumaCuotas = cuotas.reduce((acc, l) => acc + l.cuota, 0);
    const sumaIntereses = cuotas.reduce((acc, l) => acc + l.intereses, 0);
    expect(sumaCuotas).toBe(sumaPrincipal + sumaIntereses);
  });

  // §9.1 · caso 5: tasación inferior → no afecta al construirFlujoDeCaja directamente
  // (la reducción del capital es responsabilidad de affordability)

  // R9: sueloTin
  it('R9 — sueloTin evita TIN negativo', () => {
    const input: FlujoInput = {
      ...flujoFijo(100_000, -0.01, 20), // TIN negativo simulado
      sueloTin: 0,
    };
    const lineas = construirFlujoDeCaja(input);
    // Con sueloBancario = 0, TIN efectivo = max(0, -0.01) = 0
    // Cuota = capital / n
    const n = 240;
    expect(lineas[1]?.cuota).toBe(toCents(100_000 / n));
  });

  it('vinculación activa y obligatoria suma coste mensual', () => {
    const vinculacion = {
      id: 'seguro-vida',
      nombre: 'Seguro de vida',
      activo: true,
      obligatorio: true,
      bonificacionTin: 0,
      costeInicial: ZERO,
      costeAnual: toCents(600), // 600 €/año = 50 €/mes
      incrementoAnual: 0,
      aniosExigidos: null,
      observaciones: '',
    };
    const input: FlujoInput = {
      ...flujoFijo(100_000, 0.03, 10),
      vinculaciones: [vinculacion],
    };
    const lineas = construirFlujoDeCaja(input);
    // Cada cuota de los meses 1..n debe incluir costesVinculados > 0
    expect(lineas[1]?.costesVinculados).toBeGreaterThan(0);
  });

  it('vinculación inactiva no suma coste mensual', () => {
    const vinculacion = {
      id: 'seguro-vida',
      nombre: 'Seguro de vida',
      activo: false, // no activo → no suma
      obligatorio: true,
      bonificacionTin: 0,
      costeInicial: ZERO,
      costeAnual: toCents(600),
      incrementoAnual: 0,
      aniosExigidos: null,
      observaciones: '',
    };
    const input: FlujoInput = {
      ...flujoFijo(100_000, 0.03, 10),
      vinculaciones: [vinculacion],
    };
    const lineas = construirFlujoDeCaja(input);
    expect(lineas[1]?.costesVinculados).toBe(ZERO);
  });

  // §9.1 · caso 3: hipoteca variable con revisión anual
  it('caso 3 — variable: revisión anual recalcula cuota con nuevo Euríbor', () => {
    const euriborInicial = 0.03;
    const euriborAnio2 = 0.04;
    const input: FlujoInput = {
      capital: toCents(100_000),
      tinAnual: 0, // no usada en variable
      plazoMeses: 24,
      sueloTin: 0,
      fechaPrimeraCuota: '2024-01-01',
      comisionApertura: ZERO,
      vinculaciones: [],
      tipo: 'variable',
      euribor: euriborInicial,
      diferencial: 0,
      periodicidadRevision: 'anual',
      euriborPorPeriodos: [
        { desdeMes: 1, valor: euriborInicial },
        { desdeMes: 13, valor: euriborAnio2 },
      ],
    };

    const lineas = construirFlujoDeCaja(input);

    // Los primeros 12 meses usan el TIN inicial
    expect(lineas[1]?.tinAplicado).toBeCloseTo(euriborInicial);
    expect(lineas[12]?.tinAplicado).toBeCloseTo(euriborInicial);

    // A partir del mes 13 se usa el nuevo Euríbor
    expect(lineas[13]?.tinAplicado).toBeCloseTo(euriborAnio2);

    // Pendiente final = 0
    expect(lineas[lineas.length - 1]?.pendiente).toBe(0);
  });

  // §9.1 · caso 4: hipoteca mixta con cambio de cuota
  it('caso 4 — mixta: dos cuotas distintas (R10)', () => {
    const tinFijo = 0.02;
    const euribor = 0.04;
    const diferencial = 0.01;
    const input: FlujoInput = {
      capital: toCents(120_000),
      tinAnual: 0, // no usada en mixta
      plazoMeses: 120, // 10 años
      sueloTin: 0,
      fechaPrimeraCuota: '2024-01-01',
      comisionApertura: ZERO,
      vinculaciones: [],
      tipo: 'mixta',
      mixtaTinFijo: tinFijo,
      mixtaAniosFijos: 3, // 3 años fijos, 7 variables
      euribor,
      diferencial,
      periodicidadRevision: 'anual',
    };

    const lineas = construirFlujoDeCaja(input);
    const cuotaFija = lineas[1]?.cuota ?? ZERO;
    const cuotaVariable = lineas[37]?.cuota ?? ZERO; // mes 37 = primer mes variable

    // Las cuotas de los dos periodos deben ser distintas
    expect(cuotaFija).not.toBe(cuotaVariable);

    // TIN del período fijo debe ser tinFijo
    expect(lineas[1]?.tinAplicado).toBeCloseTo(tinFijo);
    expect(lineas[36]?.tinAplicado).toBeCloseTo(tinFijo);

    // TIN del período variable debe ser euribor + diferencial
    expect(lineas[37]?.tinAplicado).toBeCloseTo(euribor + diferencial);

    // Pendiente final = 0
    expect(lineas[lineas.length - 1]?.pendiente).toBe(0);
  });

  // §9.1 · caso 24: Euríbor negativo no baja de sueloTin (R9)
  it('caso 24 — Euríbor negativo: TIN no baja de sueloTin (R9)', () => {
    const input: FlujoInput = {
      capital: toCents(100_000),
      tinAnual: 0,
      plazoMeses: 12,
      sueloTin: 0,
      fechaPrimeraCuota: '2024-01-01',
      comisionApertura: ZERO,
      vinculaciones: [],
      tipo: 'variable',
      euribor: -0.005, // Euríbor negativo (como en 2016–2021)
      diferencial: 0.01,
      periodicidadRevision: 'anual',
    };

    const lineas = construirFlujoDeCaja(input);

    // TIN = max(0, -0.005 + 0.01) = max(0, 0.005) = 0.005
    // No puede ser negativo
    lineas.slice(1).forEach((l) => {
      expect(l.tinAplicado).toBeGreaterThanOrEqual(0);
    });
    expect(lineas[lineas.length - 1]?.pendiente).toBe(0);
  });

  // §9.1 · caso 30: pérdida de bonificaciones recalcula cuota
  it('caso 30 — pérdida de bonificaciones: cuota sube al perder bonificación TIN', () => {
    const vinculacion: ProductoVinculado = {
      id: 'seguro',
      nombre: 'Seguro de vida',
      activo: true,
      bonificacionTin: 0.005, // 0,5 %
      costeInicial: ZERO,
      costeAnual: toCents(400),
      incrementoAnual: 0,
      aniosExigidos: null,
      obligatorio: true,
      observaciones: '',
    };
    const inputConBonif: FlujoInput = {
      capital: toCents(100_000),
      tinAnual: 0,
      plazoMeses: 240,
      sueloTin: 0,
      fechaPrimeraCuota: '2024-01-01',
      comisionApertura: ZERO,
      vinculaciones: [vinculacion],
      tipo: 'variable',
      euribor: 0.03,
      diferencial: 0.01,
      periodicidadRevision: 'anual',
    };
    const inputSinBonif: FlujoInput = {
      ...inputConBonif,
      vinculaciones: [{ ...vinculacion, activo: false }],
    };

    const cuotaCon = construirFlujoDeCaja(inputConBonif)[1]?.cuota ?? ZERO;
    const cuotaSin = construirFlujoDeCaja(inputSinBonif)[1]?.cuota ?? ZERO;

    // Sin bonificación: TIN más alto → cuota más alta
    expect(cuotaSin).toBeGreaterThan(cuotaCon);
  });

  // calcularBonificacionTotal: tope bonificacionMaxima
  it('calcularBonificacionTotal respeta bonificacionMaxima por producto', () => {
    const vinculaciones: ProductoVinculado[] = [
      {
        id: 'v1',
        nombre: 'Seguro',
        activo: true,
        bonificacionTin: 0.01, // 1 %, pero con tope de 0.005
        bonificacionMaxima: 0.005,
        costeInicial: ZERO,
        costeAnual: ZERO,
        incrementoAnual: 0,
        aniosExigidos: null,
        obligatorio: true,
        observaciones: '',
      },
    ];
    const total = calcularBonificacionTotal(vinculaciones, 1);
    expect(total).toBeCloseTo(0.005); // topado, no 0.01
  });

  // vinculación aniosExigidos: no suma coste después de los años exigidos
  it('vinculación con aniosExigidos no suma coste después del plazo exigido', () => {
    const vinculacion: ProductoVinculado = {
      id: 'v1',
      nombre: 'Seguro temporal',
      activo: true,
      bonificacionTin: 0,
      costeInicial: ZERO,
      costeAnual: toCents(600),
      incrementoAnual: 0,
      aniosExigidos: 1, // solo el primer año
      obligatorio: true,
      observaciones: '',
    };
    const input: FlujoInput = {
      ...flujoFijo(60_000, 0.03, 3),
      vinculaciones: [vinculacion],
    };
    const lineas = construirFlujoDeCaja(input);

    // Meses 1–12: coste > 0
    expect(lineas[1]?.costesVinculados).toBeGreaterThan(0);
    expect(lineas[12]?.costesVinculados).toBeGreaterThan(0);
    // Mes 13 en adelante (año 2): coste = 0
    expect(lineas[13]?.costesVinculados).toBe(0);
  });

  it('variable semestral mantiene el TIN hasta la revisión aunque cambie antes el Euríbor', () => {
    const input: FlujoInput = {
      capital: toCents(100_000),
      tinAnual: 0,
      plazoMeses: 24,
      sueloTin: 0,
      fechaPrimeraCuota: '2026-01-01',
      comisionApertura: ZERO,
      vinculaciones: [],
      tipo: 'variable',
      euribor: 0.02,
      diferencial: 0.01,
      periodicidadRevision: 'semestral',
      euriborPorPeriodos: [
        { desdeMes: 1, valor: 0.02 },
        { desdeMes: 4, valor: 0.04 },
      ],
    };

    const lineas = construirFlujoDeCaja(input);
    expect(lineas[6]?.tinAplicado).toBeCloseTo(0.03);
    expect(lineas[7]?.tinAplicado).toBeCloseTo(0.05);
    expect(lineas[7]?.cuota).toBeGreaterThan(lineas[6]?.cuota ?? ZERO);
  });

  it('elige el período de Euríbor más reciente aunque la lista esté desordenada', () => {
    const input: FlujoInput = {
      capital: toCents(100_000),
      tinAnual: 0,
      plazoMeses: 24,
      sueloTin: 0,
      fechaPrimeraCuota: '2026-01-01',
      comisionApertura: ZERO,
      vinculaciones: [],
      tipo: 'variable',
      euribor: 0.02,
      diferencial: 0,
      periodicidadRevision: 'anual',
      euriborPorPeriodos: [
        { desdeMes: 13, valor: 0.04 },
        { desdeMes: 1, valor: 0.03 },
      ],
    };

    const lineas = construirFlujoDeCaja(input);
    expect(lineas[13]?.tinAplicado).toBeCloseTo(0.04);
  });

  it('mixta recalcula el TIN fijo cuando vence una bonificación temporal', () => {
    const vinculacion: ProductoVinculado = {
      id: 'temporal',
      nombre: 'Bonificación primer año',
      activo: true,
      bonificacionTin: 0.005,
      costeInicial: ZERO,
      costeAnual: ZERO,
      incrementoAnual: 0,
      aniosExigidos: 1,
      obligatorio: true,
      observaciones: '',
    };
    const input: FlujoInput = {
      capital: toCents(150_000),
      tinAnual: 0,
      plazoMeses: 300,
      sueloTin: 0,
      fechaPrimeraCuota: '2026-01-01',
      comisionApertura: ZERO,
      vinculaciones: [vinculacion],
      tipo: 'mixta',
      mixtaTinFijo: 0.03,
      mixtaAniosFijos: 5,
      euribor: 0.03,
      diferencial: 0.01,
      periodicidadRevision: 'anual',
    };

    const lineas = construirFlujoDeCaja(input);
    expect(lineas[12]?.tinAplicado).toBeCloseTo(0.025);
    expect(lineas[13]?.tinAplicado).toBeCloseTo(0.03);
    expect(lineas[13]?.cuota).toBeGreaterThan(lineas[12]?.cuota ?? ZERO);
    expect(lineas[61]?.tinAplicado).toBeCloseTo(0.04);
  });
});
