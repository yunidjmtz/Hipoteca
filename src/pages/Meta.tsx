import { useMemo } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import { formatEuros, formatFecha, formatPorcentaje } from '@/core/format';
import { maxCents, subtractCents, ZERO } from '@/core/money';
import { calcularCapacidadAhorroActual, evaluarPrecio } from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import { mesesHastaObjetivo, proyectarAhorro } from '@/finance/savingsGoal';
import type { PuntoProyeccion } from '@/domain/types';

function GraficaProyeccion({
  puntos,
  meses,
}: {
  readonly puntos: readonly PuntoProyeccion[];
  readonly meses: number;
}) {
  const ultimo = puntos.at(-1);
  if (ultimo === undefined || puntos.length < 2) return null;

  const valorMaximo = Math.max(
    ...puntos.flatMap((punto) => [punto.ahorroAcumulado, punto.objetivoCreciente]),
    1,
  );
  const ancho = 640;
  const alto = 132;
  const lateral = 12;
  const superior = 14;
  const inferior = 26;
  const x = (indice: number) =>
    lateral + (indice / Math.max(1, puntos.length - 1)) * (ancho - lateral * 2);
  const y = (valor: number) =>
    alto - inferior - (valor / valorMaximo) * (alto - superior - inferior);
  const ruta = (campo: 'ahorroAcumulado' | 'objetivoCreciente') =>
    puntos.map((punto, indice) => `${x(indice)},${y(punto[campo])}`).join(' ');
  const rutaEscalonada = puntos.reduce(
    (ruta, punto, indice) =>
      indice === 0
        ? `M ${x(indice)} ${y(punto.ahorroAcumulado)}`
        : `${ruta} H ${x(indice)} V ${y(punto.ahorroAcumulado)}`,
    '',
  );
  const cadenciaEtiquetas = Math.max(1, Math.ceil((puntos.length - 1) / 6));
  const etiquetasEje = puntos.filter(
    (punto) => punto.mes === 0 || punto.mes % cadenciaEtiquetas === 0 || punto.mes === ultimo.mes,
  );
  const detalleMensual =
    puntos.length <= 25
      ? puntos.slice(1)
      : puntos.filter(
          (punto) =>
            punto.mes > 0 && (punto.mes % cadenciaEtiquetas === 0 || punto.mes === ultimo.mes),
        );

  return (
    <div className="mt-5 rounded-grande border border-acento/25 bg-superficie/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-tinta">Camino hacia tu meta</p>
          <p className="mt-0.5 text-xs text-tinta-suave">
            Cada escalón refleja el ahorro acumulado al cerrar ese mes.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-tinta-media">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-acento" /> Tu ahorro
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-linea-fuerte" /> Meta
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-32 w-full overflow-visible"
        role="img"
        aria-label={`Proyección desde hoy hasta alcanzar la meta en ${meses} meses`}
      >
        <defs>
          <linearGradient id="progreso-ahorro" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--c-acento)" />
            <stop offset="100%" stopColor="var(--c-comodo)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((altura) => (
          <line
            key={altura}
            x1={lateral}
            x2={ancho - lateral}
            y1={superior + (alto - superior - inferior) * altura}
            y2={superior + (alto - superior - inferior) * altura}
            stroke="var(--c-linea)"
            strokeDasharray="2 5"
            strokeWidth="1"
          />
        ))}
        <polyline
          points={ruta('objetivoCreciente')}
          fill="none"
          stroke="var(--c-linea-fuerte)"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <path
          d={rutaEscalonada}
          fill="none"
          stroke="url(#progreso-ahorro)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {puntos.slice(1, -1).map((punto, indice) => (
          <circle
            key={punto.mes}
            cx={x(indice + 1)}
            cy={y(punto.ahorroAcumulado)}
            r="2.5"
            fill="var(--c-acento)"
          >
            <title>
              Mes {punto.mes}: {formatEuros(punto.ahorroAcumulado)} acumulados
            </title>
          </circle>
        ))}
        <circle cx={x(0)} cy={y(puntos[0]!.ahorroAcumulado)} r="4" fill="var(--c-acento)">
          <title>Hoy: {formatEuros(puntos[0]!.ahorroAcumulado)} acumulados</title>
        </circle>
        <circle
          cx={x(puntos.length - 1)}
          cy={y(ultimo.ahorroAcumulado)}
          r="6"
          fill="var(--c-comodo)"
          stroke="var(--c-superficie)"
          strokeWidth="3"
        >
          <title>
            Mes {ultimo.mes}: {formatEuros(ultimo.ahorroAcumulado)} acumulados
          </title>
        </circle>
        {etiquetasEje.map((punto) => {
          const indice = puntos.indexOf(punto);
          return (
            <text
              key={punto.mes}
              x={x(indice)}
              y={alto - 4}
              fill="var(--c-tinta-suave)"
              fontSize="10"
              textAnchor={punto.mes === 0 ? 'start' : punto.mes === ultimo.mes ? 'end' : 'middle'}
            >
              {punto.mes === 0 ? 'Hoy' : `Mes ${punto.mes}`}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {detalleMensual.map((punto) => (
          <div key={punto.mes} className="rounded-chico bg-superficie-2/80 px-2.5 py-2">
            <p className="text-[0.65rem] text-tinta-suave">Mes {punto.mes}</p>
            <p className="mt-0.5 font-cifra text-xs font-semibold tabular-nums text-tinta">
              {formatEuros(punto.ahorroAcumulado)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Meta() {
  const { estado } = useEstado();
  const { perfil, preferencias, ajustes } = estado;

  const ctx = useMemo(
    () => construirContexto(estado, preferencias.precioObjetivo),
    [estado, preferencias.precioObjetivo],
  );

  const evaluacion = useMemo(
    () => evaluarPrecio(preferencias.precioObjetivo, ctx),
    [preferencias.precioObjetivo, ctx],
  );

  const capacidadAhorroActual = useMemo(() => calcularCapacidadAhorroActual(perfil), [perfil]);
  const proyeccionInput = useMemo(
    () => ({
      ahorroInicial: perfil.ahorrosActuales,
      ahorroMensual: capacidadAhorroActual,
      extraordinarios: perfil.ingresosExtraordinarios,
      fechaInicio: new Date().toISOString().slice(0, 10),
      precioObjetivo: evaluacion.dineroMinimo,
      crecimientoAnualPrecio: ajustes.crecimientoAnualPrecioVivienda,
      rentabilidadAnualAhorro: ajustes.rentabilidadAnualAhorro,
      mesesMaximos: 120,
    }),
    [perfil, capacidadAhorroActual, ajustes, evaluacion.dineroMinimo],
  );

  const meses = useMemo(() => mesesHastaObjetivo(proyeccionInput), [proyeccionInput]);
  const puntosProyeccion = useMemo(() => proyectarAhorro(proyeccionInput), [proyeccionInput]);

  const ahorroActual = perfil.ahorrosActuales;
  const faltanteAhorro = maxCents(ZERO, subtractCents(evaluacion.dineroMinimo, ahorroActual));
  const progresoPct =
    evaluacion.dineroMinimo > 0
      ? Math.min(100, Math.round((ahorroActual / evaluacion.dineroMinimo) * 100))
      : 0;

  const fechaEstimada =
    meses !== null
      ? (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + meses);
          return formatFecha(d.toISOString().slice(0, 10));
        })()
      : null;

  const tieneMinimo = ahorroActual >= evaluacion.dineroMinimo;
  const puntosHastaMeta =
    meses !== null ? puntosProyeccion.slice(0, Math.min(meses + 1, puntosProyeccion.length)) : [];

  return (
    <div className="flex flex-col gap-5">
      <Panel rotulo="Meta de ahorro" titulo="Ahorro y progreso hacia el objetivo">
        {evaluacion.dineroMinimo <= 0 ? (
          <p className="text-sm text-tinta-media">
            Configura el precio objetivo para ver la proyección.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { etiqueta: 'Ahorro actual', valor: formatEuros(ahorroActual) },
                { etiqueta: 'Mínimo necesario', valor: formatEuros(evaluacion.dineroMinimo) },
                {
                  etiqueta: 'Falta por ahorrar',
                  valor: formatEuros(faltanteAhorro),
                  destacado: faltanteAhorro > 0,
                },
                {
                  etiqueta: 'Capacidad actual / mes',
                  valor: formatEuros(capacidadAhorroActual),
                  detalle: 'Incluye el alquiler actual',
                  acento: true,
                },
              ].map(({ etiqueta, valor, detalle, destacado, acento }) => (
                <div
                  key={etiqueta}
                  className={[
                    'rounded-medio px-4 py-3',
                    destacado
                      ? 'bg-no-viable-tenue'
                      : acento
                        ? 'bg-acento-tenue'
                        : 'bg-superficie-2',
                  ].join(' ')}
                >
                  <p className="text-xs text-tinta-media">{etiqueta}</p>
                  <p
                    className="mt-1 font-cifra text-sm font-semibold tabular-nums"
                    style={{ color: destacado ? 'var(--c-no-viable)' : 'var(--c-tinta)' }}
                  >
                    {valor}
                  </p>
                  {detalle !== undefined && (
                    <p className="mt-0.5 text-xs text-tinta-suave">{detalle}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-tinta-suave">
              El mínimo incluye entrada, impuestos, notaría, registro, gestoría, tasación,
              inmobiliaria y broker según los importes configurados en Ajustes.
            </p>

            <div className="border-t border-linea pt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-tinta-media">
                <span>{formatPorcentaje(progresoPct / 100)} del mínimo</span>
                <span>
                  {formatEuros(ahorroActual)} / {formatEuros(evaluacion.dineroMinimo)}
                </span>
              </div>
              <div
                className="relative h-3 w-full overflow-hidden rounded-full bg-superficie-2"
                role="progressbar"
                aria-label="Progreso hacia el ahorro mínimo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progresoPct}
              >
                <div
                  className="h-full rounded-full bg-acento transition-all duration-500"
                  style={{ width: `${progresoPct}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-superficie/90"
                  style={{ left: '50%' }}
                  aria-hidden="true"
                />
              </div>

              {tieneMinimo ? (
                <p className="mt-4 rounded-medio bg-comodo-tenue px-4 py-2.5 text-sm font-medium text-comodo">
                  Ya tienes el dinero mínimo necesario. Puedes plantearte la compra.
                </p>
              ) : capacidadAhorroActual <= 0 ? (
                <p className="mt-4 rounded-medio bg-revisar-tenue px-4 py-3 text-sm text-tinta">
                  Con los ingresos, deudas y gastos actuales no queda margen mensual para ahorrar.
                </p>
              ) : meses === null ? (
                <p className="mt-4 rounded-medio bg-revisar-tenue px-4 py-3 text-sm text-tinta">
                  No se alcanza el objetivo en los próximos 10 años con tu capacidad de ahorro
                  actual.
                </p>
              ) : (
                <section className="mt-5 overflow-hidden rounded-grande border border-acento/40 bg-acento-tenue px-5 py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="rotulo mb-1 text-acento">Con tu capacidad actual</p>
                      <p className="font-display text-3xl leading-none text-tinta tabular-nums">
                        {meses} {meses === 1 ? 'mes' : 'meses'}
                      </p>
                      <p className="mt-2 text-sm text-tinta-media">
                        para completar los {formatEuros(faltanteAhorro)} que faltan.
                      </p>
                    </div>
                    {fechaEstimada !== null && (
                      <div className="rounded-medio border border-acento/30 bg-superficie/70 px-4 py-3 sm:text-right">
                        <p className="text-xs text-tinta-suave">Meta estimada</p>
                        <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                          {fechaEstimada}
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-xs text-tinta-media">
                    Ritmo usado: {formatEuros(capacidadAhorroActual)} al mes, manteniendo el
                    alquiler actual.
                  </p>
                  <GraficaProyeccion puntos={puntosHastaMeta} meses={meses} />
                </section>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
