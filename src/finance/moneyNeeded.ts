import { type Cents, ZERO, addCents, subtractCents, maxCents, sumCents } from '@/core/money';
import type { GastosCompra } from '@/domain/types';

// ---------------------------------------------------------------------------
// Dinero necesario para comprar — §4.3
// ---------------------------------------------------------------------------

export interface InputDineroNecesario {
  entrada: Cents;
  impuestos: Cents;
  gastosObligatorios: Cents; // notaría, registro, gestoría, tasación, nota simple
  gastosComerciales: Cents; // inmobiliaria, broker
  reforma: Cents;
  muebles: Cents;
  mudanza: Cents;
  imprevistos: Cents;
  otrosTransicion: Cents;
  ahorrosActuales: Cents;
}

export interface ResultadoDineroNecesario {
  dineroMinimo: Cents; // entrada + impuestos + gastos obligatorios y comerciales
  dineroRecomendado: Cents; // mínimo + gastos de transición (reforma, muebles…)
  dineroComodo: Cents; // igual que recomendado
  ahorroUtilizable: Cents; // ahorrosActuales
  faltanteMinimo: Cents; // max(0, dineroMinimo - ahorroUtilizable)
  faltanteRecomendado: Cents;
  faltanteComodo: Cents;
  remanenteTrasMinimo: Cents; // ahorros - dineroMinimo (puede ser negativo)
}

export function calcularDineroNecesario(input: InputDineroNecesario): ResultadoDineroNecesario {
  const {
    entrada,
    impuestos,
    gastosObligatorios,
    gastosComerciales,
    reforma,
    muebles,
    mudanza,
    imprevistos,
    otrosTransicion,
    ahorrosActuales,
  } = input;

  const dineroMinimo = sumCents([entrada, impuestos, gastosObligatorios, gastosComerciales]);

  const gastosTransicion = sumCents([reforma, muebles, mudanza, imprevistos, otrosTransicion]);
  const dineroRecomendado = addCents(dineroMinimo, gastosTransicion);
  const dineroComodo = dineroRecomendado;

  const ahorroUtilizable = ahorrosActuales;

  const faltanteMinimo = maxCents(ZERO, subtractCents(dineroMinimo, ahorroUtilizable));
  const faltanteRecomendado = maxCents(ZERO, subtractCents(dineroRecomendado, ahorroUtilizable));
  const faltanteComodo = maxCents(ZERO, subtractCents(dineroComodo, ahorroUtilizable));

  const remanenteTrasMinimo = subtractCents(ahorrosActuales, dineroMinimo);

  return {
    dineroMinimo,
    dineroRecomendado,
    dineroComodo,
    ahorroUtilizable,
    faltanteMinimo,
    faltanteRecomendado,
    faltanteComodo,
    remanenteTrasMinimo,
  };
}

/** Construye el InputDineroNecesario a partir de los campos de GastosCompra. */
export function inputDineroNecesarioDesdeGastos(
  entrada: Cents,
  impuestos: Cents,
  gastosObligatoriosCalculados: Cents,
  gastosComerciales: Cents,
  gastos: GastosCompra,
  ahorrosActuales: Cents,
): InputDineroNecesario {
  return {
    entrada,
    impuestos,
    gastosObligatorios: gastosObligatoriosCalculados,
    gastosComerciales,
    reforma: gastos.reforma,
    muebles: gastos.muebles,
    mudanza: gastos.mudanza,
    imprevistos: gastos.imprevistos,
    otrosTransicion: gastos.otros,
    ahorrosActuales,
  };
}
