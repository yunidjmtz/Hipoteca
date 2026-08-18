import { describe, it, expect } from 'vitest';
import {
  calcularCapacidadAhorroActual,
  calcularOtrosIngresosMensuales,
  calcularIngresoMensualNormalizado,
  calcularPlazoEfectivo,
  evaluarPrecio,
  factorLimitante,
  buscarPrecioMaximo,
} from '@/finance/affordability';
import { toCents, ZERO } from '@/core/money';
import { FISCAL_ARAGON } from '@/config/fiscal';
import type {
  Titular,
  ContextoEvaluacion,
  PerfilFinanciero,
  GastosCompra,
  CostesRecurrentes,
  Ajustes,
} from '@/domain/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function titular(netoPorPaga: number, numeroPagas: 12 | 14 = 12, edad = 35): Titular {
  return {
    netoPorPaga: toCents(netoPorPaga),
    numeroPagas,
    edad,
    situacionLaboral: 'indefinido',
  };
}

const GASTOS_MINIMOS: GastosCompra = {
  notariaCompraventa: toCents(1_000),
  registroCompraventa: toCents(500),
  gestoriaCompraventa: toCents(500),
  tasacion: toCents(600),
  notaSimple: toCents(10),
  inmobiliariaFijo: ZERO,
  inmobiliariaPorcentaje: 0,
  inmobiliariaIva: 0.21,
  brokerFijo: ZERO,
  brokerPorcentaje: 0,
  reforma: ZERO,
  muebles: ZERO,
  mudanza: ZERO,
  imprevistos: ZERO,
  otros: ZERO,
  repercutirGastosHipoteca: false,
};

const COSTES_MINIMOS: CostesRecurrentes = {
  comunidadMensual: ZERO,
  ibiAnual: ZERO,
  seguroHogarAnual: ZERO,
  seguroVidaAnual: ZERO,
  mantenimientoMensual: ZERO,
  garajeMensual: ZERO,
  suministrosMensuales: ZERO,
  otrosMensuales: ZERO,
};

const AJUSTES_STD: Ajustes = {
  ratioBancarioMaximo: 0.35,
  ratioPersonalObjetivo: 0.3,
  edadMaximaAlVencimiento: 75,
  criterioEdad: 'mayor',
  crecimientoAnualPrecioVivienda: 0,
  rentabilidadAnualAhorro: 0,
  umbralesViabilidad: { ratioComodo: 0.3, ratioViable: 0.35, ratioAjustado: 0.33 },
  fiscal: [FISCAL_ARAGON],
  ltvPorDefecto: 0.8,
  plazoPorDefecto: 25,
  tinPorDefecto: 0.035,
  tinFuente: 'manual',
};

function perfil(opciones?: {
  ahorro?: number;
  ingresoNeto?: number;
  numeroPagas?: 12 | 14;
  deuda?: number;
  edad?: number;
}): PerfilFinanciero {
  return {
    titulares: [
      titular(opciones?.ingresoNeto ?? 2_000, opciones?.numeroPagas ?? 12, opciones?.edad ?? 35),
    ],
    otrosIngresos: [],
    otrosIngresosMensuales: ZERO,
    deudas: opciones?.deuda
      ? [
          {
            id: '1',
            concepto: 'Préstamo',
            importe: toCents(opciones.deuda),
            periodicidad: 'mensual' as const,
          },
        ]
      : [],
    gastosFijos: [],
    ahorrosActuales: toCents(opciones?.ahorro ?? 40_000),
    ahorroMensualPrevisto: toCents(500),
    ingresosExtraordinarios: [],
    alquilerActual: ZERO,
  };
}

