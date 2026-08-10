import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
  Ajustes,
  CostesRecurrentes,
  EscenarioHipoteca,
  EstadoPersistido,
  GastosCompra,
  OfertaBancaria,
  PerfilFinanciero,
  PreferenciasCompra,
  ViviendaGuardada,
  InmobiliariaActivaDemo,
} from '@/domain/types';
import {
  cargarEstado,
  descartarDatosRecuperacion,
  exportarJSON,
  guardarEstadoAhora,
  guardarEstadoConDebounce,
  importarJSON,
  limpiarDatosConservandoConfiguracion,
  obtenerDatosRecuperacion,
} from '@/storage/store';
import { fetchAverageMortgageTin } from '@/services/ineMortgageRate';
import {
  confirmarCopiaSeguridad,
  hayCopiaSeguridadPendiente,
  marcarCopiaSeguridadPendiente,
} from '@/storage/backup';

// ---------------------------------------------------------------------------
// Contrato público del contexto
// ---------------------------------------------------------------------------

interface AccionesEstado {
  actualizarPerfil: (cambios: Partial<PerfilFinanciero>) => void;
  actualizarPreferencias: (cambios: Partial<PreferenciasCompra>) => void;
  actualizarGastos: (cambios: Partial<GastosCompra>) => void;
  actualizarCostesRecurrentes: (cambios: Partial<CostesRecurrentes>) => void;
  actualizarAjustes: (cambios: Partial<Ajustes>) => void;
  actualizarEscenarioSimulador: (cambios: Partial<EscenarioHipoteca>) => void;
  actualizarOfertas: (ofertas: OfertaBancaria[]) => void;
  actualizarViviendas: (viviendas: ViviendaGuardada[]) => void;
  actualizarInmobiliariaActivaDemo: (inmobiliaria: InmobiliariaActivaDemo | null) => void;
  exportarDatos: () => string;
  confirmarCopiaDescargada: () => void;
  importarDatos: (json: string) => boolean;
  restablecerDatos: () => void;
  refrescarTinIne: (forzar?: boolean) => Promise<void>;
  estadoConsultaTinIne: 'inactivo' | 'cargando' | 'actualizado' | 'cache' | 'respaldo' | 'error';
  copiaSeguridadPendiente: boolean;
  estadoPersistencia: 'guardado' | 'guardando' | 'error';
  datosRecuperacion: string | null;
  descartarRecuperacion: () => void;
}

type ValorContexto = { estado: EstadoPersistido } & AccionesEstado;

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

