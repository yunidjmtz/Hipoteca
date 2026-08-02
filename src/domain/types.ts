import type { Cents } from '@/core/money';

// ---------------------------------------------------------------------------
// Tipos primitivos reutilizables
// ---------------------------------------------------------------------------

export type { Cents };

export type TipoHipoteca = 'fija' | 'variable' | 'mixta';
export type EstadoVivienda = 'nueva' | 'usada';
export type DestinoCompra = 'habitual' | 'segunda' | 'inversion';
export type SituacionLaboral =
  'indefinido' | 'funcionario' | 'autonomo' | 'temporal' | 'jubilado' | 'otro';
export type PeriodicidadRevision = 'semestral' | 'anual';
export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type EstadoViabilidad =
  'comodo' | 'viable' | 'ajustado' | 'falta_ahorro' | 'cuota_excesiva' | 'no_viable';
export type EstadoOferta =
  'pendiente' | 'estudio' | 'preaprobada' | 'fein_recibida' | 'rechazada' | 'firmada';

// ---------------------------------------------------------------------------
// Fiscal
// ---------------------------------------------------------------------------

/** hasta: euros (null = sin tope). tipo: decimal (0.08 = 8 %). */
export interface TramoImpositivo {
  hasta: number | null;
  tipo: number;
}

/**
 * Reducción o bonificación condicionada. Las condiciones se evalúan sobre
 * ContextoReduccion; omitir un campo equivale a "sin restricción en ese eje".
 * bonificacionCuota: fracción a descontar de la cuota (0.125 = 12,5 %).
 */
export interface ReduccionFiscal {
  id: string;
  descripcion: string;
  edadMaxima?: number;
  discapacidadMinima?: number;
  victimaViolenciaGenero?: true;
  familiaNumerosa?: true;
  valorMaximoInmueble?: number; // euros
  bonificacionCuota: number;
}

export interface ConfigFiscalCcaa {
  ccaa: string;
  revisadoEl: string; // dd/mm/aaaa — se muestra en la UI
  itpTramos: TramoImpositivo[];
  itpReducciones: ReduccionFiscal[];
  ajdCompraventa: number; // decimal
  ajdReducciones: ReduccionFiscal[];
  ivaViviendaNueva: number; // decimal (0.10 para libre; 0.04 para VPO especial)
  ivaVpoEspecial: number; // decimal (0.04 — LIVA art. 91.2.1.c)
  tipoManualOverride?: number;
}

export interface ContextoReduccion {
  edadMenorTitular: number;
  discapacidadPorcentaje: number;
  victimaViolenciaGenero: boolean;
  familiaNumerosa: boolean;
  esViviendaHabitual: boolean;
}

// ---------------------------------------------------------------------------
// Perfil financiero
// ---------------------------------------------------------------------------

export interface Titular {
  netoPorPaga: Cents;
  numeroPagas: 12 | 14; // R3
  edad: number;
  situacionLaboral: SituacionLaboral;
}

export interface DeudaMensual {
  id: string;
  concepto: string;
  importe: Cents;
  periodicidad: Periodicidad;
}

export interface GastoFijo {
  id: string;
  concepto: string;
  importe: Cents;
  periodicidad: Periodicidad;
  /** El alquiler actual desaparece al comprar la vivienda y no debe contar como gasto posterior. */
  esAlquilerActual?: boolean;
}

export interface OtroIngreso {
  id: string;
  concepto: string;
  importe: Cents;
  periodicidad: Periodicidad;
}

export interface IngresoExtraordinario {
  id: string;
  concepto: string;
  importe: Cents;
  fecha: string; // ISO date YYYY-MM-DD
}

export interface PerfilFinanciero {
  titulares: [Titular] | [Titular, Titular];
  otrosIngresos: OtroIngreso[];
  otrosIngresosMensuales: Cents; // suma mensualizada de otrosIngresos — mantenida en sync
  deudas: DeudaMensual[];
  gastosFijos: GastoFijo[];
  ahorrosActuales: Cents;
  ahorroMensualPrevisto: Cents;
  ingresosExtraordinarios: IngresoExtraordinario[];
  fechaObjetivoCompra?: string;
  alquilerActual: Cents;
}

// ---------------------------------------------------------------------------
// Preferencias y gastos de compra
// ---------------------------------------------------------------------------

export interface PreferenciasCompra {
  ccaa: string;
  provincia: string;
  destino: DestinoCompra;
  estadoVivienda: EstadoVivienda;
  esVpoEspecial: boolean;
  precioObjetivo: Cents;
  precioMinExplorar: Cents;
  precioMaxExplorar: Cents;
  pasoEscala: 5000 | 10000 | 20000;
  /** Valor fiscal de referencia; si supera el precio puede elevar ITP/AJD. */
  valorReferenciaFiscal?: Cents;
}

