import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCents, ZERO } from '@/core/money';
import { ESTADO_INICIAL } from '@/storage/defaults';
import {
  cargarEstado,
  exportarJSON,
  guardarEstadoAhora,
  guardarEstadoConDebounce,
  guardarEstadoPendienteAhora,
  importarJSON,
  limpiarDatosConservandoConfiguracion,
  obtenerDatosRecuperacion,
} from '@/storage/store';
import type { EstadoPersistido } from '@/domain/types';

function estadoConDatos(): EstadoPersistido {
  return {
    ...ESTADO_INICIAL,
    schemaVersion: 3,
    perfil: {
      ...ESTADO_INICIAL.perfil,
      titulares: [
        {
          netoPorPaga: toCents(2_500),
          numeroPagas: 14,
          edad: 42,
          situacionLaboral: 'funcionario',
        },
      ],
      ahorrosActuales: toCents(50_000),
      ahorroMensualPrevisto: toCents(800),
    },
    preferencias: {
      ...ESTADO_INICIAL.preferencias,
      precioObjetivo: toCents(220_000),
      precioMinExplorar: toCents(80_000),
      precioMaxExplorar: toCents(400_000),
      pasoEscala: 20000,
    },
    gastos: {
      ...ESTADO_INICIAL.gastos,
      notariaCompraventa: toCents(1_250),
      inmobiliariaPorcentaje: 0,
    },
    ajustes: {
      ...ESTADO_INICIAL.ajustes,
      tinPorDefecto: 0.041,
    },
    escenarioSimulador: {
      ...ESTADO_INICIAL.escenarioSimulador,
      precioCompra: toCents(220_000),
      valorTasacion: toCents(210_000),
      importeSolicitado: toCents(168_000),
    },
  };
}

