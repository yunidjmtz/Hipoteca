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
  const viviendas = data.viviendas ?? [];
  return {
    ...(data as EstadoPersistido),
    escenarioSimulador,
    viviendas,
  };
}

const CLAVE = 'hipotecas-v1';
const SCHEMA_ACTUAL = 10;

// Referencia al timer de debounce; vive a nivel de módulo para persistir entre llamadas.
let timerId: ReturnType<typeof setTimeout> | null = null;

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
  const raw = localStorage.getItem(CLAVE);
  if (raw === null) return ESTADO_INICIAL;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ESTADO_INICIAL;
  }

  const resultado = zEstadoPersistido.safeParse(parsed);
  if (!resultado.success) {
    console.error('[store] Estado almacenado no válido:', resultado.error);
    return ESTADO_INICIAL;
  }

  const estado = zodADominio(resultado.data);

  if (estado.schemaVersion < SCHEMA_ACTUAL) {
    return migrar(estado);
  }

  return estado;
}

export function guardarEstadoConDebounce(estado: EstadoPersistido): void {
  if (timerId !== null) clearTimeout(timerId);
  timerId = setTimeout(() => {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
    timerId = null;
  }, 500);
}

export function guardarEstadoAhora(estado: EstadoPersistido): void {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  localStorage.setItem(CLAVE, JSON.stringify(estado));
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

  const resultado = zEstadoPersistido.safeParse(parsed);
  if (!resultado.success) {
    console.error('[store] JSON importado no válido:', resultado.error);
    return null;
  }
  const estado = zodADominio(resultado.data);
  return estado.schemaVersion < SCHEMA_ACTUAL ? migrar(estado) : estado;
}

export function limpiarAlmacenamiento(): void {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  localStorage.removeItem(CLAVE);
}
