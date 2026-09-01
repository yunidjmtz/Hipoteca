import { z } from 'zod';
import { ZERO, type Cents } from '@/core/money';
import type { EscenarioHipoteca } from '@/domain/types';
import { normalizarEscenarioHipoteca } from '@/domain/mortgageScenario';

// ---------------------------------------------------------------------------
// Primitivo monetario: entero que se marca como Cents en tiempo de compilación
// ---------------------------------------------------------------------------

const zCents = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .transform((n) => n as Cents);

const zPorcentaje = z.number().finite().min(0).max(1);
const zTipoInteres = z.number().finite().min(-0.1).max(1);
function esFechaIsoReal(valor: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (coincidencia === null) return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= (diasPorMes[mes - 1] ?? 0);
}

const zFechaIso = z
  .string()
  .refine(esFechaIsoReal, 'La fecha debe ser un día real en formato AAAA-MM-DD');
const zFechaIsoOpcionalVacia = z.union([zFechaIso, z.literal('')]);

function idsNoVaciosYUnicos(elementos: readonly { readonly id: string }[]): boolean {
  const ids = elementos.map((elemento) => elemento.id.trim());
  return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
}

function tramosOrdenadosYCerrados(tramos: readonly { readonly hasta: number | null }[]): boolean {
  if (tramos.length === 0 || tramos.at(-1)?.hasta !== null) return false;
  let limiteAnterior = 0;
  for (const [indice, tramo] of tramos.entries()) {
    if (tramo.hasta === null) return indice === tramos.length - 1;
    if (tramo.hasta <= limiteAnterior) return false;
    limiteAnterior = tramo.hasta;
  }
  return false;
}

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
  hasta: z.union([z.number().finite().positive(), z.null()]),
  tipo: zPorcentaje,
});

const zReduccionFiscal = z.object({
  id: z.string(),
  descripcion: z.string(),
  edadMaxima: z.number().int().min(0).max(120).optional(),
  discapacidadMinima: z.number().min(0).max(100).optional(),
  victimaViolenciaGenero: z.literal(true).optional(),
  familiaNumerosa: z.literal(true).optional(),
  valorMaximoInmueble: z.number().finite().positive().optional(),
  bonificacionCuota: zPorcentaje,
});

const zConfigFiscalCcaa = z
  .object({
    ccaa: z.string().min(1),
    revisadoEl: z.string(),
    itpTramos: z.array(zTramoImpositivo).min(1),
    itpReducciones: z
      .array(zReduccionFiscal)
      .refine(idsNoVaciosYUnicos, 'Las reducciones ITP deben tener identificadores únicos'),
    ajdCompraventa: zPorcentaje,
    ajdReducciones: z
      .array(zReduccionFiscal)
      .refine(idsNoVaciosYUnicos, 'Las reducciones AJD deben tener identificadores únicos'),
    ivaViviendaNueva: zPorcentaje,
    ivaVpoEspecial: zPorcentaje,
    tipoManualOverride: zPorcentaje.optional(),
  })
  .refine(
    (config) => tramosOrdenadosYCerrados(config.itpTramos),
    'Los tramos ITP deben estar ordenados y terminar en un tramo sin límite',
  );

// ---------------------------------------------------------------------------
// Perfil financiero
// ---------------------------------------------------------------------------

export const zTitular = z.object({
  netoPorPaga: zCents,
  numeroPagas: z.union([z.literal(12), z.literal(14)]),
  edad: z.number().int().min(18).max(120),
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
  fecha: zFechaIso,
});

// Un array con entre uno y tres titulares.
// Zod 4 z.tuple admite rest; usamos las variantes exactas para conservar el mínimo requerido.
const zTitulares = z.union([
  z.tuple([zTitular]),
  z.tuple([zTitular, zTitular]),
  z.tuple([zTitular, zTitular, zTitular]),
]);

export const zPerfilFinanciero = z.object({
  titulares: zTitulares,
  otrosIngresos: z
    .array(zOtroIngreso)
    .refine(idsNoVaciosYUnicos, 'Los ingresos deben tener identificadores únicos')
    .optional()
    .default([]),
  otrosIngresosMensuales: zCents,
  modoOtrosIngresos: z.enum(['general', 'desglosado']).optional(),
  deudas: z
    .array(zDeudaMensual)
    .refine(idsNoVaciosYUnicos, 'Las deudas deben tener identificadores únicos'),
  gastoGeneralMensual: zCents.optional().default(ZERO),
  modoGastosMensuales: z.enum(['general', 'desglosado']).optional(),
  gastosFijos: z
    .array(zGastoFijo)
    .refine(idsNoVaciosYUnicos, 'Los gastos deben tener identificadores únicos')
    .optional()
    .default([]),
  ahorrosActuales: zCents,
  ahorroMensualPrevisto: zCents,
  ingresosExtraordinarios: z
    .array(zIngresoExtraordinario)
    .refine(idsNoVaciosYUnicos, 'Los ingresos extraordinarios deben tener identificadores únicos'),
  fechaObjetivoCompra: zFechaIso.optional(),
  alquilerActual: zCents,
});

