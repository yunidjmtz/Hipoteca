import { z } from 'zod';
import type { Cents } from '@/core/money';
import type { EscenarioHipoteca } from '@/domain/types';
import { normalizarEscenarioHipoteca } from '@/domain/mortgageScenario';

// ---------------------------------------------------------------------------
// Primitivo monetario: entero que se marca como Cents en tiempo de compilación
// ---------------------------------------------------------------------------

const zCents = z
  .number()
  .int()
  .transform((n) => n as Cents);

// ---------------------------------------------------------------------------
// Enumeraciones de cadena como uniones de literales (Zod 4 no tiene z.enum)
// ---------------------------------------------------------------------------

const zTipoHipoteca = z.union([z.literal('fija'), z.literal('variable'), z.literal('mixta')]);

const zEstadoVivienda = z.union([z.literal('nueva'), z.literal('usada')]);

const zDestinoCompra = z.union([
  z.literal('habitual'),
  z.literal('segunda'),
  z.literal('inversion'),
]);

const zSituacionLaboral = z.union([
  z.literal('indefinido'),
  z.literal('funcionario'),
  z.literal('autonomo'),
  z.literal('temporal'),
  z.literal('jubilado'),
  z.literal('otro'),
]);

const zPeriodicidadRevision = z.union([z.literal('semestral'), z.literal('anual')]);

const zPeriodicidad = z.union([
  z.literal('mensual'),
  z.literal('bimestral'),
  z.literal('trimestral'),
  z.literal('semestral'),
  z.literal('anual'),
]);

const zEstadoOferta = z.union([
  z.literal('pendiente'),
  z.literal('estudio'),
  z.literal('preaprobada'),
  z.literal('fein_recibida'),
  z.literal('rechazada'),
  z.literal('firmada'),
]);

const zCriterioEdad = z.union([z.literal('mayor'), z.literal('menor')]);

// ---------------------------------------------------------------------------
// Fiscal
// ---------------------------------------------------------------------------

const zTramoImpositivo = z.object({
  hasta: z.union([z.number(), z.null()]),
  tipo: z.number(),
});

const zReduccionFiscal = z.object({
  id: z.string(),
  descripcion: z.string(),
  edadMaxima: z.number().optional(),
  discapacidadMinima: z.number().optional(),
  victimaViolenciaGenero: z.literal(true).optional(),
  familiaNumerosa: z.literal(true).optional(),
  valorMaximoInmueble: z.number().optional(),
  bonificacionCuota: z.number(),
});

const zConfigFiscalCcaa = z.object({
  ccaa: z.string(),
  revisadoEl: z.string(),
  itpTramos: z.array(zTramoImpositivo),
  itpReducciones: z.array(zReduccionFiscal),
  ajdCompraventa: z.number(),
  ajdReducciones: z.array(zReduccionFiscal),
  ivaViviendaNueva: z.number(),
  ivaVpoEspecial: z.number(),
  tipoManualOverride: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Perfil financiero
// ---------------------------------------------------------------------------

export const zTitular = z.object({
  netoPorPaga: zCents,
  numeroPagas: z.union([z.literal(12), z.literal(14)]),
  edad: z.number().int(),
  situacionLaboral: zSituacionLaboral,
});

export const zDeudaMensual = z.object({
  id: z.string(),
  concepto: z.string(),
  importe: zCents,
  periodicidad: zPeriodicidad.optional().default('mensual'),
});

export const zGastoFijo = z.object({
  id: z.string(),
  concepto: z.string(),
  importe: zCents,
  periodicidad: zPeriodicidad.optional().default('mensual'),
  esAlquilerActual: z.boolean().optional().default(false),
});

export const zOtroIngreso = z.object({
  id: z.string(),
  concepto: z.string(),
  importe: zCents,
  periodicidad: zPeriodicidad,
});

export const zIngresoExtraordinario = z.object({
  id: z.string(),
  concepto: z.string(),
  importe: zCents,
  fecha: z.string(),
});

// Un array con uno o exactamente dos titulares.
// Zod 4 z.tuple admite rest; usamos z.union de las dos variantes exactas.
const zTitulares = z.union([z.tuple([zTitular]), z.tuple([zTitular, zTitular])]);

export const zPerfilFinanciero = z.object({
  titulares: zTitulares,
  otrosIngresos: z.array(zOtroIngreso).optional().default([]),
  otrosIngresosMensuales: zCents,
  deudas: z.array(zDeudaMensual),
  gastosFijos: z.array(zGastoFijo).optional().default([]),
  ahorrosActuales: zCents,
  ahorroMensualPrevisto: zCents,
  ingresosExtraordinarios: z.array(zIngresoExtraordinario),
  fechaObjetivoCompra: z.string().optional(),
  alquilerActual: zCents,
});

// ---------------------------------------------------------------------------
// Preferencias y gastos de compra
// ---------------------------------------------------------------------------

const zPasoEscala = z.union([z.literal(5000), z.literal(10000), z.literal(20000)]);

export const zPreferenciasCompra = z.object({
  ccaa: z.string(),
  provincia: z.string(),
  destino: zDestinoCompra,
  estadoVivienda: zEstadoVivienda,
  esVpoEspecial: z.boolean(),
  precioObjetivo: zCents,
  precioMinExplorar: zCents,
  precioMaxExplorar: zCents,
  pasoEscala: zPasoEscala,
  valorReferenciaFiscal: zCents.optional(),
});

export const zGastosCompra = z.object({
  notariaCompraventa: zCents,
  registroCompraventa: zCents,
  gestoriaCompraventa: zCents,
  tasacion: zCents,
  notaSimple: zCents,
  inmobiliariaFijo: zCents,
  inmobiliariaPorcentaje: z.number(),
  inmobiliariaIva: z.number(),
  brokerFijo: zCents,
  brokerPorcentaje: z.number(),
  reforma: zCents,
  muebles: zCents,
  mudanza: zCents,
  imprevistos: zCents,
  otros: zCents,
  repercutirGastosHipoteca: z.boolean(),
});

export const zCostesRecurrentes = z.object({
  comunidadMensual: zCents,
  ibiAnual: zCents,
  seguroHogarAnual: zCents,
  seguroVidaAnual: zCents,
  mantenimientoMensual: zCents,
  garajeMensual: zCents,
  suministrosMensuales: zCents,
  otrosMensuales: zCents,
});

// ---------------------------------------------------------------------------
// Hipoteca
// ---------------------------------------------------------------------------

export const zComisiones = z.object({
  apertura: z.number(),
  amortizacionParcial: z.number(),
  amortizacionTotal: z.number(),
  subrogacion: zCents,
  novacion: zCents,
  otras: zCents,
});

export const zProductoVinculado = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  bonificacionTin: z.number(),
  bonificacionMaxima: z.number().optional(),
  costeInicial: zCents,
  costeAnual: zCents,
  incrementoAnual: z.number(),
  aniosExigidos: z.union([z.number(), z.null()]),
  obligatorio: z.boolean(),
  observaciones: z.string(),
});

