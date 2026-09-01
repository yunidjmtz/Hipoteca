import { describe, expect, it } from 'vitest';
import { subtractCents, toCents, ZERO } from '@/core/money';
import { evaluarEncajePlanVivienda } from '@/finance/housingPlanFit';
import type { EstadoPersistido, ViviendaGuardada } from '@/domain/types';
import { ESTADO_INICIAL } from '@/storage/defaults';

function vivienda(precioEuros: number): ViviendaGuardada {
  return {
    id: 'vivienda-prueba',
    nombre: 'Vivienda de prueba',
    fecha: '2026-08-08',
    direccion: 'Calle Mayor, 1',
    precioVenta: toCents(precioEuros),
    presupuestoReforma: ZERO,
    reforma: '',
    superficieM2: 80,
    habitaciones: 2,
    esExterior: false,
    tieneTrastero: false,
    tieneGaraje: false,
    reformas: [],
    notas: '',
  } as unknown as ViviendaGuardada;
}

function estadoConPlan({
  precioObjetivo = 100_000,
  ingreso = 5_000,
  ahorro = 70_000,
}: {
  precioObjetivo?: number;
  ingreso?: number;
  ahorro?: number;
} = {}): EstadoPersistido {
  return {
    ...ESTADO_INICIAL,
    preferencias: { ...ESTADO_INICIAL.preferencias, precioObjetivo: toCents(precioObjetivo) },
    perfil: {
      ...ESTADO_INICIAL.perfil,
      titulares: [{ ...ESTADO_INICIAL.perfil.titulares[0], netoPorPaga: toCents(ingreso) }] as [
        EstadoPersistido['perfil']['titulares'][number],
      ],
      ahorrosActuales: toCents(ahorro),
    },
  };
}