// ---------------------------------------------------------------------------
// Preferencias y gastos de compra
// ---------------------------------------------------------------------------

const zPasoEscala = z.union([z.literal(5000), z.literal(10000), z.literal(20000)]);

export const zPreferenciasCompra = z
  .object({
    ccaa: z.string(),
    provincia: z.string(),
    destino: zDestinoCompra,
    estadoVivienda: zEstadoVivienda,
    esVpoEspecial: z.boolean(),
    precioObjetivo: zCents,
    habitacionesMinimas: z.number().int().min(0).max(20).default(0),
    banosMinimos: z.number().int().min(0).max(20).default(0),
    exterior: z.boolean().default(false),
    trastero: z.boolean().default(false),
    garaje: z.boolean().default(false),
    precioMinExplorar: zCents,
    precioMaxExplorar: zCents,
    pasoEscala: zPasoEscala,
    valorReferenciaFiscal: zCents.optional(),
  })
  .refine(
    (preferencias) => preferencias.precioMinExplorar <= preferencias.precioMaxExplorar,
    'El precio mínimo de exploración no puede superar el máximo',
  );

export const zGastosCompra = z.object({
  notariaCompraventa: zCents,
  registroCompraventa: zCents,
  gestoriaCompraventa: zCents,
  tasacion: zCents,
  notaSimple: zCents,
  inmobiliariaFijo: zCents,
  inmobiliariaPorcentaje: zPorcentaje,
  inmobiliariaIva: zPorcentaje,
  brokerFijo: zCents,
  brokerPorcentaje: zPorcentaje,
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
  apertura: zPorcentaje,
  amortizacionParcial: zPorcentaje,
  amortizacionTotal: zPorcentaje,
  subrogacion: zCents,
  novacion: zCents,
  otras: zCents,
});

export const zProductoVinculado = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  bonificacionTin: zPorcentaje,
  bonificacionMaxima: zPorcentaje.optional(),
  costeInicial: zCents,
  costeAnual: zCents,
  incrementoAnual: z.number().finite().min(-0.99).max(10),
  aniosExigidos: z.union([z.number().int().min(1).max(100), z.null()]),
  obligatorio: z.boolean(),
  observaciones: z.string(),
});

export const zEscenarioHipoteca = z
  .object({
    id: z.string(),
    titulo: z.string(),
    precioCompra: zCents,
    valorTasacion: zCents,
    ltv: zPorcentaje,
    importeSolicitado: zCents,
    plazoAnios: z.number().int().min(1).max(40),
    tipo: zTipoHipoteca,
    tinFijo: zTipoInteres.optional(),
    euribor: zTipoInteres.optional(),
    euriborFechaValor: z.string().optional(),
    diferencial: zTipoInteres.optional(),
    periodicidadRevision: zPeriodicidadRevision.optional(),
    euriborPorPeriodos: z
      .array(z.object({ desdeMes: z.number().int().min(1), valor: zTipoInteres }))
      .optional(),
    mixtaTinFijo: zTipoInteres.optional(),
    mixtaAniosFijos: z.number().int().min(1).max(39).optional(),
    sueloTin: zTipoInteres,
    taeOficial: zPorcentaje.optional(),
    comisiones: zComisiones,
    vinculaciones: z
      .array(zProductoVinculado)
      .refine(idsNoVaciosYUnicos, 'Las vinculaciones deben tener identificadores únicos'),
    fechaPrimeraCuota: zFechaIso,
  })
  .transform((escenario) => {
    // Zod representa los opcionales como `T | undefined`; en dominio son
    // propiedades opcionales exactas. La forma validada es la misma.
    return normalizarEscenarioHipoteca(escenario as EscenarioHipoteca);
  });

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

const zUmbralesViabilidad = z
  .object({
    ratioComodo: zPorcentaje,
    ratioViable: zPorcentaje,
    ratioAjustado: zPorcentaje,
  })
  .refine(
    ({ ratioComodo, ratioAjustado, ratioViable }) =>
      ratioComodo <= ratioAjustado && ratioAjustado <= ratioViable,
    'Los umbrales deben cumplir cómodo ≤ ajustado ≤ viable',
  );

