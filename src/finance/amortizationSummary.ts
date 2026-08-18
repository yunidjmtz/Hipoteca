import { type Cents, sumCents } from '@/core/money';
import type { LineaMensual } from '@/domain/types';

export interface ResumenAnualAmortizacion {
  readonly numero: number;
  readonly desde: string;
  readonly hasta: string;
  readonly pagoTotal: Cents;
  readonly intereses: Cents;
  readonly deudaReducida: Cents;
  readonly extras: Cents;
  readonly costesVinculados: Cents;
  readonly pendiente: Cents;
}

function sumarPagoLinea(linea: LineaMensual): Cents {
  return sumCents([
    linea.cuota,
    linea.amortizacionExtraordinaria,
    linea.costesVinculados,
    linea.comisiones,
  ]);
}

function deudaReducidaEnLinea(linea: LineaMensual): Cents {
  return sumCents([linea.principal, linea.amortizacionExtraordinaria]);
}

/** Resume únicamente las cuotas (líneas 1..n); el desembolso inicial queda fuera del cuadro anual. */
export function agruparAmortizacionPorAnio(
  lineas: readonly LineaMensual[],
): ResumenAnualAmortizacion[] {
  const grupos = new Map<number, LineaMensual[]>();

  for (const linea of lineas) {
    if (linea.numero <= 0) continue;
    const numeroAnio = Math.floor((linea.numero - 1) / 12) + 1;
    const grupo = grupos.get(numeroAnio) ?? [];
    grupo.push(linea);
    grupos.set(numeroAnio, grupo);
  }

  return [...grupos.entries()].map(([numero, cuotas]) => {
    const primera = cuotas[0];
    const ultima = cuotas.at(-1);
    if (primera === undefined || ultima === undefined) {
      throw new Error('Un año del cuadro de amortización no puede estar vacío.');
    }

    return {
      numero,
      desde: primera.fecha,
      hasta: ultima.fecha,
      pagoTotal: sumCents(cuotas.map(sumarPagoLinea)),
      intereses: sumCents(cuotas.map((linea) => linea.intereses)),
      deudaReducida: sumCents(cuotas.map(deudaReducidaEnLinea)),
      extras: sumCents(cuotas.map((linea) => linea.amortizacionExtraordinaria)),
      costesVinculados: sumCents(cuotas.map((linea) => linea.costesVinculados)),
      pendiente: ultima.pendiente,
    };
  });
}
