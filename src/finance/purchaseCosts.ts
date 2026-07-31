import {
  type Cents,
  ZERO,
  centsRoundHalfUp,
  addCents,
  multiplyCents,
  sumCents,
} from '@/core/money';
import type {
  TramoImpositivo,
  ReduccionFiscal,
  ConfigFiscalCcaa,
  ContextoReduccion,
  GastosCompra,
  EstadoVivienda,
} from '@/domain/types';

// ---------------------------------------------------------------------------
// Impuesto por tramos acumulados — R2
// ---------------------------------------------------------------------------

/**
 * Calcula el impuesto acumulando tramos, igual que el IRPF.
 * Cada tramo tributa solo por la porción de la base dentro de ese tramo.
 * @param baseEuros  Precio de compraventa en euros.
 * @param tramos     Tramos ordenados de menor a mayor; el último tiene hasta=null.
 * @returns          Cuota en euros.
 */
export function calcularImpuestoPorTramos(
  baseEuros: number,
  tramos: readonly TramoImpositivo[],
): number {
  let impuesto = 0;
  let anteriorLimite = 0;

  for (const tramo of tramos) {
    if (baseEuros <= anteriorLimite) break;
    const limiteActual = tramo.hasta ?? baseEuros;
    const porcion = Math.min(baseEuros, limiteActual) - anteriorLimite;
    impuesto += porcion * tramo.tipo;
    if (tramo.hasta === null || baseEuros <= tramo.hasta) break;
    anteriorLimite = tramo.hasta;
  }

  return impuesto;
}

// ---------------------------------------------------------------------------
// Reducciones fiscales
// ---------------------------------------------------------------------------

function aplicaReduccion(
  r: ReduccionFiscal,
  ctx: ContextoReduccion,
  valorInmuebleEuros: number,
): boolean {
  if (!ctx.esViviendaHabitual) {
    return false;
  }
  if (r.valorMaximoInmueble !== undefined && valorInmuebleEuros > r.valorMaximoInmueble) {
    return false;
  }
  if (r.edadMaxima !== undefined && ctx.edadMenorTitular >= r.edadMaxima) {
    return false;
  }
  if (r.discapacidadMinima !== undefined && ctx.discapacidadPorcentaje < r.discapacidadMinima) {
    return false;
  }
  if (r.victimaViolenciaGenero === true && !ctx.victimaViolenciaGenero) {
    return false;
  }
  if (r.familiaNumerosa === true && !ctx.familiaNumerosa) {
    return false;
  }
  return true;
}

/**
 * Suma las bonificaciones de todas las reducciones aplicables.
 * El portal de Aragón indica que son compatibles entre sí.
 * El resultado se topa en 1 para evitar impuestos negativos.
 */
export function calcularBonificacionAplicable(
  ctx: ContextoReduccion,
  reducciones: readonly ReduccionFiscal[],
  valorInmuebleEuros: number,
): number {
  let total = 0;
  for (const r of reducciones) {
    if (aplicaReduccion(r, ctx, valorInmuebleEuros)) {
      total += r.bonificacionCuota;
    }
  }
  return Math.min(total, 1);
}

// ---------------------------------------------------------------------------
// Cálculo de impuestos de compraventa
// ---------------------------------------------------------------------------

export interface ResultadoImpuestoCompraventa {
  itp: Cents; // segunda mano
  iva: Cents; // nueva
  ajd: Cents; // nueva
  total: Cents;
}

export function calcularImpuestoCompraventa(
  precio: Cents,
  config: ConfigFiscalCcaa,
  estadoVivienda: EstadoVivienda,
  esVpoEspecial: boolean,
  ctx: ContextoReduccion,
  valorReferenciaFiscal?: Cents,
): ResultadoImpuestoCompraventa {
  const precioEuros = precio / 100;
  const baseFiscalEuros =
    valorReferenciaFiscal !== undefined
      ? Math.max(precio, valorReferenciaFiscal) / 100
      : precioEuros;

  if (estadoVivienda === 'usada') {
    const cuotaBruta =
      config.tipoManualOverride !== undefined
        ? baseFiscalEuros * config.tipoManualOverride
        : calcularImpuestoPorTramos(baseFiscalEuros, config.itpTramos);
    const bonif = calcularBonificacionAplicable(ctx, config.itpReducciones, baseFiscalEuros);
    const itp = centsRoundHalfUp(cuotaBruta * 100 * (1 - bonif));
    return { itp, iva: ZERO, ajd: ZERO, total: itp };
  }

  // Vivienda nueva: IVA + AJD
  const tipoIva = esVpoEspecial ? config.ivaVpoEspecial : config.ivaViviendaNueva;
  const iva = multiplyCents(precio, tipoIva);

  const cuotaAjdBruta = baseFiscalEuros * config.ajdCompraventa;
  const bonifAjd = calcularBonificacionAplicable(ctx, config.ajdReducciones, baseFiscalEuros);
  const ajd = centsRoundHalfUp(cuotaAjdBruta * 100 * (1 - bonifAjd));

  const total = addCents(iva, ajd);
  return { itp: ZERO, iva, ajd, total };
}

// ---------------------------------------------------------------------------
// Gastos totales de compraventa — R1
// ---------------------------------------------------------------------------

export interface ResultadoGastosCompra {
  impuestos: Cents;
  gastosObligatorios: Cents; // notaría + registro + gestoría + tasación + nota simple
  gastosComerciales: Cents; // inmobiliaria + broker
  inmobiliaria: Cents;
  broker: Cents;
  gastosTransicion: Cents; // reforma + muebles + mudanza + imprevistos + otros
  total: Cents;
}

export function calcularGastosCompra(
  precio: Cents,
  config: ConfigFiscalCcaa,
  estadoVivienda: EstadoVivienda,
  esVpoEspecial: boolean,
  ctx: ContextoReduccion,
  gastos: GastosCompra,
  valorReferenciaFiscal?: Cents,
): ResultadoGastosCompra {
  const { total: impuestos } = calcularImpuestoCompraventa(
    precio,
    config,
    estadoVivienda,
    esVpoEspecial,
    ctx,
    valorReferenciaFiscal,
  );

  const gastosObligatorios = sumCents([
    gastos.notariaCompraventa,
    gastos.registroCompraventa,
    gastos.gestoriaCompraventa,
    gastos.tasacion,
    gastos.notaSimple,
  ]);

  const baseInmobiliaria = addCents(
    gastos.inmobiliariaFijo,
    multiplyCents(precio, gastos.inmobiliariaPorcentaje),
  );
  const inmobiliariaConIva = multiplyCents(baseInmobiliaria, 1 + gastos.inmobiliariaIva);
  const broker = addCents(gastos.brokerFijo, multiplyCents(precio, gastos.brokerPorcentaje));
  const gastosComerciales = addCents(inmobiliariaConIva, broker);

  const gastosTransicion = sumCents([
    gastos.reforma,
    gastos.muebles,
    gastos.mudanza,
    gastos.imprevistos,
    gastos.otros,
  ]);

  const total = sumCents([impuestos, gastosObligatorios, gastosComerciales, gastosTransicion]);

  return {
    impuestos,
    gastosObligatorios,
    gastosComerciales,
    inmobiliaria: inmobiliariaConIva,
    broker,
    gastosTransicion,
    total,
  };
}
