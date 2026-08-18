import type { Cents } from '@/core/money';
import type { ContextoEvaluacion, ContextoReduccion, EstadoPersistido } from '@/domain/types';

/**
 * Construye un ContextoEvaluacion a partir del estado persistido y un precio
 * de referencia. La tasación se asume igual al precio salvo que el estado
 * incluya una tasación de referencia explícita inferior (escenario R5).
 */
export function construirContexto(
  estado: EstadoPersistido,
  precioRef: Cents,
  tasacionOverride?: Cents,
): ContextoEvaluacion {
  const { perfil, gastos, costesRecurrentes, ajustes, preferencias } = estado;

  // En compras pro indiviso la bonificación personal se prorratea según la
  // participación de cada comprador. Como el perfil no guarda ese reparto,
  // solo se aplica automáticamente cuando todos cumplen el límite de edad.
  const edadMaximaTitular = Math.max(...perfil.titulares.map((t) => t.edad));

  const reduccion: ContextoReduccion = {
    edadMaximaTitular,
    discapacidadPorcentaje: 0,
    victimaViolenciaGenero: false,
    familiaNumerosa: false,
    esViviendaHabitual: preferencias.destino === 'habitual',
  };

  const ccaaName = preferencias.ccaa;
  const configFiscal =
    ajustes.fiscal.find((f) => f.ccaa === ccaaName) ??
    ajustes.fiscal.find((f) => f.ccaa === 'Genérica (editable)') ??
    ajustes.fiscal[0];

  if (configFiscal === undefined) {
    throw new Error('Falta la configuración fiscal');
  }

  const valorTasacion =
    tasacionOverride !== undefined && tasacionOverride < precioRef ? tasacionOverride : precioRef;

  return {
    valorTasacion,
    ...(preferencias.valorReferenciaFiscal !== undefined
      ? { valorReferenciaFiscal: preferencias.valorReferenciaFiscal }
      : {}),
    ltv: ajustes.ltvPorDefecto,
    plazoAnios: ajustes.plazoPorDefecto,
    tinAnual: ajustes.tinPorDefecto,
    perfil,
    gastos,
    costesRecurrentes,
    ajustes,
    estadoVivienda: preferencias.estadoVivienda,
    esVpoEspecial: preferencias.esVpoEspecial,
    reduccion,
    configFiscal,
  };
}
