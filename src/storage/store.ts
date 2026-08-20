import type { EscenarioHipoteca, EstadoPersistido } from '@/domain/types';
import type { z } from 'zod';
import { zEstadoPersistido } from '@/storage/schema';
import { ESTADO_INICIAL } from '@/storage/defaults';

// Zod 4 infiere las propiedades opcionales como `T | undefined`, que entra en
// conflicto con exactOptionalPropertyTypes. El cast es seguro porque el schema
// Zod y la interfaz TypeScript definen la misma forma; la diferencia es solo
// de representación del tipo opcional.
type ZodEstado = z.infer<typeof zEstadoPersistido>;
function zodADominio(data: ZodEstado): EstadoPersistido {
  // La inferencia de Zod 4 produce `T | undefined` en campos opcionales, que entra
  // en conflicto con exactOptionalPropertyTypes. El cast es seguro (misma forma).
  const escenarioSimulador: EscenarioHipoteca =
    data.escenarioSimulador ?? ESTADO_INICIAL.escenarioSimulador;
  const viviendas = (data.viviendas ?? []).map((vivienda) => {
    const { origenInmobiliaria, catalogoViviendaId, yaNoDisponible, ...viviendaBase } = vivienda;
    return {
      ...viviendaBase,
      ...(origenInmobiliaria === undefined ? {} : { origenInmobiliaria }),
      ...(catalogoViviendaId === undefined ? {} : { catalogoViviendaId }),
      ...(yaNoDisponible === undefined ? {} : { yaNoDisponible }),
    };
  });
  return {
    ...(data as EstadoPersistido),
    escenarioSimulador,
    viviendas,
  };
}

const CLAVE = 'hipotecas-v1';
const CLAVE_RECUPERACION = 'hipotecas-recuperacion-v1';
// La versión soportada debe tener una única fuente de verdad. Mantener una
// constante independiente permitió que el estado inicial avanzase a v13
// mientras las cargas seguían considerando v12 como la versión actual.
const SCHEMA_ACTUAL = ESTADO_INICIAL.schemaVersion;

// Referencia al timer de debounce; vive a nivel de módulo para persistir entre llamadas.
let timerId: ReturnType<typeof setTimeout> | null = null;
let estadoPendiente: EstadoPersistido | null = null;
let onResultadoPendiente: ((guardado: boolean) => void) | undefined;

function esVersionFutura(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || !('schemaVersion' in data)) return false;
  const { schemaVersion } = data as { schemaVersion?: unknown };
  return (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    schemaVersion > SCHEMA_ACTUAL
  );
}

function escribirEstado(estado: EstadoPersistido): boolean {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
    return true;
  } catch (error) {
    console.error('[store] No se pudo guardar el estado:', error);
    return false;
  }
}

function cancelarGuardadoPendiente(): void {
  if (timerId !== null) clearTimeout(timerId);
  timerId = null;
  estadoPendiente = null;
  onResultadoPendiente = undefined;
}

// ---------------------------------------------------------------------------
// Migraciones
// ---------------------------------------------------------------------------

