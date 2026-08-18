import { type Cents, ZERO, addCents, subtractCents, sumCents } from '@/core/money';
import type { FlujoInput, ProductoVinculado } from '@/domain/types';
import {
  construirFlujoDeCaja,
  calcularCosteVinculacionMes,
  calcularBonificacionTotal,
} from './mortgage';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type RecomendacionVinculacion = 'compensa' | 'no_compensa' | 'indeterminado';

export interface AnalisisVinculacion {
  id: string;
  nombre: string;
  bonificacionEfectiva: number; // decimal
  costeTotalCents: Cents; // coste inicial + costes periódicos
  interesesSin: Cents; // intereses sin esta vinculación activa
  interesesCon: Cents; // intereses con esta vinculación activa
  beneficioNeto: Cents; // interesesSin − interesesCon − costeTotalCents
  recomendacion: RecomendacionVinculacion;
  puntoEquilibrioMeses: number | null; // null si nunca se alcanza
}

// ---------------------------------------------------------------------------
// Análisis de una vinculación individual — R13
// ---------------------------------------------------------------------------

/**
 * Analiza el beneficio neto de activar una vinculación.
 *
 * inputBase debe tener la vinculación con activo = true; construye internamente
 * el escenario sin ella para calcular la diferencia de intereses.
 */
export function analizarVinculacion(
  vinculacion: ProductoVinculado,
  inputBase: FlujoInput,
): AnalisisVinculacion {
  const { plazoMeses } = inputBase;

  // Flujo base (con vinculación activa)
  const flujoCon = construirFlujoDeCaja(inputBase);

  // Flujo sin esta vinculación
  const inputSin: FlujoInput = {
    ...inputBase,
    vinculaciones: inputBase.vinculaciones.map((v) =>
      v.id === vinculacion.id ? { ...v, activo: false } : v,
    ),
  };
  const flujoSin = construirFlujoDeCaja(inputSin);

  // Intereses totales en cada escenario
  const interesesCon = sumCents(flujoCon.slice(1).map((l) => l.intereses));
  const interesesSin = sumCents(flujoSin.slice(1).map((l) => l.intereses));

  // Coste total de la vinculación (coste inicial + suma de costes mensuales)
  let costeTotalCents: Cents = vinculacion.costeInicial;
  for (let k = 1; k <= plazoMeses; k++) {
    costeTotalCents = addCents(costeTotalCents, calcularCosteVinculacionMes(vinculacion, k));
  }

  // beneficioNeto = ahorro_en_intereses − coste_producto
  const beneficioNeto = subtractCents(subtractCents(interesesSin, interesesCon), costeTotalCents);

  // Bonificación efectiva (cap de bonificacionMaxima si está definido)
  const bonificacionEfectiva =
    vinculacion.bonificacionMaxima !== undefined
      ? Math.min(vinculacion.bonificacionTin, vinculacion.bonificacionMaxima)
      : vinculacion.bonificacionTin;

  // Recomendación: tolerancia de 100 céntimos (1 €) para "indeterminado"
  let recomendacion: RecomendacionVinculacion;
  if (Math.abs(beneficioNeto) <= 100) {
    recomendacion = 'indeterminado';
  } else {
    recomendacion = beneficioNeto > 0 ? 'compensa' : 'no_compensa';
  }

  // Punto de equilibrio: mes en el que el ahorro acumulado supera el coste acumulado
  let ahorroCumulativo: Cents = ZERO;
  let costeCumulativo: Cents = vinculacion.costeInicial;
  let puntoEquilibrioMeses: number | null = null;

  for (let k = 1; k <= plazoMeses; k++) {
    // El punto de equilibrio es de caja: compara lo que se deja de pagar en
    // cuotas, no solo la diferencia de intereses contables de cada mes.
    const cuotaConK = flujoCon[k]?.cuota ?? ZERO;
    const cuotaSinK = flujoSin[k]?.cuota ?? ZERO;
    const ahorroMes = subtractCents(cuotaSinK, cuotaConK);
    const costeMes = calcularCosteVinculacionMes(vinculacion, k);

    ahorroCumulativo = addCents(ahorroCumulativo, ahorroMes);
    costeCumulativo = addCents(costeCumulativo, costeMes);

    if (puntoEquilibrioMeses === null && ahorroCumulativo >= costeCumulativo) {
      puntoEquilibrioMeses = k;
    }
  }

  return {
    id: vinculacion.id,
    nombre: vinculacion.nombre,
    bonificacionEfectiva,
    costeTotalCents,
    interesesSin,
    interesesCon,
    beneficioNeto,
    recomendacion,
    puntoEquilibrioMeses,
  };
}

// ---------------------------------------------------------------------------
// TIN efectivo con vinculaciones activas
// ---------------------------------------------------------------------------

/**
 * TIN neto de bonificaciones en el mes 1 (para mostrar en la UI).
 * Usa calcularBonificacionTotal para aplicar caps por producto.
 */
export function tinEfectivoConVinculaciones(
  tinBase: number,
  sueloTin: number,
  vinculaciones: readonly ProductoVinculado[],
): number {
  const bonif = calcularBonificacionTotal(vinculaciones, 1);
  return Math.max(sueloTin, tinBase - bonif);
}
