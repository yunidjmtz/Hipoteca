import {
  type Cents,
  ZERO,
  addCents,
  subtractCents,
  multiplyCents,
  centsRoundHalfUp,
} from '@/core/money';
import { addMonthsAnchored } from '@/core/dates';
import type { InputProyeccion, PuntoProyeccion } from '@/domain/types';

// ---------------------------------------------------------------------------
// Proyección mensual de ahorro — R15
// ---------------------------------------------------------------------------

/**
 * Genera la proyección mes a mes hasta mesesMaximos.
 * Tiene en cuenta ingresos extraordinarios (por fecha), el crecimiento anual
 * del precio objetivo y la rentabilidad del ahorro acumulado.
 */
export function proyectarAhorro(input: InputProyeccion): PuntoProyeccion[] {
  const {
    ahorroInicial,
    ahorroMensual,
    extraordinarios,
    fechaInicio,
    precioObjetivo,
    crecimientoAnualPrecio,
    rentabilidadAnualAhorro,
    mesesMaximos,
    objetivoEnMes,
  } = input;

  const puntos: PuntoProyeccion[] = [];
  let ahorroAcumulado: Cents = ahorroInicial;

  // Factor de crecimiento mensual
  const factorAhorroMensual = Math.pow(1 + rentabilidadAnualAhorro, 1 / 12);
  const factorPrecioMensual = Math.pow(1 + crecimientoAnualPrecio, 1 / 12);

  // Ancla de día para addMonthsAnchored (usamos el día de fechaInicio)
  const partesInicio = fechaInicio.split('-');
  const anchorDay = parseInt(partesInicio[2] ?? '1', 10);

  let objetivoCreciente: Cents = objetivoEnMes?.(0) ?? precioObjetivo;
  let fechaAnterior = fechaInicio;

  for (let mes = 0; mes <= mesesMaximos; mes++) {
    const fecha = mes === 0 ? fechaInicio : addMonthsAnchored(fechaInicio, anchorDay, mes);

    if (mes > 0) {
      // Rentabilidad sobre el ahorro acumulado
      const rendimiento = centsRoundHalfUp(ahorroAcumulado * (factorAhorroMensual - 1));
      // Solo se suman ingresos posteriores al inicio y recibidos hasta este
      // corte. La comparación ISO es cronológica porque las fechas están
      // validadas como YYYY-MM-DD.
      const extraEsteIntervalo = extraordinarios
        .filter((e) => e.fecha > fechaAnterior && e.fecha <= fecha)
        .reduce<Cents>((acc, e) => addCents(acc, e.importe), ZERO);
      ahorroAcumulado = addCents(
        addCents(addCents(ahorroAcumulado, rendimiento), ahorroMensual),
        extraEsteIntervalo,
      );
      // Si el consumidor conoce el desglose del objetivo, lo recalcula desde
      // el precio futuro. El crecimiento compuesto directo queda como respaldo
      // para proyecciones de un importe simple.
      objetivoCreciente =
        objetivoEnMes?.(mes) ?? multiplyCents(objetivoCreciente, factorPrecioMensual);
    }

    const diferencia = subtractCents(ahorroAcumulado, objetivoCreciente);
    puntos.push({ mes, fecha, ahorroAcumulado, objetivoCreciente, diferencia });
    fechaAnterior = fecha;
  }

  return puntos;
}

/**
 * Devuelve el número de meses hasta alcanzar el objetivo, o null si no se
 * alcanza dentro del horizonte de mesesMaximos.
 */
export function mesesHastaObjetivo(input: InputProyeccion): number | null {
  const puntos = proyectarAhorro(input);
  for (const p of puntos) {
    if (p.diferencia >= 0) return p.mes;
  }
  return null;
}