function migrar(data: EstadoPersistido): EstadoPersistido {
  const versionInicial = data.schemaVersion;
  if (data.schemaVersion < 2) {
    data = {
      ...data,
      schemaVersion: 2,
      escenarioSimulador: ESTADO_INICIAL.escenarioSimulador,
    };
  }
  if (data.schemaVersion < 3) {
    const perfil = data.perfil;
    const listaExistente = perfil.otrosIngresos ?? [];
    // Si había ingresos guardados como escalar pero no hay lista, crear un ítem
    const otrosIngresos =
      listaExistente.length === 0 && perfil.otrosIngresosMensuales > 0
        ? [
            {
              id: crypto.randomUUID(),
              concepto: 'Otros ingresos',
              importe: perfil.otrosIngresosMensuales,
              periodicidad: 'mensual' as const,
            },
          ]
        : listaExistente;
    data = {
      ...data,
      schemaVersion: 3,
      perfil: {
        ...perfil,
        otrosIngresos,
        deudas: perfil.deudas.map((d) => ({
          ...d,
          periodicidad: d.periodicidad ?? 'mensual',
        })),
      },
    };
  }
  if (data.schemaVersion < 4) {
    data = limpiarDatosConservandoConfiguracion(data);
  }
  if (versionInicial < 5) {
    data = {
      ...data,
      schemaVersion: 5,
      gastos: {
        ...data.gastos,
        inmobiliariaPorcentaje:
          data.gastos.inmobiliariaPorcentaje === 0
            ? ESTADO_INICIAL.gastos.inmobiliariaPorcentaje
            : data.gastos.inmobiliariaPorcentaje,
      },
    };
  }
  if (versionInicial < 6) {
    const tinEraElValorInicialAnterior = data.ajustes.tinPorDefecto === 0.035;
    data = {
      ...data,
      schemaVersion: 6,
      ajustes: {
        ...data.ajustes,
        tinPorDefecto: tinEraElValorInicialAnterior
          ? ESTADO_INICIAL.ajustes.tinPorDefecto
          : data.ajustes.tinPorDefecto,
        tinFuente: tinEraElValorInicialAnterior ? 'ine' : 'manual',
        ...(tinEraElValorInicialAnterior
          ? { tinReferenciaPeriodo: ESTADO_INICIAL.ajustes.tinReferenciaPeriodo }
          : {}),
      },
    };
  }
  if (versionInicial < 7) {
    data = {
      ...data,
      schemaVersion: 7,
      viviendas: [],
    };
  }
  if (versionInicial < 8) {
    data = {
      ...data,
      schemaVersion: 8,
      viviendas: data.viviendas.map((vivienda) => ({
        ...vivienda,
        reformas:
          vivienda.reformas.length > 0 ||
          (vivienda.reforma === '' && vivienda.presupuestoReforma === 0)
            ? vivienda.reformas
            : [
                {
                  id: crypto.randomUUID(),
                  concepto: vivienda.reforma === '' ? 'Reforma estimada' : vivienda.reforma,
                  costeEstimado: vivienda.presupuestoReforma,
                },
              ],
      })),
    };
  }
  if (versionInicial < 9) {
    data = {
      ...data,
      schemaVersion: 9,
      viviendas: data.viviendas.map((vivienda) => ({
        ...vivienda,
        nombre: vivienda.nombre === '' ? vivienda.direccion : vivienda.nombre,
      })),
    };
  }
  if (versionInicial < 10) {
    data = {
      ...data,
      schemaVersion: 10,
      viviendas: data.viviendas.map((vivienda) => ({ ...vivienda, fecha: vivienda.fecha })),
    };
  }
  if (versionInicial < 11) {
    data = {
      ...data,
      schemaVersion: 11,
      viviendas: data.viviendas.map((vivienda) => ({
        ...vivienda,
        anuncioUrl: vivienda.anuncioUrl,
        habitaciones: vivienda.habitaciones,
      })),
    };
  }
  if (versionInicial < 12) {
    data = {
      ...data,
      schemaVersion: 12,
      viviendas: data.viviendas.map((vivienda) => ({
        ...vivienda,
        sourceUrl: vivienda.anuncioUrl,
        sourceListingId: '',
        rawListingText: '',
        priceHistory: [],
      })),
    };
  }
  if (versionInicial < 13) {
    data = {
      ...data,
      schemaVersion: 13,
      viviendas: data.viviendas.map((vivienda) => ({
        ...vivienda,
        telefono: vivienda.telefono ?? '',
      })),
    };
  }
  if (versionInicial < 14) {
    data = {
      ...data,
      schemaVersion: 14,
      perfil: {
        ...data.perfil,
        gastoGeneralMensual:
          data.perfil.gastoGeneralMensual ?? ESTADO_INICIAL.perfil.gastoGeneralMensual,
      },
    };
  }
  if (versionInicial < 15) {
    data = {
      ...data,
      schemaVersion: 15,
      perfil: {
        ...data.perfil,
        // Los datos anteriores sumaban ambos valores. Conservamos el detalle
        // cuando existe para no ocultar gastos que el usuario ya había registrado.
        modoGastosMensuales: data.perfil.gastosFijos.length > 0 ? 'desglosado' : 'general',
      },
    };
  }
  if (versionInicial < 16) {
    data = {
      ...data,
      schemaVersion: 16,
      perfil: {
        ...data.perfil,
        modoOtrosIngresos: data.perfil.otrosIngresos.length > 0 ? 'desglosado' : 'general',
      },
    };
  }
  return data;
}

/**
 * Quita los datos del usuario sin perder parámetros de cálculo, fiscalidad,
 * gastos configurables ni el rango usado por la escala de precios.
 */
