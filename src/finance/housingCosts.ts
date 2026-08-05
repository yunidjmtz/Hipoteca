import { addCents, sumCents } from '@/core/money';
import type { Cents, EstadoPersistido, ViviendaGuardada } from '@/domain/types';
import { construirContexto } from '@/finance/contexto';
import { calcularGastosCompra, type ResultadoGastosCompra } from '@/finance/purchaseCosts';

export interface ResultadoCosteVivienda {
  costeReforma: Cents;
  costeAntesImpuestos: Cents;
  gastosCompra: ResultadoGastosCompra;
  costeTotal: Cents;
}

/**
 * Calcula el coste completo de una vivienda candidata con la configuración
 * fiscal y los gastos de compra activos. La reforma concreta de la vivienda
 * sustituye a la estimación global para no contarla dos veces.
 */
export function calcularCosteVivienda(
  vivienda: ViviendaGuardada,
  estado: EstadoPersistido,
): ResultadoCosteVivienda {
  const costeReforma = sumCents(vivienda.reformas.map((reforma) => reforma.costeEstimado));
  const contexto = construirContexto(estado, vivienda.precioVenta);
  const gastosCompra = calcularGastosCompra(
    vivienda.precioVenta,
    contexto.configFiscal,
    contexto.estadoVivienda,
    contexto.esVpoEspecial,
    contexto.reduccion,
    { ...contexto.gastos, reforma: costeReforma },
    contexto.valorReferenciaFiscal,
  );

  return {
    costeReforma,
    costeAntesImpuestos: addCents(vivienda.precioVenta, costeReforma),
    gastosCompra,
    costeTotal: addCents(vivienda.precioVenta, gastosCompra.total),
  };
}