describe('limpieza de datos', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parte sin importes personales ni ejemplos precargados', () => {
    expect(ESTADO_INICIAL.schemaVersion).toBe(13);
    expect(ESTADO_INICIAL.perfil.titulares[0].netoPorPaga).toBe(ZERO);
    expect(ESTADO_INICIAL.perfil.ahorrosActuales).toBe(ZERO);
    expect(ESTADO_INICIAL.preferencias.precioObjetivo).toBe(ZERO);
    expect(ESTADO_INICIAL.escenarioSimulador.precioCompra).toBe(ZERO);
    expect(ESTADO_INICIAL.escenarioSimulador.valorTasacion).toBe(ZERO);
    expect(ESTADO_INICIAL.escenarioSimulador.importeSolicitado).toBe(ZERO);
  });

  it('borra datos y conserva la configuración ajustada', () => {
    const previo = estadoConDatos();
    const limpio = limpiarDatosConservandoConfiguracion(previo);

    expect(limpio.perfil.titulares[0].netoPorPaga).toBe(ZERO);
    expect(limpio.perfil.ahorrosActuales).toBe(ZERO);
    expect(limpio.preferencias.precioObjetivo).toBe(ZERO);
    expect(limpio.escenarioSimulador.precioCompra).toBe(ZERO);
    expect(limpio.simulaciones).toEqual([]);
    expect(limpio.ofertas).toEqual([]);
    expect(limpio.viviendas).toEqual([]);
    expect(limpio.metas).toEqual([]);

    expect(limpio.gastos).toEqual(previo.gastos);
    expect(limpio.ajustes).toEqual(previo.ajustes);
    expect(limpio.preferencias.precioMinExplorar).toBe(toCents(80_000));
    expect(limpio.preferencias.precioMaxExplorar).toBe(toCents(400_000));
    expect(limpio.preferencias.pasoEscala).toBe(20000);
  });

  it('limpia una sola vez los datos ya guardados con schema 3', () => {
    const previo = estadoConDatos();
    localStorage.setItem('hipotecas-v1', JSON.stringify(previo));

    const cargado = cargarEstado();

    expect(cargado.schemaVersion).toBe(13);
    expect(cargado.perfil.titulares[0].netoPorPaga).toBe(ZERO);
    expect(cargado.preferencias.precioObjetivo).toBe(ZERO);
    expect(cargado.escenarioSimulador.importeSolicitado).toBe(ZERO);
    expect(cargado.gastos.notariaCompraventa).toBe(toCents(1_250));
    expect(cargado.gastos.inmobiliariaPorcentaje).toBe(0.03);
    expect(cargado.ajustes.tinPorDefecto).toBe(0.041);
    expect(cargado.ajustes.tinFuente).toBe('manual');
  });

  it('migra el antiguo TIN inicial al modo automático del INE', () => {
    const previo = {
      ...estadoConDatos(),
      schemaVersion: 5,
      ajustes: {
        ...ESTADO_INICIAL.ajustes,
        tinPorDefecto: 0.035,
      },
    };
    localStorage.setItem('hipotecas-v1', JSON.stringify(previo));

    const cargado = cargarEstado();

    expect(cargado.schemaVersion).toBe(13);
    expect(cargado.ajustes.tinFuente).toBe('ine');
    expect(cargado.ajustes.tinPorDefecto).toBe(0.0298);
    expect(cargado.ajustes.tinReferenciaPeriodo).toBe('2026-05');
  });

  it('añade una colección de viviendas vacía a los datos anteriores', () => {
    const sinViviendas: Partial<EstadoPersistido> = {
      ...ESTADO_INICIAL,
      schemaVersion: 6,
    };
    delete sinViviendas.viviendas;
    localStorage.setItem('hipotecas-v1', JSON.stringify(sinViviendas));

    const cargado = cargarEstado();

    expect(cargado.schemaVersion).toBe(13);
    expect(cargado.viviendas).toEqual([]);
  });

  it('añade enlace y habitaciones a las viviendas guardadas antes del importador', () => {
    localStorage.setItem(
      'hipotecas-v1',
      JSON.stringify({
        ...ESTADO_INICIAL,
        schemaVersion: 10,
        viviendas: [
          {
            id: 'anterior',
            nombre: 'Piso anterior',
            fecha: '2026-08-01',
            direccion: 'Zaragoza',
            precioVenta: toCents(180_000),
            presupuestoReforma: ZERO,
            reforma: '',
            superficieM2: 80,
            esExterior: true,
            tieneTrastero: false,
            tieneGaraje: false,
            reformas: [],
            notas: '',
          },
        ],
      }),
    );

    const cargado = cargarEstado();

    expect(cargado.schemaVersion).toBe(13);
    expect(cargado.viviendas[0]?.anuncioUrl).toBe('');
    expect(cargado.viviendas[0]?.telefono).toBe('');
    expect(cargado.viviendas[0]?.habitaciones).toBe(0);
  });

  it('migra la versión 12 a la actual sin borrar un teléfono ya guardado', () => {
    localStorage.setItem(
      'hipotecas-v1',
      JSON.stringify({
        ...ESTADO_INICIAL,
        schemaVersion: 12,
        viviendas: [
          {
            id: 'version-12',
            nombre: 'Piso con contacto',
            fecha: '2026-08-01',
            direccion: 'Zaragoza',
            anuncioUrl: 'https://example.com/piso',
            telefono: '600 123 123',
            precioVenta: toCents(180_000),
            presupuestoReforma: ZERO,
            reforma: '',
            superficieM2: 80,
            habitaciones: 3,
            esExterior: true,
            tieneTrastero: false,
            tieneGaraje: false,
            reformas: [],
            notas: '',
          },
        ],
      }),
    );

    const cargado = cargarEstado();

    expect(cargado.schemaVersion).toBe(13);
    expect(cargado.viviendas[0]?.telefono).toBe('600 123 123');
  });

  it('rechaza versiones futuras sin eliminar el original recuperable', () => {
    const raw = JSON.stringify({
      ...ESTADO_INICIAL,
      schemaVersion: ESTADO_INICIAL.schemaVersion + 1,
      campoDeVersionFutura: 'debe conservarse en bruto',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem('hipotecas-v1', raw);

    expect(cargarEstado()).toEqual(ESTADO_INICIAL);
    expect(obtenerDatosRecuperacion()).toBe(raw);
    expect(importarJSON(raw)).toBeNull();
  });

  it('exporta e importa el estado actual sin modificar sus datos', () => {
    const titularBase = ESTADO_INICIAL.perfil.titulares[0];
    const estado: EstadoPersistido = {
      ...estadoConDatos(),
      schemaVersion: ESTADO_INICIAL.schemaVersion,
      perfil: {
        ...estadoConDatos().perfil,
        titulares: [
          titularBase,
          { ...titularBase, edad: 38, netoPorPaga: toCents(1_800) },
          { ...titularBase, edad: 41, netoPorPaga: toCents(1_200) },
        ],
      },
    };

    expect(importarJSON(exportarJSON(estado))).toEqual(estado);
  });

  it('fuerza el último guardado pendiente antes de que venza el debounce', () => {
    vi.useFakeTimers();
    const onResultado = vi.fn();
    const estado: EstadoPersistido = {
      ...ESTADO_INICIAL,
      preferencias: {
        ...ESTADO_INICIAL.preferencias,
        precioObjetivo: toCents(240_000),
      },
    };

    guardarEstadoConDebounce(estado, onResultado);
    expect(localStorage.getItem('hipotecas-v1')).toBeNull();

    expect(guardarEstadoPendienteAhora()).toBe(true);
    expect(JSON.parse(localStorage.getItem('hipotecas-v1') ?? '{}')).toMatchObject({
      schemaVersion: 13,
      preferencias: { precioObjetivo: toCents(240_000) },
    });
    expect(onResultado).toHaveBeenCalledWith(true);

    vi.runAllTimers();
    expect(onResultado).toHaveBeenCalledTimes(1);
  });

  it('rechaza fechas con formato ISO pero con un día inexistente', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = exportarJSON({
      ...ESTADO_INICIAL,
      escenarioSimulador: {
        ...ESTADO_INICIAL.escenarioSimulador,
        fechaPrimeraCuota: '2026-02-30',
      },
    });

    expect(importarJSON(json)).toBeNull();
  });

  it('rechaza identificadores duplicados en las colecciones persistidas', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deuda = {
      id: 'duplicada',
      concepto: 'Préstamo',
      importe: toCents(100),
      periodicidad: 'mensual' as const,
    };
    const json = exportarJSON({
      ...ESTADO_INICIAL,
      perfil: {
        ...ESTADO_INICIAL.perfil,
        deudas: [deuda, { ...deuda, concepto: 'Otra deuda' }],
      },
    });

    expect(importarJSON(json)).toBeNull();
  });

  it('rechaza umbrales de viabilidad contradictorios', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = exportarJSON({
      ...ESTADO_INICIAL,
      ajustes: {
        ...ESTADO_INICIAL.ajustes,
        umbralesViabilidad: {
          ratioComodo: 0.35,
          ratioAjustado: 0.3,
          ratioViable: 0.32,
        },
      },
    });

    expect(importarJSON(json)).toBeNull();
  });

  it('rechaza tramos fiscales desordenados o sin cierre', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const primeraFiscal = ESTADO_INICIAL.ajustes.fiscal[0]!;
    const json = exportarJSON({
      ...ESTADO_INICIAL,
      ajustes: {
        ...ESTADO_INICIAL.ajustes,
        fiscal: [
          {
            ...primeraFiscal,
            itpTramos: [
              { hasta: 200_000, tipo: 0.08 },
              { hasta: 100_000, tipo: 0.09 },
            ],
          },
        ],
      },
    });

    expect(importarJSON(json)).toBeNull();
  });

  it('conserva para recuperación un estado que no puede validar', () => {
    const raw = '{"schemaVersion":11,"perfil":"dañado"}';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem('hipotecas-v1', raw);

    expect(cargarEstado()).toEqual(ESTADO_INICIAL);
    expect(obtenerDatosRecuperacion()).toBe(raw);
  });

  it('informa del fallo si el navegador rechaza una escritura', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Cuota agotada', 'QuotaExceededError');
    });

    expect(guardarEstadoAhora(ESTADO_INICIAL)).toBe(false);
    setItem.mockRestore();
  });
});