/** R1 — todos los gastos del comprador con nombres explícitos. */
export interface GastosCompra {
  notariaCompraventa: Cents;
  registroCompraventa: Cents;
  gestoriaCompraventa: Cents;
  tasacion: Cents;
  notaSimple: Cents;
  inmobiliariaFijo: Cents;
  inmobiliariaPorcentaje: number; // decimal
  inmobiliariaIva: number; // decimal
  brokerFijo: Cents;
  brokerPorcentaje: number; // decimal
  reforma: Cents;
  muebles: Cents;
  mudanza: Cents;
  imprevistos: Cents;
  otros: Cents;
  repercutirGastosHipoteca: boolean; // false por defecto (R1)
}

export interface CostesRecurrentes {
  comunidadMensual: Cents;
  ibiAnual: Cents;
  seguroHogarAnual: Cents;
  seguroVidaAnual: Cents;
  mantenimientoMensual: Cents;
  garajeMensual: Cents;
  suministrosMensuales: Cents;
  otrosMensuales: Cents;
}

// ---------------------------------------------------------------------------
// Hipoteca
// ---------------------------------------------------------------------------

export interface ProductoVinculado {
  id: string;
  nombre: string;
  activo: boolean;
  bonificacionTin: number; // decimal
  bonificacionMaxima?: number; // decimal — tope de la bonificación aportada por este producto (R13)
  costeInicial: Cents;
  costeAnual: Cents;
  incrementoAnual: number; // decimal
  aniosExigidos: number | null;
  obligatorio: boolean;
  observaciones: string;
}

export interface Comisiones {
  apertura: number; // decimal sobre el principal
  amortizacionParcial: number;
  amortizacionTotal: number;
  subrogacion: Cents;
  novacion: Cents;
  otras: Cents;
}

export interface EscenarioHipoteca {
  id: string;
  titulo: string;
  precioCompra: Cents;
  valorTasacion: Cents;
  ltv: number; // decimal (0.80 = 80 %)
  importeSolicitado: Cents;
  plazoAnios: number;
  tipo: TipoHipoteca;
  tinFijo?: number;
  euribor?: number;
  euriborFechaValor?: string;
  diferencial?: number;
  periodicidadRevision?: PeriodicidadRevision;
  euriborPorPeriodos?: { desdeMes: number; valor: number }[];
  mixtaTinFijo?: number;
  mixtaAniosFijos?: number;
  sueloTin: number; // 0 por defecto — R9
  taeOficial?: number; // TAE indicada en la oferta o FEIN; no altera el cálculo propio
  comisiones: Comisiones;
  vinculaciones: ProductoVinculado[];
  fechaPrimeraCuota: string; // ISO date
}

/** Una línea del cuadro de amortización (§4.1). */
export interface LineaMensual {
  numero: number; // 0 = desembolso inicial; 1..n = cuotas
  fecha: string; // ISO date
  tinAplicado: number; // decimal
  cuota: Cents;
  intereses: Cents;
  principal: Cents;
  /** Capital cancelado fuera de la cuota ordinaria en este mes. */
  amortizacionExtraordinaria: Cents;
  pendiente: Cents; // capital pendiente tras esta línea
  costesVinculados: Cents;
  comisiones: Cents; // apertura en mes 0; amortización cuando aplique
}

/** Input de construirFlujoDeCaja — firma definitiva (§4.1). */
export interface FlujoInput {
  capital: Cents;
  tinAnual: number; // decimal
  plazoMeses: number;
  sueloTin: number; // decimal; 0 para fija (R9)
  fechaPrimeraCuota: string; // ISO date
  comisionApertura: Cents;
  vinculaciones: readonly ProductoVinculado[];
  // Variable / mixta (Fase 2)
  tipo: TipoHipoteca;
  euribor?: number;
  diferencial?: number;
  periodicidadRevision?: PeriodicidadRevision;
  euriborPorPeriodos?: readonly { desdeMes: number; valor: number }[];
  mixtaTinFijo?: number;
  mixtaAniosFijos?: number;
}

// ---------------------------------------------------------------------------
// Evaluación de precio (§4.2)
// ---------------------------------------------------------------------------

export interface EvaluacionPrecio {
  precio: Cents;
  tasacion: Cents;
  importeFinanciado: Cents;
  entrada: Cents;
  impuestos: Cents;
  gastosObligatorios: Cents;
  gastosInmobiliaria: Cents;
  gastosBroker: Cents;
  otrosGastos: Cents;
  dineroMinimo: Cents;
  dineroRecomendado: Cents;
  dineroComodo: Cents;
  ahorroDisponible: Cents;
  faltante: Cents;
  cuota: Cents;
  costeMensualVivienda: Cents;
  ratioBancario: number;
  ratioPersonal: number;
  dineroLibreMensual: Cents;
  estado: EstadoViabilidad;
  motivo: string;
}