export const zAjustes = z.object({
  ratioBancarioMaximo: zPorcentaje,
  ratioPersonalObjetivo: zPorcentaje,
  edadMaximaAlVencimiento: z.number().int().min(18).max(120),
  criterioEdad: zCriterioEdad,
  crecimientoAnualPrecioVivienda: z.number().finite().min(-0.99).max(10),
  rentabilidadAnualAhorro: z.number().finite().min(-0.99).max(10),
  umbralesViabilidad: zUmbralesViabilidad,
  fiscal: z
    .array(zConfigFiscalCcaa)
    .min(1)
    .refine(
      (configuraciones) =>
        new Set(configuraciones.map((configuracion) => configuracion.ccaa)).size ===
        configuraciones.length,
      'Las configuraciones fiscales deben corresponder a comunidades distintas',
    ),
  ltvPorDefecto: zPorcentaje,
  plazoPorDefecto: z.number().int().min(1).max(40),
  tinPorDefecto: zTipoInteres,
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
  creadoEl: zFechaIso,
  snapshot: z.object({
    perfil: zPerfilFinanciero,
    ajustes: zAjustes,
    escenario: zEscenarioHipoteca,
  }),
});

export const zOfertaBancaria = z.object({
  id: z.string(),
  viviendaId: z.string().optional(),
  banco: z.string(),
  nombre: z.string(),
  fecha: zFechaIso,
  estado: zEstadoOferta,
  escenario: zEscenarioHipoteca,
  taeOficial: zPorcentaje.optional(),
  notas: z.string(),
});

export const zViviendaGuardada = z.object({
  id: z.string(),
  nombre: z.string().default(''),
  fecha: zFechaIsoOpcionalVacia.default(''),
  direccion: z.string(),
  anuncioUrl: z.string().default(''),
  telefono: z.string().default(''),
  sourcePortal: z.union([z.literal('idealista'), z.literal('fotocasa')]).optional(),
  sourceUrl: z.string().default(''),
  sourceListingId: z.string().default(''),
  rawListingText: z.string().default(''),
  priceHistory: z.array(z.object({ price: zCents, date: zFechaIso })).default([]),
  precioVenta: zCents,
  presupuestoReforma: zCents,
  reforma: z.string(),
  superficieM2: z.number().int().min(0).default(0),
  habitaciones: z.number().int().min(0).default(0),
  banos: z.number().int().min(0).default(0),
  ibiAnual: zCents.default(ZERO),
  comunidadMensual: zCents.default(ZERO),
  // Estos datos pertenecen a cada inmueble; los valores por defecto
  // mantienen compatibles las viviendas guardadas antes de este cambio.
  estadoVivienda: zEstadoVivienda.default('usada'),
  destino: zDestinoCompra.default('habitual'),
  esVpoEspecial: z.boolean().default(false),
  valorReferenciaFiscal: zCents.optional(),
  esExterior: z.boolean().default(false),
  tieneTrastero: z.boolean().default(false),
  tieneGaraje: z.boolean().default(false),
  reformas: z
    .array(
      z.object({
        id: z.string(),
        concepto: z.string(),
        costeEstimado: zCents,
      }),
    )
    .refine(idsNoVaciosYUnicos, 'Las reformas deben tener identificadores únicos')
    .default([]),
  notas: z.string(),
  origenInmobiliaria: z.string().optional(),
  catalogoViviendaId: z.string().optional(),
  yaNoDisponible: z.boolean().optional(),
});

const zInmobiliariaActivaDemo = z.object({
  id: z.string(),
  nombre: z.string(),
  marca: z.string(),
});

export const zMeta = z.object({
  id: z.string(),
  nombre: z.string(),
  precioObjetivo: zCents,
  fechaCreacion: zFechaIso,
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
  simulaciones: z
    .array(zSimulacionGuardada)
    .refine(idsNoVaciosYUnicos, 'Las simulaciones deben tener identificadores únicos'),
  ofertas: z
    .array(zOfertaBancaria)
    .refine(idsNoVaciosYUnicos, 'Las ofertas deben tener identificadores únicos'),
  // v7: opcional para que los datos guardados antes de las viviendas sigan cargando.
  viviendas: z
    .array(zViviendaGuardada)
    .refine(idsNoVaciosYUnicos, 'Las viviendas deben tener identificadores únicos')
    .optional(),
  inmobiliariaActivaDemo: zInmobiliariaActivaDemo.optional(),
  metas: z.array(zMeta).refine(idsNoVaciosYUnicos, 'Las metas deben tener identificadores únicos'),
  // v2: optional para compatibilidad con datos v1; se rellena en la migración
  escenarioSimulador: zEscenarioHipoteca.optional(),
});
