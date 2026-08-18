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
        r.desglosePuntuacion.resiliencia * PESOS_POR_DEFECTO.resiliencia +
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

  it('ignora una TAE oficial cero heredada de datos antiguos', () => {
    const sinTae: OfertaBancaria = { ...crearOferta('sin-tae', 0.025, 150_000, 25), taeOficial: 0 };
    const conTae: OfertaBancaria = {
      ...crearOferta('con-tae', 0.03, 150_000, 25),
      taeOficial: 0.034,
    };
    const resultados = compararOfertas([sinTae, conTae]);

    expect(resultados.find((r) => r.esLaMenorTaeOficial)?.oferta.id).toBe('con-tae');
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

  it('mantiene la puntuación entre 0 y 100 aunque los pesos no sumen 100 %', () => {
    const resultados = compararOfertas(
      [crearOferta('a', 0.025, 150_000, 25), crearOferta('b', 0.045, 150_000, 25)],
      {
        costeReal: 1,
        cuota: 1,
        desembolsoInicial: 1,
        resiliencia: 1,
        flexibilidad: 1,
        vinculaciones: 1,
      },
    );

    expect(resultados.every((resultado) => resultado.puntuacion <= 100)).toBe(true);
  });

  it('usa los pesos por defecto si todos los pesos configurados son cero', () => {
    const ofertas = [crearOferta('a', 0.025, 150_000, 25), crearOferta('b', 0.045, 150_000, 25)];
    const conPesosCero = compararOfertas(ofertas, {
      costeReal: 0,
      cuota: 0,
      desembolsoInicial: 0,
      resiliencia: 0,
      flexibilidad: 0,
      vinculaciones: 0,
    });
    const porDefecto = compararOfertas(ofertas);

    expect(conPesosCero.map((resultado) => resultado.puntuacion)).toEqual(
      porDefecto.map((resultado) => resultado.puntuacion),
    );
  });

  it('no convierte una diferencia mínima de coste en una puntuación de cero', () => {
    const barata = crearOferta('barata', 0.03, 150_000, 25);
    const casiIgual = crearOferta('casi-igual', 0.0301, 150_000, 25);
    const resultado = compararOfertas([barata, casiIgual]).find(
      (item) => item.oferta.id === 'casi-igual',
    );

    expect(resultado?.desglosePuntuacion.costeReal).toBeGreaterThan(95);
  });

  it('mantiene una escala gradual cuando el mejor desembolso es cero', () => {
    const sinEntradaBase = crearOferta('sin-entrada', 0.03, 100_000, 25);
    const sinEntrada: OfertaBancaria = {
      ...sinEntradaBase,
      escenario: {
        ...sinEntradaBase.escenario,
        precioCompra: sinEntradaBase.escenario.importeSolicitado,
      },
    };
    const conEntradaBase = crearOferta('con-entrada', 0.03, 95_000, 25);
    const conEntrada: OfertaBancaria = {
      ...conEntradaBase,
      escenario: {
        ...conEntradaBase.escenario,
        precioCompra: sinEntrada.escenario.precioCompra,
      },
    };
    const resultado = compararOfertas([sinEntrada, conEntrada]).find(
      (item) => item.oferta.id === 'con-entrada',
    );

    expect(resultado?.desglosePuntuacion.desembolsoInicial).toBeCloseTo(50, 0);
  });

  it('penaliza el riesgo de subida de una hipoteca variable', () => {
    const fija = crearOferta('fija', 0.03, 150_000, 25);
    const variableBase = crearOferta('variable', 0.03, 150_000, 25);
    const variable: OfertaBancaria = {
      ...variableBase,
      escenario: {
        ...variableBase.escenario,
        tipo: 'variable',
        euribor: 0.02,
        diferencial: 0.01,
        periodicidadRevision: 'anual',
      },
    };
    const resultados = compararOfertas([variable, fija]);
    const metricaFija = resultados.find((item) => item.oferta.id === 'fija')?.metricas;
    const metricaVariable = resultados.find((item) => item.oferta.id === 'variable')?.metricas;

    expect(metricaVariable?.cuotaTensionada).toBeGreaterThan(metricaVariable?.cuotaInicial ?? ZERO);
    expect(metricaVariable?.indiceResiliencia).toBeLessThan(metricaFija?.indiceResiliencia ?? 0);
    expect(resultados[0]?.oferta.id).toBe('fija');
  });

  it('no recomienda una oferta rechazada aunque sea la más barata', () => {
    const rechazada: OfertaBancaria = {
      ...crearOferta('rechazada', 0.01, 150_000, 25),
      estado: 'rechazada',
    };
    const vigente = crearOferta('vigente', 0.04, 150_000, 25);
    const resultados = compararOfertas([rechazada, vigente]);

    expect(resultados[0]?.oferta.id).toBe('vigente');
    expect(resultados[0]?.puntuacion).toBeCloseTo(100, 1);
    expect(resultados.find((item) => item.oferta.id === 'rechazada')?.esMejorGlobal).toBe(false);
  });

  it('mantiene una comparación informativa cuando todas las ofertas están rechazadas', () => {
    const primera = { ...crearOferta('r1', 0.025, 150_000, 25), estado: 'rechazada' as const };
    const segunda = { ...crearOferta('r2', 0.035, 150_000, 25), estado: 'rechazada' as const };
    const resultados = compararOfertas([primera, segunda]);

    expect(resultados).toHaveLength(2);
    expect(resultados.every((resultado) => !resultado.esAptaParaRecomendacion)).toBe(true);
    expect(resultados.every((resultado) => !resultado.esMejorGlobal)).toBe(true);
  });

  it('no recomienda una oferta que incumple el esfuerzo en el escenario adverso', () => {
    const resultados = compararOfertas(
      [crearOferta('arriesgada', 0.03, 200_000, 25)],
      PESOS_POR_DEFECTO,
      {
        ingresoMensual: toCents(1_500),
        otrasDeudasMensuales: toCents(200),
        ratioBancarioMaximo: 0.35,
      },
    );

    expect(resultados[0]?.esAptaParaRecomendacion).toBe(false);
    expect(resultados[0]?.esMejorGlobal).toBe(false);
  });

  it('no recomienda una oferta cuyo efectivo total supera los ahorros', () => {
    const resultados = compararOfertas(
      [crearOferta('sin-ahorro', 0.03, 100_000, 25)],
      PESOS_POR_DEFECTO,
      {
        ingresoMensual: toCents(5_000),
        otrasDeudasMensuales: ZERO,
        ratioBancarioMaximo: 0.35,
        ahorrosDisponibles: toCents(20_000),
        gastosCompraNoFinanciados: toCents(12_000),
      },
    );

    expect(resultados[0]?.metricas.efectivoTotalNecesario).toBe(toCents(37_000));
    expect(resultados[0]?.metricas.ahorroSuficiente).toBe(false);
    expect(resultados[0]?.esAptaParaRecomendacion).toBe(false);
  });

  it('no considera comparables compras con precios distintos', () => {
    const ofertas = [crearOferta('a', 0.03, 100_000, 20), crearOferta('b', 0.03, 150_000, 20)];
    expect(sonOfertasComparables(ofertas)).toBe(false);
    expect(compararOfertas(ofertas).some((resultado) => resultado.esMejorGlobal)).toBe(false);
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