export interface ResultadoBusqueda {
  precioMaximo: Cents | null;
  intervalosViables: { desde: Cents; hasta: Cents }[];
  hayDiscontinuidad: boolean;
}

export interface ContextoEvaluacion {
  valorTasacion: Cents;
  valorReferenciaFiscal?: Cents;
  ltv: number; // decimal
  plazoAnios: number;
  tinAnual: number; // decimal
  perfil: PerfilFinanciero;
  gastos: GastosCompra;
  costesRecurrentes: CostesRecurrentes;
  ajustes: Ajustes;
  estadoVivienda: EstadoVivienda;
  esVpoEspecial: boolean;
  reduccion: ContextoReduccion;
  configFiscal: ConfigFiscalCcaa;
}

// ---------------------------------------------------------------------------
// Ajustes globales
// ---------------------------------------------------------------------------

export interface UmbralesViabilidad {
  ratioComodo: number; // 0.30
  ratioViable: number; // 0.35
  ratioAjustado: number; // 0.33 (entre los dos anteriores)
}

export interface Ajustes {
  ratioBancarioMaximo: number; // 0.35
  ratioPersonalObjetivo: number; // 0.30
  edadMaximaAlVencimiento: number; // 75
  criterioEdad: 'mayor' | 'menor'; // 'mayor' — R4
  crecimientoAnualPrecioVivienda: number; // 0
  rentabilidadAnualAhorro: number; // 0
  umbralesViabilidad: UmbralesViabilidad;
  fiscal: ConfigFiscalCcaa[];
  // Parámetros de hipoteca por defecto (usados en Capacidad, Escala, Meta)
  ltvPorDefecto: number; // 0.80
  plazoPorDefecto: number; // 25 años
  tinPorDefecto: number; // decimal
  tinFuente: 'ine' | 'manual';
  /** Mes de referencia publicado por el INE, en formato YYYY-MM. */
  tinReferenciaPeriodo?: string;
  /** Momento de la última consulta satisfactoria, en formato ISO. */
  tinReferenciaConsultadoEl?: string;
}

// ---------------------------------------------------------------------------
// Metas y simulaciones (§5)
// ---------------------------------------------------------------------------

export interface Meta {
  id: string;
  nombre: string;
  precioObjetivo: Cents;
  fechaCreacion: string;
  notas: string;
}

export interface SimulacionGuardada {
  id: string;
  nombre: string;
  notas: string;
  favorita: boolean;
  creadoEl: string; // ISO date
  snapshot: {
    perfil: PerfilFinanciero;
    ajustes: Ajustes;
    escenario: EscenarioHipoteca;
  };
}

export interface OfertaBancaria {
  id: string;
  banco: string;
  nombre: string;
  fecha: string;
  estado: EstadoOferta;
  escenario: EscenarioHipoteca;
  taeOficial?: number;
  notas: string;
}

/** Vivienda candidata que se está valorando, independiente de la hipoteca. */
export interface PartidaReforma {
  id: string;
  concepto: string;
  costeEstimado: Cents;
}

export interface ViviendaGuardada {
  id: string;
  nombre: string;
  fecha: string;
  direccion: string;
  precioVenta: Cents;
  /** Campos conservados para migrar los datos creados con la primera versión. */
  presupuestoReforma: Cents;
  reforma: string;
  superficieM2: number;
  esExterior: boolean;
  tieneTrastero: boolean;
  tieneGaraje: boolean;
  reformas: PartidaReforma[];
  notas: string;
}

// ---------------------------------------------------------------------------
// Estado persistido
// ---------------------------------------------------------------------------

export interface EstadoPersistido {
  schemaVersion: number;
  perfil: PerfilFinanciero;
  preferencias: PreferenciasCompra;
  gastos: GastosCompra;
  costesRecurrentes: CostesRecurrentes;
  ajustes: Ajustes;
  simulaciones: SimulacionGuardada[];
  ofertas: OfertaBancaria[];
  viviendas: ViviendaGuardada[];
  metas: Meta[];
  escenarioSimulador: EscenarioHipoteca; // v2 — escenario activo en el Simulador
}

// ---------------------------------------------------------------------------
// Proyección de ahorro (R15)
// ---------------------------------------------------------------------------

export interface PuntoProyeccion {
  mes: number; // 0 = hoy
  fecha: string; // ISO date
  ahorroAcumulado: Cents;
  objetivoCreciente: Cents;
  diferencia: Cents; // ahorroAcumulado - objetivoCreciente (positivo = superado)
}

export interface InputProyeccion {
  ahorroInicial: Cents;
  ahorroMensual: Cents;
  extraordinarios: readonly IngresoExtraordinario[];
  fechaInicio: string; // ISO date
  precioObjetivo: Cents;
  crecimientoAnualPrecio: number; // decimal; 0 por defecto
  rentabilidadAnualAhorro: number; // decimal; 0 por defecto
  mesesMaximos: number; // límite de la proyección
}