export const zEscenarioHipoteca = z
  .object({
    id: z.string(),
    titulo: z.string(),
    precioCompra: zCents,
    valorTasacion: zCents,
    ltv: z.number(),
    importeSolicitado: zCents,
    plazoAnios: z.number(),
    tipo: zTipoHipoteca,
    tinFijo: z.number().optional(),
    euribor: z.number().optional(),
    euriborFechaValor: z.string().optional(),
    diferencial: z.number().optional(),
    periodicidadRevision: zPeriodicidadRevision.optional(),
    euriborPorPeriodos: z
      .array(z.object({ desdeMes: z.number().int().min(1), valor: z.number() }))
      .optional(),
    mixtaTinFijo: z.number().optional(),
    mixtaAniosFijos: z.number().optional(),
    sueloTin: z.number(),
    taeOficial: z.number().optional(),
    comisiones: zComisiones,
    vinculaciones: z.array(zProductoVinculado),
    fechaPrimeraCuota: z.string(),
  })
  .transform((escenario) => {
    // Zod representa los opcionales como `T | undefined`; en dominio son
    // propiedades opcionales exactas. La forma validada es la misma.
    return normalizarEscenarioHipoteca(escenario as EscenarioHipoteca);
  });

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const zUmbralesViabilidad = z.object({
  ratioComodo: z.number(),
  ratioViable: z.number(),
  ratioAjustado: z.number(),
});

export const zAjustes = z.object({
  ratioBancarioMaximo: z.number(),
  ratioPersonalObjetivo: z.number(),
  edadMaximaAlVencimiento: z.number(),
  criterioEdad: zCriterioEdad,
  crecimientoAnualPrecioVivienda: z.number(),
  rentabilidadAnualAhorro: z.number(),
  umbralesViabilidad: z.object({
    ratioComodo: zUmbralesViabilidad.shape.ratioComodo,
    ratioViable: zUmbralesViabilidad.shape.ratioViable,
    ratioAjustado: zUmbralesViabilidad.shape.ratioAjustado,
  }),
  fiscal: z.array(zConfigFiscalCcaa),
  ltvPorDefecto: z.number(),
  plazoPorDefecto: z.number(),
  tinPorDefecto: z.number(),
  tinFuente: z
    .union([z.literal('ine'), z.literal('manual')])
    .optional()
    .default('ine'),
  tinReferenciaPeriodo: z.string().optional(),
  tinReferenciaConsultadoEl: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Simulaciones, ofertas y metas
// ---------------------------------------------------------------------------

export const zSimulacionGuardada = z.object({
  id: z.string(),
  nombre: z.string(),
  notas: z.string(),
  favorita: z.boolean(),
  creadoEl: z.string(),
  snapshot: z.object({
    perfil: zPerfilFinanciero,
    ajustes: zAjustes,
    escenario: zEscenarioHipoteca,
  }),
});

export const zOfertaBancaria = z.object({
  id: z.string(),
  banco: z.string(),
  nombre: z.string(),
  fecha: z.string(),
  estado: zEstadoOferta,
  escenario: zEscenarioHipoteca,
  taeOficial: z.number().optional(),
  notas: z.string(),
});

export const zMeta = z.object({
  id: z.string(),
  nombre: z.string(),
  precioObjetivo: zCents,
  fechaCreacion: z.string(),
  notas: z.string(),
});

// ---------------------------------------------------------------------------
// Schema raíz
// ---------------------------------------------------------------------------

export const zEstadoPersistido = z.object({
  schemaVersion: z.number().int(),
  perfil: zPerfilFinanciero,
  preferencias: zPreferenciasCompra,
  gastos: zGastosCompra,
  costesRecurrentes: zCostesRecurrentes,
  ajustes: zAjustes,
  simulaciones: z.array(zSimulacionGuardada),
  ofertas: z.array(zOfertaBancaria),
  metas: z.array(zMeta),
  // v2: optional para compatibilidad con datos v1; se rellena en la migración
  escenarioSimulador: zEscenarioHipoteca.optional(),
});