describe('evaluarEncajePlanVivienda', () => {
  it('no da por viable una vivienda solo por existir un precio cómodo', () => {
    const resultado = evaluarEncajePlanVivienda(
      vivienda(100_000),
      estadoConPlan({ ingreso: 0, ahorro: 0 }),
      '2026-08-08',
    );

    expect(resultado.estado).toBe('no_viable');
    expect(resultado.limitante).toBe('ingresos');
    expect(resultado.diferenciaPresupuesto).toBe(toCents(100_000));
  });

  it('marca dentro del plan cuando presupuesto, cuota y ahorro son coherentes', () => {
    const resultado = evaluarEncajePlanVivienda(vivienda(100_000), estadoConPlan(), '2026-08-08');

    expect(resultado.estado).toBe('en_plan');
    expect(resultado.evaluacion).not.toBeNull();
  });

  it('calcula el plan desde la capacidad cómoda, no desde el precio guardado', () => {
    const resultado = evaluarEncajePlanVivienda(vivienda(150_000), estadoConPlan(), '2026-08-08');

    expect(resultado.estado).toBe('en_plan');
    expect(resultado.diferenciaPresupuesto).toBe(ZERO);
  });

  it('marca como no viable una vivienda que supera el plan y cuya cuota no es asumible', () => {
    const resultado = evaluarEncajePlanVivienda(
      vivienda(500_000),
      estadoConPlan({ ingreso: 1_000, ahorro: 300_000 }),
      '2026-08-08',
    );

    expect(resultado.estado).toBe('no_viable');
    expect(resultado.limitante).toBe('ingresos');
    expect(resultado.prestamoMaximoPorIngresos).toBeLessThan(
      resultado.evaluacion?.importeFinanciado ?? ZERO,
    );
  });

  it('explica cuando la edad no deja ningún plazo hipotecario disponible', () => {
    const estado = estadoConPlan({ ingreso: 5_000, ahorro: 300_000 });
    const titular = estado.perfil.titulares[0];
    const resultado = evaluarEncajePlanVivienda(
      vivienda(100_000),
      {
        ...estado,
        perfil: {
          ...estado.perfil,
          titulares: [{ ...titular, edad: estado.ajustes.edadMaximaAlVencimiento }],
        },
      },
      '2026-08-08',
    );

    expect(resultado.estado).toBe('no_viable');
    expect(resultado.limitante).toBe('ingresos');
    expect(resultado.prestamoMaximoPorIngresos).toBe(ZERO);
    expect(resultado.motivo).toMatch(/edad/i);
  });

  it('incluye la reforma en el ahorro necesario para considerar la compra alcanzable', () => {
    const conGranReforma = {
      ...vivienda(100_000),
      reformas: [{ id: 'integral', concepto: 'Reforma integral', costeEstimado: toCents(700_000) }],
    };
    const resultado = evaluarEncajePlanVivienda(
      conGranReforma,
      estadoConPlan({ ingreso: 5_000, ahorro: 70_000 }),
      '2026-08-08',
    );

    expect(resultado.estado).toBe('no_viable');
    expect(resultado.limitante).toBe('ahorro');
  });

  it('ignora un antiguo precio objetivo vacío al calcular el plan', () => {
    const resultado = evaluarEncajePlanVivienda(
      vivienda(150_000),
      estadoConPlan({ precioObjetivo: 0 }),
      '2026-08-08',
    );

    expect(resultado.estado).toBe('en_plan');
  });

  it('distingue correctamente un objetivo alcanzable exactamente en un mes', () => {
    const base = estadoConPlan({ precioObjetivo: 150_000, ingreso: 5_000, ahorro: 0 });
    const preliminar = evaluarEncajePlanVivienda(vivienda(150_000), base, '2026-08-08');
    const objetivo = preliminar.evaluacion?.dineroRecomendado ?? ZERO;
    const resultado = evaluarEncajePlanVivienda(
      vivienda(150_000),
      {
        ...base,
        perfil: { ...base.perfil, ahorrosActuales: subtractCents(objetivo, toCents(0.01)) },
      },
      '2026-08-08',
    );

    expect(resultado.estado).toBe('en_plan');
    expect(resultado.mesesHastaAlcanzar).toBe(1);
    expect(resultado.motivo).toMatch(/1 mes\./);
  });

  it('usa el singular al alcanzar exactamente en un mes una vivienda del plan', () => {
    const base = estadoConPlan({ precioObjetivo: 100_000, ingreso: 5_000, ahorro: 0 });
    const preliminar = evaluarEncajePlanVivienda(vivienda(150_000), base, '2026-08-08');
    const objetivo = preliminar.evaluacion?.dineroRecomendado ?? ZERO;
    const resultado = evaluarEncajePlanVivienda(
      vivienda(150_000),
      {
        ...base,
        perfil: {
          ...base.perfil,
          ahorrosActuales: subtractCents(objetivo, toCents(0.01)),
        },
      },
      '2026-08-08',
    );

    expect(resultado.estado).toBe('en_plan');
    expect(resultado.mesesHastaAlcanzar).toBe(1);
    expect(resultado.motivo).toMatch(/1 mes\./);
  });

  it('vuelve a comprobar la cuota con el precio futuro al proyectar el ahorro', () => {
    const base = estadoConPlan({ precioObjetivo: 130_000, ingreso: 1_500, ahorro: 30_000 });
    const resultado = evaluarEncajePlanVivienda(
      vivienda(130_000),
      {
        ...base,
        perfil: {
          ...base.perfil,
          gastosFijos: [
            {
              id: 'gasto-actual',
              concepto: 'Gasto mensual',
              importe: toCents(500),
              periodicidad: 'mensual',
            },
          ],
        },
        ajustes: { ...base.ajustes, crecimientoAnualPrecioVivienda: 0.1 },
      },
      '2026-08-08',
    );

    expect(resultado.evaluacion?.ratioBancario).toBeLessThanOrEqual(
      base.ajustes.ratioBancarioMaximo,
    );
    expect(resultado.estado).toBe('no_viable');
    expect(resultado.limitante).toBe('ingresos');
    expect(resultado.motivo).toMatch(/precio proyectado/i);
  });
});
