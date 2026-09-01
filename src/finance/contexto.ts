import type { Cents } from '@/core/money';
import type {
  ContextoEvaluacion,
  ContextoReduccion,
  EstadoPersistido,
  ViviendaGuardada,
} from '@/domain/types';

/**
 * Supuesto neutro para conocer la capacidad financiera antes de seleccionar
 * una vivienda. Los datos fiscales definitivos siempre los aporta el inmueble.
 */
export const CONTEXTO_VIVIENDA_PLAN = {
  estadoVivienda: 'usada',
  destino: 'habitual',
  esVpoEspecial: false,
} as const satisfies Pick<ViviendaGuardada, 'estadoVivienda' | 'destino' | 'esVpoEspecial'>;

/**
 * Construye un ContextoEvaluacion a partir del estado persistido y un precio
 * de referencia. La tasación se asume igual al precio salvo que el estado
 * incluya una tasación de referencia explícita inferior (escenario R5).
 */
export function construirContexto(
  estado: EstadoPersistido,
  precioRef: Cents,
  tasacionOverride?: Cents,
  vivienda?: Pick<
    ViviendaGuardada,
    'estadoVivienda' | 'destino' | 'esVpoEspecial' | 'valorReferenciaFiscal' | 'ibiAnual' | 'comunidadMensual'
  >,
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
    esViviendaHabitual: (vivienda?.destino ?? preferencias.destino) === 'habitual',
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
  const valorReferenciaFiscal =
    vivienda === undefined ? preferencias.valorReferenciaFiscal : vivienda.valorReferenciaFiscal;

  return {
    valorTasacion,
    ...(valorReferenciaFiscal === undefined ? {} : { valorReferenciaFiscal }),
    ltv: ajustes.ltvPorDefecto,
    plazoAnios: ajustes.plazoPorDefecto,
    tinAnual: ajustes.tinPorDefecto,
    perfil,
    gastos,
    costesRecurrentes: {
      ...costesRecurrentes,
      ...(vivienda?.ibiAnual === undefined ? {} : { ibiAnual: vivienda.ibiAnual }),
      ...(vivienda?.comunidadMensual === undefined
        ? {}
        : { comunidadMensual: vivienda.comunidadMensual }),
    },
    ajustes,
    // Las llamadas heredadas sin vivienda conservan sus preferencias antiguas.
    // El plan usa CONTEXTO_VIVIENDA_PLAN y cada inmueble aporta sus datos reales.
    estadoVivienda: vivienda?.estadoVivienda ?? preferencias.estadoVivienda,
    esVpoEspecial: vivienda?.esVpoEspecial ?? preferencias.esVpoEspecial,
    reduccion,
    configFiscal,
  };
}
