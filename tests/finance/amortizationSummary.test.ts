import { describe, expect, it } from 'vitest';
import { toCents, ZERO } from '@/core/money';
import type { LineaMensual } from '@/domain/types';
import { agruparAmortizacionPorAnio } from '@/finance/amortizationSummary';

function linea(
  numero: number,
  valores: Partial<
    Pick<
      LineaMensual,
      | 'cuota'
      | 'principal'
      | 'intereses'
      | 'amortizacionExtraordinaria'
      | 'costesVinculados'
      | 'comisiones'
      | 'pendiente'
    >
  > = {},
): LineaMensual {
  return {
    numero,
    fecha: `2026-${String(Math.max(1, numero)).padStart(2, '0')}-01`,
    tinAplicado: 0.03,
    cuota: ZERO,
    intereses: ZERO,
    principal: ZERO,
    amortizacionExtraordinaria: ZERO,
    pendiente: ZERO,
    costesVinculados: ZERO,
    comisiones: ZERO,
    ...valores,
  };
}

describe('resumen anual del cuadro de amortización', () => {
  it('incluye cuotas, pagos extra, vinculaciones y comisiones en el total pagado', () => {
    const resumen = agruparAmortizacionPorAnio([
      linea(0, { comisiones: toCents(1_000) }),
      linea(1, {
        cuota: toCents(800),
        principal: toCents(500),
        intereses: toCents(300),
        amortizacionExtraordinaria: toCents(2_000),
        costesVinculados: toCents(25),
        comisiones: toCents(20),
        pendiente: toCents(97_500),
      }),
    ])[0];

    expect(resumen?.pagoTotal).toBe(toCents(2_845));
    expect(resumen?.deudaReducida).toBe(toCents(2_500));
    expect(resumen?.costesVinculados).toBe(toCents(25));
    expect(resumen?.intereses).toBe(toCents(300));
  });

  it('no mezcla el desembolso inicial con el primer año de cuotas', () => {
    const resumen = agruparAmortizacionPorAnio([
      linea(0, { comisiones: toCents(1_000) }),
      linea(1, { cuota: toCents(800) }),
    ])[0];

    expect(resumen?.pagoTotal).toBe(toCents(800));
  });
});
