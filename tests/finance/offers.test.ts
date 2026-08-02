import { describe, it, expect } from 'vitest';
import {
  compararOfertas,
  calcularMetricasOferta,
  PESOS_POR_DEFECTO,
  sonOfertasComparables,
} from '@/finance/offers';
import { toCents, ZERO } from '@/core/money';
import type { OfertaBancaria, EscenarioHipoteca } from '@/domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crearOferta(
  id: string,
  tin: number,
  importeEuros: number,
  plazoAnios: number,
  comisionAperturaDecimal = 0,
): OfertaBancaria {
  const esc: EscenarioHipoteca = {
    id,
    titulo: `Oferta ${id}`,
    precioCompra: toCents(importeEuros * 1.25),
    valorTasacion: toCents(importeEuros * 1.25),
    ltv: 0.8,
    importeSolicitado: toCents(importeEuros),
    plazoAnios,
    tipo: 'fija',
    tinFijo: tin,
    sueloTin: 0,
    comisiones: {
      apertura: comisionAperturaDecimal,
      amortizacionParcial: 0,
      amortizacionTotal: 0,
      subrogacion: ZERO,
      novacion: ZERO,
      otras: ZERO,
    },
    vinculaciones: [],
    fechaPrimeraCuota: '2025-01-01',
  };
  return {
    id,
    banco: `Banco ${id}`,
    nombre: `Oferta ${id}`,
    fecha: '2025-01-01',
    estado: 'estudio',
    escenario: esc,
    notas: '',
  };
}

// ---------------------------------------------------------------------------
// compararOfertas
// ---------------------------------------------------------------------------

