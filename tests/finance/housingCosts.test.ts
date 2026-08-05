import { describe, expect, it } from 'vitest';
import { toCents, ZERO } from '@/core/money';
import type { ViviendaGuardada } from '@/domain/types';
import { calcularCosteVivienda } from '@/finance/housingCosts';
import { ESTADO_INICIAL } from '@/storage/defaults';

const VIVIENDA: ViviendaGuardada = {
  id: 'vivienda-1',
  nombre: 'Vivienda de prueba',
  fecha: '2026-08-05',
  direccion: 'Calle Mayor, 1',
  precioVenta: toCents(170_000),
  presupuestoReforma: toCents(10_000),
  reforma: 'Cocina',
  superficieM2: 85,
  esExterior: true,
  tieneTrastero: false,
  tieneGaraje: false,
  reformas: [{ id: 'cocina', concepto: 'Cocina', costeEstimado: toCents(10_000) }],
  notas: '',
};

describe('calcularCosteVivienda', () => {
  it('suma precio, impuestos autonómicos, gastos de compra y la reforma concreta', () => {
    const estado = {
      ...ESTADO_INICIAL,
      preferencias: { ...ESTADO_INICIAL.preferencias, ccaa: 'Aragón' },
    };

    const resultado = calcularCosteVivienda(VIVIENDA, estado);

    expect(resultado.costeAntesImpuestos).toBe(toCents(180_000));
    expect(resultado.gastosCompra.impuestos).toBe(toCents(13_600));
    expect(resultado.gastosCompra.inmobiliaria).toBe(toCents(6_171));
    expect(resultado.gastosCompra.gastosObligatorios).toBe(toCents(2_610));
    expect(resultado.costeTotal).toBe(toCents(202_381));
  });

  it('reemplaza la reforma global para no contarla dos veces', () => {
    const estado = {
      ...ESTADO_INICIAL,
      preferencias: { ...ESTADO_INICIAL.preferencias, ccaa: 'Aragón' },
      gastos: { ...ESTADO_INICIAL.gastos, reforma: toCents(50_000) },
    };

    const resultadoConReformaGlobal = calcularCosteVivienda(VIVIENDA, estado);
    const resultadoSinReformaGlobal = calcularCosteVivienda(VIVIENDA, {
      ...estado,
      gastos: { ...estado.gastos, reforma: ZERO },
    });

    expect(resultadoConReformaGlobal.costeTotal).toBe(resultadoSinReformaGlobal.costeTotal);
  });
});
