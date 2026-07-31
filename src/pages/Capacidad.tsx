import { useMemo } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Explicacion } from '@/components/Explicacion';
import { Panel } from '@/components/Panel';
import { formatEuros } from '@/core/format';
import { toCents } from '@/core/money';
import { buscarPrecioMaximo, evaluarPrecio, factorLimitante } from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import type { ResultadoBusqueda } from '@/domain/types';

interface FilaPrecio {
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly resultado: ResultadoBusqueda;
}

function textoFactor(factor: ReturnType<typeof factorLimitante>): string {
  switch (factor) {
    case 'ahorro':
      return 'Tu ahorro es el principal límite. El desembolso incluye entrada, impuestos, notaría, tasación e inmobiliaria.';
    case 'cuota':
      return 'La cuota mensual es el principal límite. Reducir el precio o ampliar el plazo la haría más asumible.';
    case 'ahorro_y_cuota':
      return 'Tanto el ahorro disponible como la cuota mensual son factores limitantes en este precio.';
    case 'tasacion':
      return 'La tasación del inmueble limita el importe máximo financiable.';
    case 'edad':
      return 'La edad de los titulares acorta el plazo máximo, lo que eleva la cuota.';
    case 'ninguno':
      return 'No hay factores limitantes para el precio objetivo actual.';
  }
}

export function Capacidad() {
  const { estado } = useEstado();
  const { preferencias, ajustes } = estado;

  const rango = useMemo(
    () => ({
      min: toCents(50_000),
      max: toCents(2_000_000),
    }),
    [],
  );

  const ctx = useMemo(
    () => construirContexto(estado, preferencias.precioObjetivo),
    [estado, preferencias.precioObjetivo],
  );

  const ctxFactory = useMemo(
    () => (p: ReturnType<typeof toCents>) => construirContexto(estado, p),
    [estado],
  );

  const evaluacionObjetivo = useMemo(
    () => evaluarPrecio(preferencias.precioObjetivo, ctx),
    [preferencias.precioObjetivo, ctx],
  );

  const porAhorro = useMemo(
    () => buscarPrecioMaximo((e) => e.faltante === 0, ctxFactory, rango),
    [ctxFactory, rango],
  );

  const porIngresos = useMemo(
    () =>
      buscarPrecioMaximo((e) => e.ratioBancario <= ajustes.ratioBancarioMaximo, ctxFactory, rango),
    [ctxFactory, rango, ajustes.ratioBancarioMaximo],
  );

  const porComodo = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.ratioBancario <= ajustes.ratioPersonalObjetivo,
        ctxFactory,
        rango,
      ),
    [ctxFactory, rango, ajustes.ratioPersonalObjetivo],
  );

  const porViable = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.estado === 'viable' || e.estado === 'comodo' || e.estado === 'ajustado',
        ctxFactory,
        rango,
      ),
    [ctxFactory, rango],
  );

  const porAjustado = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.faltante === 0 && e.ratioBancario <= ajustes.ratioBancarioMaximo + 0.05,
        ctxFactory,
        rango,
      ),
    [ctxFactory, rango, ajustes.ratioBancarioMaximo],
  );

  const factor = factorLimitante(evaluacionObjetivo);

  const filas: readonly FilaPrecio[] = [
    {
      etiqueta: 'Por ahorro',
      descripcion:
        'Precio máximo para el que cubres entrada, impuestos, notaría, tasación e inmobiliaria.',
      resultado: porAhorro,
    },
    {
      etiqueta: 'Por ingresos',
      descripcion: `Precio máximo donde la cuota no supera el ${(ajustes.ratioBancarioMaximo * 100).toFixed(0)} % de los ingresos.`,
      resultado: porIngresos,
    },
    {
      etiqueta: 'Cómodo',
      descripcion: `Precio máximo con desembolso cubierto y cuota por debajo del ${(ajustes.ratioPersonalObjetivo * 100).toFixed(0)} % de los ingresos.`,
      resultado: porComodo,
    },
    {
      etiqueta: 'Viable (estado)',
      descripcion: 'Precio máximo con estado viable, ajustado o cómodo (ahorro y cuota correctos).',
      resultado: porViable,
    },
    {
      etiqueta: 'Margen ajustado',
      descripcion: `Precio máximo con desembolso cubierto y cuota hasta ${((ajustes.ratioBancarioMaximo + 0.05) * 100).toFixed(0)} % de los ingresos.`,
      resultado: porAjustado,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Panel rotulo="Análisis de capacidad" titulo="Precios máximos por criterio">
        <div className="flex flex-col gap-0">
          {filas.map((fila) => (
            <div
              key={fila.etiqueta}
              className="flex flex-col gap-1 border-b border-linea py-3.5 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-tinta">{fila.etiqueta}</p>
                <p className="mt-0.5 text-xs text-tinta-suave">{fila.descripcion}</p>
              </div>
              <div className="shrink-0 text-right">
                {fila.resultado.precioMaximo !== null ? (
                  <span className="font-mono font-semibold text-tinta">
                    {formatEuros(fila.resultado.precioMaximo)}
                  </span>
                ) : (
                  <span className="text-sm text-tinta-suave">No alcanzable</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Explicacion titulo="Factor limitante principal">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 border-b border-linea pb-3">
            <span className="text-sm text-tinta-media">
              Objetivo de {formatEuros(preferencias.precioObjetivo)}
            </span>
            <EstadoBadge estado={evaluacionObjetivo.estado} />
          </div>
          <p>{textoFactor(factor)}</p>
        </div>
      </Explicacion>
    </div>
  );
}