export function limpiarDatosConservandoConfiguracion(data: EstadoPersistido): EstadoPersistido {
  return {
    ...ESTADO_INICIAL,
    gastos: data.gastos,
    ajustes: data.ajustes,
    preferencias: {
      ...ESTADO_INICIAL.preferencias,
      precioMinExplorar: data.preferencias.precioMinExplorar,
      precioMaxExplorar: data.preferencias.precioMaxExplorar,
      pasoEscala: data.preferencias.pasoEscala,
    },
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function cargarEstado(): EstadoPersistido {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CLAVE);
  } catch {
    return ESTADO_INICIAL;
  }
  if (raw === null) return ESTADO_INICIAL;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    guardarDatosRecuperacion(raw);
    return ESTADO_INICIAL;
  }

  // Zod elimina por defecto las propiedades desconocidas. Una copia creada
  // por una versión posterior debe rechazarse antes de analizarla para no
  // guardar de nuevo una representación incompleta.
  if (esVersionFutura(parsed)) {
    console.error('[store] El estado fue creado por una versión posterior de la aplicación.');
    guardarDatosRecuperacion(raw);
    return ESTADO_INICIAL;
  }

  const resultado = zEstadoPersistido.safeParse(parsed);
  if (!resultado.success) {
    console.error('[store] Estado almacenado no válido:', resultado.error);
    guardarDatosRecuperacion(raw);
    return ESTADO_INICIAL;
  }

  const estado = zodADominio(resultado.data);

  if (estado.schemaVersion < SCHEMA_ACTUAL) {
    return migrar(estado);
  }

  return estado;
}

export function guardarEstadoConDebounce(
  estado: EstadoPersistido,
  onResultado?: (guardado: boolean) => void,
): void {
  if (timerId !== null) clearTimeout(timerId);
  estadoPendiente = estado;
  onResultadoPendiente = onResultado;
  timerId = setTimeout(() => {
    const pendiente = estadoPendiente;
    const callback = onResultadoPendiente;
    timerId = null;
    estadoPendiente = null;
    onResultadoPendiente = undefined;
    if (pendiente === null) return;
    callback?.(escribirEstado(pendiente));
  }, 500);
}

/** Fuerza la escritura del último estado programado, por ejemplo al ocultar o cerrar la página. */
export function guardarEstadoPendienteAhora(): boolean {
  if (estadoPendiente === null) return true;
  const pendiente = estadoPendiente;
  const callback = onResultadoPendiente;
  cancelarGuardadoPendiente();
  const guardado = escribirEstado(pendiente);
  callback?.(guardado);
  return guardado;
}

export function guardarEstadoAhora(estado: EstadoPersistido): boolean {
  cancelarGuardadoPendiente();
  return escribirEstado(estado);
}

export function exportarJSON(estado: EstadoPersistido): string {
  return JSON.stringify(estado, null, 2);
}

export function importarJSON(json: string): EstadoPersistido | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (esVersionFutura(parsed)) {
    console.error('[store] El archivo fue creado por una versión posterior de la aplicación.');
    return null;
  }

  const resultado = zEstadoPersistido.safeParse(parsed);
  if (!resultado.success) {
    console.error('[store] JSON importado no válido:', resultado.error);
    return null;
  }
  const estado = zodADominio(resultado.data);
  return estado.schemaVersion < SCHEMA_ACTUAL ? migrar(estado) : estado;
}

export function limpiarAlmacenamiento(): void {
  cancelarGuardadoPendiente();
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // El estado en memoria se puede restablecer aunque el navegador bloquee storage.
  }
}

function guardarDatosRecuperacion(raw: string): void {
  try {
    localStorage.setItem(CLAVE_RECUPERACION, raw);
  } catch {
    // Si storage está completamente bloqueado no existe un segundo lugar local seguro.
  }
}

/** Devuelve el último estado inválido conservado para que el usuario pueda rescatarlo. */
export function obtenerDatosRecuperacion(): string | null {
  try {
    return localStorage.getItem(CLAVE_RECUPERACION);
  } catch {
    return null;
  }
}

export function descartarDatosRecuperacion(): void {
  try {
    localStorage.removeItem(CLAVE_RECUPERACION);
  } catch {
    // No debe impedir que la aplicación siga funcionando.
  }
}