describe('compararOfertas', () => {
  it('retorna vacío si no hay ofertas', () => {
    expect(compararOfertas([])).toEqual([]);
  });

  it('con una sola oferta, su puntuación es 100', () => {
    const resultados = compararOfertas([crearOferta('x', 0.035, 100_000, 20)]);
    expect(resultados[0]?.puntuacion).toBeCloseTo(100, 1);
  });

  it('con una sola oferta, es la mejor global', () => {
    const resultados = compararOfertas([crearOferta('x', 0.035, 100_000, 20)]);
    expect(resultados[0]?.esMejorGlobal).toBe(true);
  });

  it('la oferta con menor TIN aparece primera (mayor puntuación)', () => {
    const barata = crearOferta('barata', 0.025, 150_000, 25);
    const cara = crearOferta('cara', 0.045, 150_000, 25);
    const resultados = compararOfertas([cara, barata]);
    expect(resultados[0]?.oferta.id).toBe('barata');
  });

  it('marca correctamente esLaMenorCuota', () => {
    const b = crearOferta('b', 0.025, 150_000, 25);
    const c = crearOferta('c', 0.045, 150_000, 25);
    const resultados = compararOfertas([c, b]);
    const marcada = resultados.find((r) => r.esLaMenorCuota);
    expect(marcada?.oferta.id).toBe('b');
  });

  it('marca correctamente esLaMenorCosteReal', () => {
    const b = crearOferta('b', 0.025, 150_000, 25);
    const c = crearOferta('c', 0.045, 150_000, 25);
    const resultados = compararOfertas([c, b]);
    const marcada = resultados.find((r) => r.esLaMenorCosteReal);
    expect(marcada?.oferta.id).toBe('b');
  });

  it('la comisión de apertura penaliza el coste real y el desembolso', () => {
    const sinComision = crearOferta('sin', 0.035, 100_000, 20, 0);
    const conComision = crearOferta('con', 0.035, 100_000, 20, 0.01);
    const metricasSin = calcularMetricasOferta(sinComision);
    const metricasCon = calcularMetricasOferta(conComision);
    expect(metricasCon.costeRealTotal).toBeGreaterThan(metricasSin.costeRealTotal);
    expect(metricasCon.desembolsoInicial).toBeGreaterThan(metricasSin.desembolsoInicial);
  });

  it('el desglose de puntuación ponderado reproduce la puntuación total', () => {
    const oferta = crearOferta('x', 0.035, 100_000, 20);
    const resultados = compararOfertas([oferta]);
    const r = resultados[0];
    if (r !== undefined) {
      const suma =
        r.desglosePuntuacion.costeReal * PESOS_POR_DEFECTO.costeReal +
        r.desglosePuntuacion.cuota * PESOS_POR_DEFECTO.cuota +
        r.desglosePuntuacion.desembolsoInicial * PESOS_POR_DEFECTO.desembolsoInicial +
        r.desglosePuntuacion.flexibilidad * PESOS_POR_DEFECTO.flexibilidad +
        r.desglosePuntuacion.vinculaciones * PESOS_POR_DEFECTO.vinculaciones;
      expect(suma).toBeCloseTo(r.puntuacion, 1);
    }
  });

  it('marca esLaMenorTaeOficial cuando existe', () => {
    const b: OfertaBancaria = { ...crearOferta('b', 0.025, 150_000, 25), taeOficial: 0.028 };
    const c: OfertaBancaria = { ...crearOferta('c', 0.045, 150_000, 25), taeOficial: 0.048 };
    const resultados = compararOfertas([c, b]);
    const marcada = resultados.find((r) => r.esLaMenorTaeOficial);
    expect(marcada?.oferta.id).toBe('b');
  });

  it('puntúa la flexibilidad y las vinculaciones obligatorias activas', () => {
    const flexible = crearOferta('flexible', 0.03, 150_000, 25);
    const rigidaBase = crearOferta('rigida', 0.03, 150_000, 25);
    const rigida: OfertaBancaria = {
      ...rigidaBase,
      escenario: {
        ...rigidaBase.escenario,
        comisiones: {
          ...rigidaBase.escenario.comisiones,
          amortizacionParcial: 0.02,
          amortizacionTotal: 0.02,
        },
        vinculaciones: [
          {
            id: 'seguro',
            nombre: 'Seguro',
            activo: true,
            bonificacionTin: 0,
            costeInicial: toCents(300),
            costeAnual: ZERO,
            incrementoAnual: 0,
            aniosExigidos: null,
            obligatorio: true,
            observaciones: '',
          },
        ],
      },
    };

    const resultados = compararOfertas([rigida, flexible]);
    const resultadoFlexible = resultados.find((r) => r.oferta.id === 'flexible');
    const resultadoRigido = resultados.find((r) => r.oferta.id === 'rigida');

    expect(resultadoFlexible?.metricas.indiceFlexibilidad).toBeGreaterThan(
      resultadoRigido?.metricas.indiceFlexibilidad ?? 0,
    );
    expect(resultadoRigido?.metricas.numVinculacionesObligatorias).toBe(1);
  });

  it('no considera comparables compras con precios distintos', () => {
    expect(
      sonOfertasComparables([
        crearOferta('a', 0.03, 100_000, 20),
        crearOferta('b', 0.03, 150_000, 20),
      ]),
    ).toBe(false);
  });

  it('permite comparar distinta financiación sobre la misma compra', () => {
    const a = crearOferta('a', 0.03, 100_000, 20);
    const bBase = crearOferta('b', 0.03, 90_000, 25);
    const b = {
      ...bBase,
      escenario: { ...bBase.escenario, precioCompra: a.escenario.precioCompra },
    };
    expect(sonOfertasComparables([a, b])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calcularMetricasOferta
// ---------------------------------------------------------------------------

describe('calcularMetricasOferta', () => {
  it('la cuota inicial es positiva', () => {
    const m = calcularMetricasOferta(crearOferta('x', 0.03, 150_000, 20));
    expect(m.cuotaInicial).toBeGreaterThan(ZERO);
  });

  it('el coste real total supera el capital (incluye intereses)', () => {
    const m = calcularMetricasOferta(crearOferta('x', 0.03, 150_000, 20));
    expect(m.costeRealTotal).toBeGreaterThan(toCents(150_000));
  });

  it('indiceFlexibilidad = 100 sin comisiones de amortización', () => {
    const m = calcularMetricasOferta(crearOferta('x', 0.03, 150_000, 20));
    expect(m.indiceFlexibilidad).toBe(100);
  });

  it('indiceFlexibilidad < 100 con comisiones de amortización', () => {
    const oferta = crearOferta('x', 0.03, 150_000, 20);
    const ofertaConComision: OfertaBancaria = {
      ...oferta,
      escenario: {
        ...oferta.escenario,
        comisiones: {
          ...oferta.escenario.comisiones,
          amortizacionParcial: 0.02,
        },
      },
    };
    const m = calcularMetricasOferta(ofertaConComision);
    expect(m.indiceFlexibilidad).toBeLessThan(100);
  });

  it('una oferta mixta informa la cuota del primer mes variable', () => {
    const oferta = crearOferta('mixta', 0.03, 150_000, 25);
    const mixta: OfertaBancaria = {
      ...oferta,
      escenario: {
        ...oferta.escenario,
        tipo: 'mixta',
        mixtaTinFijo: 0.025,
        mixtaAniosFijos: 5,
        euribor: 0.04,
        diferencial: 0.01,
        periodicidadRevision: 'anual',
      },
    };

    const metricas = calcularMetricasOferta(mixta);
    expect(metricas.cuotaPostFija).not.toBeNull();
    expect(metricas.cuotaPostFija).toBeGreaterThan(metricas.cuotaInicial);
  });

  it('incluye la aportación al precio en el desembolso y el coste total', () => {
    const oferta = crearOferta('x', 0.03, 100_000, 20);
    const metricas = calcularMetricasOferta(oferta);
    expect(metricas.desembolsoInicial).toBe(toCents(25_000));
    expect(metricas.costeRealTotal).toBeGreaterThan(oferta.escenario.precioCompra);
  });

  it('ignora el coste inicial de productos desactivados', () => {
    const oferta = crearOferta('x', 0.03, 100_000, 20);
    const conProductoInactivo: OfertaBancaria = {
      ...oferta,
      escenario: {
        ...oferta.escenario,
        vinculaciones: [
          {
            id: 'inactivo',
            nombre: 'Seguro descartado',
            activo: false,
            bonificacionTin: 0,
            costeInicial: toCents(2_000),
            costeAnual: toCents(500),
            incrementoAnual: 0,
            aniosExigidos: null,
            obligatorio: false,
            observaciones: '',
          },
        ],
      },
    };
    expect(calcularMetricasOferta(conProductoInactivo)).toEqual(calcularMetricasOferta(oferta));
  });
});
