import type { EstadoPersistido } from '@/domain/types';
import { primerDiaMesSiguienteLocal } from '@/core/dates';
import { toCents, ZERO } from '@/core/money';
import {
  ANIOS_FIJOS_MIXTO_POR_DEFECTO,
  TIN_FIJO_MIXTO_POR_DEFECTO,
} from '@/domain/mortgageScenario';
import { FISCAL_POR_DEFECTO } from '@/config/fiscal';

export const ESTADO_INICIAL: EstadoPersistido = {
  schemaVersion: 13,

  perfil: {
    titulares: [
      {
        netoPorPaga: ZERO,
        numeroPagas: 12,
        edad: 35,
        situacionLaboral: 'indefinido',
      },
    ],
    otrosIngresos: [],
    otrosIngresosMensuales: ZERO,
    deudas: [],
    gastosFijos: [],
    ahorrosActuales: ZERO,
    ahorroMensualPrevisto: ZERO,
    ingresosExtraordinarios: [],
    alquilerActual: ZERO,
  },

  preferencias: {
    ccaa: '',
    provincia: '',
    destino: 'habitual',
    estadoVivienda: 'usada',
    esVpoEspecial: false,
    precioObjetivo: ZERO,
    habitacionesMinimas: 0,
    banosMinimos: 0,
    exterior: false,
    trastero: false,
    garaje: false,
    precioMinExplorar: toCents(100_000),
    precioMaxExplorar: toCents(300_000),
    pasoEscala: 10000,
  },

  gastos: {
    notariaCompraventa: toCents(1_000),
    registroCompraventa: toCents(500),
    gestoriaCompraventa: toCents(500),
    tasacion: toCents(600),
    notaSimple: toCents(10),
    inmobiliariaFijo: toCents(0),
    // Estimación prudente y editable: los honorarios son libres y pueden no
    // corresponder al comprador. Se aplica además el IVA configurado.
    inmobiliariaPorcentaje: 0.03,
    inmobiliariaIva: 0.21,
    brokerFijo: toCents(0),
    brokerPorcentaje: 0,
    reforma: toCents(0),
    muebles: toCents(0),
    mudanza: toCents(0),
    imprevistos: toCents(0),
    otros: toCents(0),
    repercutirGastosHipoteca: false,
  },

  costesRecurrentes: {
    comunidadMensual: toCents(0),
    ibiAnual: toCents(0),
    seguroHogarAnual: toCents(0),
    seguroVidaAnual: toCents(0),
    mantenimientoMensual: toCents(0),
    garajeMensual: toCents(0),
    suministrosMensuales: toCents(0),
    otrosMensuales: toCents(0),
  },

  ajustes: {
    ratioBancarioMaximo: 0.35,
    ratioPersonalObjetivo: 0.3,
    edadMaximaAlVencimiento: 75,
    criterioEdad: 'mayor',
    crecimientoAnualPrecioVivienda: 0,
    rentabilidadAnualAhorro: 0,
    umbralesViabilidad: {
      ratioComodo: 0.3,
      ratioViable: 0.35,
      ratioAjustado: 0.33,
    },
    fiscal: FISCAL_POR_DEFECTO,
    ltvPorDefecto: 0.8,
    plazoPorDefecto: 25,
    // Último dato oficial conocido; la aplicación lo actualiza desde el INE.
    tinPorDefecto: 0.0298,
    tinFuente: 'ine',
    tinReferenciaPeriodo: '2026-05',
  },

  simulaciones: [],
  ofertas: [],
  viviendas: [],
  metas: [],

  escenarioSimulador: {
    id: 'default',
    titulo: 'Mi hipoteca',
    precioCompra: ZERO,
    valorTasacion: ZERO,
    ltv: 0.8,
    importeSolicitado: ZERO,
    plazoAnios: 25,
    tipo: 'fija',
    tinFijo: 0.035,
    euribor: 0.035,
    diferencial: 0.01,
    periodicidadRevision: 'anual',
    mixtaTinFijo: TIN_FIJO_MIXTO_POR_DEFECTO,
    mixtaAniosFijos: ANIOS_FIJOS_MIXTO_POR_DEFECTO,
    sueloTin: 0,
    comisiones: {
      apertura: 0,
      amortizacionParcial: 0,
      amortizacionTotal: 0,
      subrogacion: ZERO,
      novacion: ZERO,
      otras: ZERO,
    },
    vinculaciones: [],
    fechaPrimeraCuota: primerDiaMesSiguienteLocal(),
  },
};
