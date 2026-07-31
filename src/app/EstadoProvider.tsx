import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
} from '@/domain/types';
import {
  cargarEstado,
  exportarJSON,
  guardarEstadoAhora,
  guardarEstadoConDebounce,
  importarJSON,
  limpiarDatosConservandoConfiguracion,
} from '@/storage/store';
import { fetchAverageMortgageTin } from '@/services/ineMortgageRate';

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
  exportarDatos: () => string;
  importarDatos: (json: string) => boolean;
  restablecerDatos: () => void;
  refrescarTinIne: (forzar?: boolean) => Promise<void>;
  estadoConsultaTinIne: 'inactivo' | 'cargando' | 'actualizado' | 'cache' | 'respaldo' | 'error';
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
    guardarEstadoConDebounce(estado);
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

  const actualizarPerfil = useCallback((cambios: Partial<PerfilFinanciero>) => {
    setEstado((prev) => ({
      ...prev,
      perfil: { ...prev.perfil, ...cambios },
    }));
  }, []);

  const actualizarPreferencias = useCallback((cambios: Partial<PreferenciasCompra>) => {
    setEstado((prev) => ({
      ...prev,
      preferencias: { ...prev.preferencias, ...cambios },
    }));
  }, []);

  const actualizarGastos = useCallback((cambios: Partial<GastosCompra>) => {
    setEstado((prev) => ({
      ...prev,
      gastos: { ...prev.gastos, ...cambios },
    }));
  }, []);

  const actualizarCostesRecurrentes = useCallback((cambios: Partial<CostesRecurrentes>) => {
    setEstado((prev) => ({
      ...prev,
      costesRecurrentes: { ...prev.costesRecurrentes, ...cambios },
    }));
  }, []);

  const actualizarAjustes = useCallback((cambios: Partial<Ajustes>) => {
    setEstado((prev) => ({
      ...prev,
      ajustes: { ...prev.ajustes, ...cambios },
    }));
  }, []);

  const actualizarEscenarioSimulador = useCallback((cambios: Partial<EscenarioHipoteca>) => {
    setEstado((prev) => ({
      ...prev,
      escenarioSimulador: { ...prev.escenarioSimulador, ...cambios },
    }));
  }, []);

  const actualizarOfertas = useCallback((ofertas: OfertaBancaria[]) => {
    setEstado((prev) => ({ ...prev, ofertas }));
  }, []);

  const exportarDatos = useCallback(() => exportarJSON(estado), [estado]);

  const importarDatos = useCallback((json: string): boolean => {
    const resultado = importarJSON(json);
    if (resultado === null) return false;
    guardarEstadoAhora(resultado);
    setEstado(resultado);
    return true;
  }, []);

  const restablecerDatos = useCallback(() => {
    setEstado((prev) => {
      const estadoLimpio = limpiarDatosConservandoConfiguracion(prev);
      guardarEstadoAhora(estadoLimpio);
      return estadoLimpio;
    });
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
    exportarDatos,
    importarDatos,
    restablecerDatos,
    refrescarTinIne,
    estadoConsultaTinIne: estado.ajustes.tinFuente === 'ine' ? estadoConsultaTinIne : 'inactivo',
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