const EstadoContexto = createContext<ValorContexto | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EstadoProvider({ children }: { readonly children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoPersistido>(() => cargarEstado());
  const [estadoConsultaTinIne, setEstadoConsultaTinIne] =
    useState<AccionesEstado['estadoConsultaTinIne']>('inactivo');
  const [estadoPersistencia, setEstadoPersistencia] =
    useState<AccionesEstado['estadoPersistencia']>('guardado');
  const [datosRecuperacion, setDatosRecuperacion] = useState<string | null>(() =>
    obtenerDatosRecuperacion(),
  );
  const [, actualizarRevisionCopiaSeguridad] = useReducer((revision: number) => revision + 1, 0);
  const copiaSeguridadPendiente = hayCopiaSeguridadPendiente();

  const registrarCambioSinCopia = useCallback(() => {
    marcarCopiaSeguridadPendiente();
    actualizarRevisionCopiaSeguridad();
  }, []);

  const refrescarTinIne = useCallback(async (forzar = false): Promise<void> => {
    setEstadoConsultaTinIne('cargando');
    try {
      const referencia = await fetchAverageMortgageTin({ force: forzar });
      setEstado((prev) =>
        prev.ajustes.tinFuente === 'ine'
          ? {
              ...prev,
              ajustes: {
                ...prev.ajustes,
                tinPorDefecto: referencia.rate,
                tinReferenciaPeriodo: referencia.period,
                tinReferenciaConsultadoEl: referencia.consultedAt,
              },
            }
          : prev,
      );
      setEstadoConsultaTinIne(
        referencia.stale ? 'respaldo' : referencia.fromCache ? 'cache' : 'actualizado',
      );
    } catch {
      setEstadoConsultaTinIne('error');
    }
  }, []);

  // Persiste cada vez que el estado cambia.
  useEffect(() => {
    guardarEstadoConDebounce(estado, (guardado) =>
      setEstadoPersistencia(guardado ? 'guardado' : 'error'),
    );
  }, [estado]);

  useEffect(() => {
    if (estado.ajustes.tinFuente !== 'ine') return;
    let ignorarResultado = false;

    void fetchAverageMortgageTin()
      .then((referencia) => {
        if (ignorarResultado) return;
        setEstado((prev) =>
          prev.ajustes.tinFuente === 'ine'
            ? {
                ...prev,
                ajustes: {
                  ...prev.ajustes,
                  tinPorDefecto: referencia.rate,
                  tinReferenciaPeriodo: referencia.period,
                  tinReferenciaConsultadoEl: referencia.consultedAt,
                },
              }
            : prev,
        );
        setEstadoConsultaTinIne(
          referencia.stale ? 'respaldo' : referencia.fromCache ? 'cache' : 'actualizado',
        );
      })
      .catch(() => {
        if (!ignorarResultado) setEstadoConsultaTinIne('error');
      });

    return () => {
      ignorarResultado = true;
    };
  }, [estado.ajustes.tinFuente]);

  const actualizarPerfil = useCallback(
    (cambios: Partial<PerfilFinanciero>) => {
      setEstado((prev) => ({
        ...prev,
        perfil: { ...prev.perfil, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarPreferencias = useCallback(
    (cambios: Partial<PreferenciasCompra>) => {
      setEstado((prev) => ({
        ...prev,
        preferencias: { ...prev.preferencias, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarGastos = useCallback(
    (cambios: Partial<GastosCompra>) => {
      setEstado((prev) => ({
        ...prev,
        gastos: { ...prev.gastos, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarCostesRecurrentes = useCallback(
    (cambios: Partial<CostesRecurrentes>) => {
      setEstado((prev) => ({
        ...prev,
        costesRecurrentes: { ...prev.costesRecurrentes, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarAjustes = useCallback(
    (cambios: Partial<Ajustes>) => {
      setEstado((prev) => ({
        ...prev,
        ajustes: { ...prev.ajustes, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarEscenarioSimulador = useCallback(
    (cambios: Partial<EscenarioHipoteca>) => {
      setEstado((prev) => ({
        ...prev,
        escenarioSimulador: { ...prev.escenarioSimulador, ...cambios },
      }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarOfertas = useCallback(
    (ofertas: OfertaBancaria[]) => {
      setEstado((prev) => ({ ...prev, ofertas }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarViviendas = useCallback(
    (viviendas: ViviendaGuardada[]) => {
      setEstado((prev) => ({ ...prev, viviendas }));
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const actualizarInmobiliariaActivaDemo = useCallback(
    (inmobiliaria: InmobiliariaActivaDemo | null) => {
      setEstado((prev) => {
        if (inmobiliaria !== null) return { ...prev, inmobiliariaActivaDemo: inmobiliaria };
        const sinInmobiliaria: EstadoPersistido = { ...prev };
        delete sinInmobiliaria.inmobiliariaActivaDemo;
        return sinInmobiliaria;
      });
      registrarCambioSinCopia();
    },
    [registrarCambioSinCopia],
  );

  const exportarDatos = useCallback(() => {
    return exportarJSON(estado);
  }, [estado]);

  const confirmarCopiaDescargada = useCallback(() => {
    confirmarCopiaSeguridad();
    actualizarRevisionCopiaSeguridad();
  }, []);

  const importarDatos = useCallback((json: string): boolean => {
    const resultado = importarJSON(json);
    if (resultado === null) return false;
    const guardado = guardarEstadoAhora(resultado);
    setEstadoPersistencia(guardado ? 'guardado' : 'error');
    setEstado(resultado);
    confirmarCopiaSeguridad();
    actualizarRevisionCopiaSeguridad();
    return true;
  }, []);

  const restablecerDatos = useCallback(() => {
    const estadoLimpio = limpiarDatosConservandoConfiguracion(estado);
    confirmarCopiaSeguridad();
    actualizarRevisionCopiaSeguridad();
    const guardado = guardarEstadoAhora(estadoLimpio);
    setEstadoPersistencia(guardado ? 'guardado' : 'error');
    setEstado(estadoLimpio);
  }, [estado]);

  const descartarRecuperacion = useCallback(() => {
    descartarDatosRecuperacion();
    setDatosRecuperacion(null);
  }, []);

  const valor: ValorContexto = {
    estado,
    actualizarPerfil,
    actualizarPreferencias,
    actualizarGastos,
    actualizarCostesRecurrentes,
    actualizarAjustes,
    actualizarEscenarioSimulador,
    actualizarOfertas,
    actualizarViviendas,
    actualizarInmobiliariaActivaDemo,
    exportarDatos,
    confirmarCopiaDescargada,
    importarDatos,
    restablecerDatos,
    refrescarTinIne,
    estadoConsultaTinIne: estado.ajustes.tinFuente === 'ine' ? estadoConsultaTinIne : 'inactivo',
    copiaSeguridadPendiente,
    estadoPersistencia,
    datosRecuperacion,
    descartarRecuperacion,
  };

  return <EstadoContexto.Provider value={valor}>{children}</EstadoContexto.Provider>;
}

// ---------------------------------------------------------------------------
// Hook público
// ---------------------------------------------------------------------------

// El hook comparte este módulo con el proveedor para mantener un único contrato.
// eslint-disable-next-line react-refresh/only-export-components
export function useEstado(): ValorContexto {
  const ctx = useContext(EstadoContexto);
  if (ctx === null) {
    throw new Error('useEstado debe usarse dentro de <EstadoProvider>');
  }
  return ctx;
}