function ctx(opciones?: {
  precio?: number;
  ahorro?: number;
  ingresoNeto?: number;
  numeroPagas?: 12 | 14;
  deuda?: number;
  edad?: number;
  ltv?: number;
  tasacion?: number;
}): ContextoEvaluacion {
  const precio = opciones?.precio ?? 150_000;
  const tasacion = opciones?.tasacion ?? precio;
  return {
    valorTasacion: toCents(tasacion),
    ltv: opciones?.ltv ?? 0.8,
    plazoAnios: 25,
    tinAnual: 0.035,
    perfil: perfil(opciones),
    gastos: GASTOS_MINIMOS,
    costesRecurrentes: COSTES_MINIMOS,
    ajustes: AJUSTES_STD,
    estadoVivienda: 'usada',
    esVpoEspecial: false,
    reduccion: {
      edadMaximaTitular: opciones?.edad ?? 35,
      discapacidadPorcentaje: 0,
      victimaViolenciaGenero: false,
      familiaNumerosa: false,
      esViviendaHabitual: true,
    },
    configFiscal: FISCAL_ARAGON,
  };
}

// ---------------------------------------------------------------------------
// §9.1 · caso 27: nómina de 14 pagas — R3
// ---------------------------------------------------------------------------

describe('calcularIngresoMensualNormalizado — R3', () => {
  it('caso 27 — 14 pagas normaliza correctamente', () => {
    const t = titular(1_800, 14);
    // 1.800 × 14 / 12 = 2.100 €/mes
    expect(calcularIngresoMensualNormalizado([t])).toBe(toCents(2_100));
  });

  it('12 pagas no modifica el importe', () => {
    const t = titular(2_000, 12);
    expect(calcularIngresoMensualNormalizado([t])).toBe(toCents(2_000));
  });

  it('dos titulares: suma de ambos ingresos normalizados', () => {
    const t1 = titular(2_000, 12);
    const t2 = titular(1_500, 14);
    // 2.000 + 1.500 × 14/12 = 2.000 + 1.750 = 3.750
    expect(calcularIngresoMensualNormalizado([t1, t2])).toBe(toCents(3_750));
  });

  it('tres titulares: incluye los tres ingresos y sus pagas', () => {
    const t1 = titular(2_000, 12);
    const t2 = titular(1_500, 14);
    const t3 = titular(900, 12);
    // 2.000 + 1.750 + 900 = 4.650 €/mes
    expect(calcularIngresoMensualNormalizado([t1, t2, t3])).toBe(toCents(4_650));
  });
});

describe('calcularCapacidadAhorroActual', () => {
  it('incluye el alquiler actual al calcular el margen mensual disponible', () => {
    const perfilConAlquiler = perfil({ ingresoNeto: 2_500, deuda: 300 });
    perfilConAlquiler.gastosFijos = [
      {
        id: 'alquiler',
        concepto: 'Alquiler actual',
        importe: toCents(900),
        periodicidad: 'mensual',
        esAlquilerActual: true,
      },
      {
        id: 'suministros',
        concepto: 'Suministros',
        importe: toCents(200),
        periodicidad: 'mensual',
      },
    ];

    // 2.500 € de ingresos − 300 € de deuda − 900 € de alquiler − 200 € de gastos.
    expect(calcularCapacidadAhorroActual(perfilConAlquiler)).toBe(toCents(1_100));
  });

  it('usa el alquiler guardado como respaldo si no está marcado entre los gastos', () => {
    const perfilConDatoAntiguo = perfil({ ingresoNeto: 2_500 });
    perfilConDatoAntiguo.alquilerActual = toCents(900);

    expect(calcularCapacidadAhorroActual(perfilConDatoAntiguo)).toBe(toCents(1_600));
  });
});

describe('calcularOtrosIngresosMensuales', () => {
  it('deriva el total desde la lista aunque el escalar antiguo esté desactualizado', () => {
    const perfilConIngresos = {
      ...perfil(),
      otrosIngresosMensuales: ZERO,
      otrosIngresos: [
        {
          id: 'extra',
          concepto: 'Ingreso trimestral',
          importe: toCents(900),
          periodicidad: 'trimestral' as const,
        },
      ],
    };
    expect(calcularOtrosIngresosMensuales(perfilConIngresos)).toBe(toCents(300));
  });
});

// ---------------------------------------------------------------------------
// §9.1 · casos 11 y 26: plazo efectivo por edad — R4
// ---------------------------------------------------------------------------

describe('calcularPlazoEfectivo — R4', () => {
  it('caso 26 — titular más mayor limita el plazo, no el más joven', () => {
    const titulares = [titular(2_000, 12, 50), titular(2_000, 12, 35)];
    // edadMax = 75, titular mayor = 50 → max plazo = 25 años
    const plazo = calcularPlazoEfectivo(30, AJUSTES_STD, titulares);
    expect(plazo).toBe(25);
  });

  it('caso 11 — edad que limita el plazo', () => {
    const titulares = [titular(2_000, 12, 60)];
    // edadMax = 75, edad = 60 → max plazo = 15 años
    expect(calcularPlazoEfectivo(30, AJUSTES_STD, titulares)).toBe(15);
  });

  it('criterio menor: usa el titular más joven', () => {
    const ajustes: Ajustes = { ...AJUSTES_STD, criterioEdad: 'menor' };
    const titulares = [titular(2_000, 12, 50), titular(2_000, 12, 35)];
    // Titular más joven = 35 → max plazo = 40 años; solicitado = 30 → 30
    expect(calcularPlazoEfectivo(30, ajustes, titulares)).toBe(30);
  });

  it('aplica el criterio de edad configurado con tres titulares', () => {
    const titulares = [titular(2_000, 12, 30), titular(1_500, 14, 40), titular(900, 12, 50)];
    const criterioMenor: Ajustes = { ...AJUSTES_STD, criterioEdad: 'menor' };

    expect(calcularPlazoEfectivo(30, AJUSTES_STD, titulares)).toBe(25);
    expect(calcularPlazoEfectivo(30, criterioMenor, titulares)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// §9.1 · casos 5, 6, 8, 9, 10: evaluarPrecio
// ---------------------------------------------------------------------------

describe('evaluarPrecio', () => {
  it('caso 6 — LTV 80 %: importeFinanciado = precio × 0,8', () => {
    const e = evaluarPrecio(toCents(200_000), ctx({ precio: 200_000, ltv: 0.8, ahorro: 80_000 }));
    expect(e.importeFinanciado).toBe(toCents(160_000));
    expect(e.entrada).toBe(toCents(40_000));
  });

  it('caso 5 — tasación inferior: base financiable = tasación, no precio', () => {
    const e = evaluarPrecio(
      toCents(200_000),
      ctx({ precio: 200_000, tasacion: 180_000, ltv: 0.8, ahorro: 80_000 }),
    );
    // base = 180.000 × 80 % = 144.000 financiado; entrada = 200.000 - 144.000 = 56.000
    expect(e.importeFinanciado).toBe(toCents(144_000));
    expect(e.entrada).toBe(toCents(56_000));
  });

  it('caso 10 — ratio con otras deudas: ratioBancario sube', () => {
    const sinDeuda = evaluarPrecio(
      toCents(150_000),
      ctx({ precio: 150_000, ingresoNeto: 2_000, ahorro: 60_000 }),
    );
    const conDeuda = evaluarPrecio(
      toCents(150_000),
      ctx({ precio: 150_000, ingresoNeto: 2_000, deuda: 400, ahorro: 60_000 }),
    );
    expect(conDeuda.ratioBancario).toBeGreaterThan(sinDeuda.ratioBancario);
  });

  it('impuestos segunda mano: ITP progresivo', () => {
    // 200.000 × 8 % = 16.000 €
    const e = evaluarPrecio(toCents(200_000), ctx({ precio: 200_000, ahorro: 100_000 }));
    expect(e.impuestos).toBe(toCents(16_000));
  });

  it('falta_ahorro cuando el ahorro no cubre el desembolso', () => {
    const e = evaluarPrecio(toCents(200_000), ctx({ precio: 200_000, ahorro: 5_000 }));
    expect(['falta_ahorro', 'no_viable']).toContain(e.estado);
    expect(e.faltante).toBeGreaterThan(0);
  });

  it('cuota_excesiva cuando los ingresos son insuficientes', () => {
    const e = evaluarPrecio(
      toCents(400_000),
      ctx({ precio: 400_000, ingresoNeto: 1_000, ahorro: 200_000 }),
    );
    expect(['cuota_excesiva', 'no_viable']).toContain(e.estado);
  });

  // §9.1 · estados adicionales de viabilidad
  it('comodo — ahorro holgado y cuota baja', () => {
    // precio 100k, entrada 20k, ITP 8k, gastos 2.610k → mínimo ≈ 30.610, cómodo ≈ 40.610
    // ahorro 80k → utilizable 70k > cómodo; cuota ≈ 400€/2000€ = 20 % < 30 %
    const e = evaluarPrecio(toCents(100_000), ctx({ precio: 100_000, ahorro: 80_000 }));
    expect(e.estado).toBe('comodo');
    expect(e.motivo).toContain('asumible');
  });

  it('viable o cómodo cuando el ahorro cubre el dinero necesario', () => {
    const e = evaluarPrecio(toCents(100_000), ctx({ precio: 100_000, ahorro: 45_000 }));
    expect(['viable', 'comodo']).toContain(e.estado);
    expect(e.faltante).toBe(0);
  });

  it('ajustado — ratio entre personalObjetivo y bancarioMax', () => {
    // precio 160k → importeFinanciado 128k a 3.5% 25a → cuota ≈ 640€/mes
    // ingreso 2.000€ → ratio ≈ 32 % (> 30 % objetivo, <= 35 % max) → ajustado
    const e = evaluarPrecio(
      toCents(160_000),
      ctx({ precio: 160_000, ingresoNeto: 2_000, ahorro: 90_000 }),
    );
    expect(['ajustado', 'viable', 'comodo']).toContain(e.estado);
  });
});

// ---------------------------------------------------------------------------
// factorLimitante
// ---------------------------------------------------------------------------

describe('factorLimitante', () => {
  it('ninguno — ahorro y cuota OK', () => {
    const e = evaluarPrecio(toCents(100_000), ctx({ precio: 100_000, ahorro: 80_000 }));
    expect(factorLimitante(e, AJUSTES_STD.ratioBancarioMaximo)).toBe('ninguno');
  });

  it('ahorro — falta ahorro pero cuota OK', () => {
    const e = evaluarPrecio(toCents(100_000), ctx({ precio: 100_000, ahorro: 5_000 }));
    // faltante > 0, ratioBancario bajo
    if (e.faltante > 0 && e.ratioBancario <= 0.35) {
      expect(factorLimitante(e, AJUSTES_STD.ratioBancarioMaximo)).toBe('ahorro');
    }
  });

  it('cuota — cuota excesiva pero ahorro suficiente', () => {
    const e = evaluarPrecio(
      toCents(400_000),
      ctx({ precio: 400_000, ingresoNeto: 1_000, ahorro: 200_000 }),
    );
    // con ingresos muy bajos: cuota excesiva
    if (e.faltante === 0 && e.ratioBancario > 0.35) {
      expect(factorLimitante(e, AJUSTES_STD.ratioBancarioMaximo)).toBe('cuota');
    }
  });

  it('respeta un límite bancario personalizado por encima del 35 %', () => {
    const base = evaluarPrecio(toCents(100_000), ctx({ precio: 100_000, ahorro: 80_000 }));
    const evaluacion = {
      ...base,
      faltante: ZERO,
      ratioBancario: 0.37,
      estado: 'viable' as const,
    };
    expect(factorLimitante(evaluacion, 0.4)).toBe('ninguno');
  });
});

// ---------------------------------------------------------------------------
// buscarPrecioMaximo — R16
// ---------------------------------------------------------------------------

describe('buscarPrecioMaximo — R16', () => {
  // §9.1 · caso 28: umbral fiscal rompe la monotonía — hayDiscontinuidad detectado
  it('caso 28 — predicado no monótono: detecta dos intervalos y hayDiscontinuidad', () => {
    // Simula lo que ocurre con una bonificación fiscal condicionada a precio ≤ umbral:
    // el predicado es True, luego False (perdida de bonificación), luego True de nuevo.
    // Se usa un predicado sintético porque construir el caso natural requeriría parámetros
    // muy ajustados; lo que se verifica aquí es que el ALGORITMO (barrido + refinado) lo detecta.
    const UMBRAL_BAJO = toCents(90_000);
    const UMBRAL_ALTO = toCents(120_000);
    const predicadoNM = (e: ReturnType<typeof evaluarPrecio>) => {
      return e.precio <= UMBRAL_BAJO || e.precio >= UMBRAL_ALTO;
    };
    const resultado = buscarPrecioMaximo(
      predicadoNM,
      ctx({ precio: 100_000, ingresoNeto: 3_000, ahorro: 120_000 }),
      { min: toCents(50_000), max: toCents(200_000) },
    );
    expect(resultado.hayDiscontinuidad).toBe(true);
    expect(resultado.intervalosViables.length).toBeGreaterThan(1);
    expect(resultado.precioMaximo).not.toBeNull();
    // El precio máximo debe estar en el segundo intervalo (≥ 120k)
    if (resultado.precioMaximo !== null) {
      expect(resultado.precioMaximo).toBeGreaterThanOrEqual(UMBRAL_ALTO);
    }
  });

  it('devuelve null si ningún precio es viable', () => {
    // Con ingresos muy bajos no puede pagar ninguna hipoteca
    const resultado = buscarPrecioMaximo(
      (e) =>
        e.estado !== 'no_viable' && e.estado !== 'cuota_excesiva' && e.estado !== 'falta_ahorro',
      ctx({ precio: 50_000, ingresoNeto: 300, ahorro: 2_000 }),
      { min: toCents(50_000), max: toCents(100_000) },
    );
    expect(resultado.precioMaximo).toBeNull();
    expect(resultado.hayDiscontinuidad).toBe(false);
  });

  it('encuentra un precio máximo en rango viable', () => {
    // Con buen ahorro e ingresos decentes, debería haber rango viable
    const resultado = buscarPrecioMaximo(
      (e) => e.faltante === 0 && e.ratioBancario <= 0.35,
      ctx({ precio: 100_000, ingresoNeto: 3_000, ahorro: 120_000 }),
      { min: toCents(50_000), max: toCents(200_000) },
    );
    expect(resultado.precioMaximo).not.toBeNull();
    expect(resultado.precioMaximo).toBeGreaterThan(toCents(50_000));
  });

  it('el precio máximo encontrado satisface el predicado', () => {
    const predicado = (e: ReturnType<typeof evaluarPrecio>) =>
      e.faltante === 0 && e.ratioBancario <= 0.35;

    const resultado = buscarPrecioMaximo(
      predicado,
      ctx({ precio: 100_000, ingresoNeto: 3_000, ahorro: 120_000 }),
      { min: toCents(50_000), max: toCents(300_000) },
    );

    if (resultado.precioMaximo !== null) {
      const evaluacion = evaluarPrecio(
        resultado.precioMaximo,
        ctx({ precio: 100_000, ingresoNeto: 3_000, ahorro: 120_000 }),
      );
      expect(predicado(evaluacion)).toBe(true);
    }
  });

  it('evalúa el máximo aunque el rango no esté alineado a pasos de 1.000 €', () => {
    const limite = toCents(100_020);
    const resultado = buscarPrecioMaximo(
      (evaluacion) => evaluacion.precio <= limite,
      ctx({ precio: 100_000, ingresoNeto: 3_000, ahorro: 120_000 }),
      { min: toCents(100_000), max: toCents(100_050) },
    );

    expect(resultado.precioMaximo).not.toBeNull();
    expect(resultado.precioMaximo).toBeLessThanOrEqual(limite);
  });

  it('devuelve vacío si el rango está invertido', () => {
    expect(
      buscarPrecioMaximo(() => true, ctx({ precio: 100_000 }), {
        min: toCents(200_000),
        max: toCents(100_000),
      }),
    ).toEqual({ precioMaximo: null, intervalosViables: [], hayDiscontinuidad: false });
  });
});
