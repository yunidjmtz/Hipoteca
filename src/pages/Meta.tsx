import { useMemo, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { addMonthsAnchored, fechaLocalISO } from '@/core/dates';
import { formatEuros, formatFecha } from '@/core/format';
import { maxCents, multiplyCents, subtractCents, ZERO } from '@/core/money';
import {
  buscarPrecioMaximo,
  calcularCapacidadAhorroActual,
  esCompraComoda,
  evaluarPrecio,
  RANGO_BUSQUEDA_CAPACIDAD,
} from '@/finance/affordability';
import { construirContexto, CONTEXTO_VIVIENDA_PLAN } from '@/finance/contexto';
import { mesesHastaObjetivo, proyectarAhorro } from '@/finance/savingsGoal';
import type { PuntoProyeccion } from '@/domain/types';

function ProgresoHitos({
  puntos,
  meses,
}: {
  readonly puntos: readonly PuntoProyeccion[];
  readonly meses: number;
}) {
  const inicio = puntos[0];
  const meta = puntos.at(-1);
  if (inicio === undefined || meta === undefined || puntos.length < 2) return null;

  const importeMeta = meta.objetivoCreciente;
  const progreso = Math.min(1, inicio.ahorroAcumulado / importeMeta);
  const siguientePorcentaje = Math.min(1, (Math.floor(progreso * 4) + 1) / 4);
  const siguienteHito =
    puntos.find((punto) => punto.ahorroAcumulado >= importeMeta * siguientePorcentaje) ?? meta;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <div className="rounded-chico bg-superficie-2/80 px-3 py-2.5">
        <p className="text-xs text-tinta-suave">Hoy</p>
        <p className="mt-0.5 font-cifra text-sm font-semibold tabular-nums text-tinta">
          {formatEuros(inicio.ahorroAcumulado)}
        </p>
        <p className="mt-0.5 text-xs text-tinta-media">{Math.round(progreso * 100)} % completado</p>
      </div>
      <div className="rounded-chico bg-superficie-2/80 px-3 py-2.5">
        <p className="text-xs text-tinta-suave">Próximo hito</p>
        <p className="mt-0.5 font-cifra text-sm font-semibold tabular-nums text-tinta">
          {formatEuros(siguienteHito.ahorroAcumulado)}
        </p>
        <p className="mt-0.5 text-xs text-tinta-media">
          Mes {siguienteHito.mes} · {formatFecha(siguienteHito.fecha)}
        </p>
      </div>
      <div className="rounded-chico bg-comodo-tenue px-3 py-2.5">
        <p className="text-xs text-tinta-suave">Meta</p>
        <p className="mt-0.5 font-cifra text-sm font-semibold tabular-nums text-tinta">
          {formatEuros(importeMeta)}
        </p>
        <p className="mt-0.5 text-xs text-tinta-media">
          Mes {meses} · {formatFecha(meta.fecha)}
        </p>
      </div>
    </div>
  );
}

export function Meta() {
  const { estado } = useEstado();
  const { perfil, ajustes } = estado;
  const [tablaAbierta, setTablaAbierta] = useState(false);

  const precioPlan = useMemo(
    () =>
      buscarPrecioMaximo(
        (evaluacion) => esCompraComoda(evaluacion, ajustes.ratioPersonalObjetivo),
        (precio) => construirContexto(estado, precio, undefined, CONTEXTO_VIVIENDA_PLAN),
        RANGO_BUSQUEDA_CAPACIDAD,
      ).precioMaximo ?? ZERO,
    [estado, ajustes.ratioPersonalObjetivo],
  );

  const evaluacion = useMemo(
    () =>
      evaluarPrecio(
        precioPlan,
        construirContexto(estado, precioPlan, undefined, CONTEXTO_VIVIENDA_PLAN),
      ),
    [estado, precioPlan],
  );

  const capacidadAhorroActual = useMemo(() => calcularCapacidadAhorroActual(perfil), [perfil]);
  const hoy = fechaLocalISO();
  const proyeccionInput = useMemo(
    () => ({
      ahorroInicial: perfil.ahorrosActuales,
      ahorroMensual: capacidadAhorroActual,
      extraordinarios: perfil.ingresosExtraordinarios,
      fechaInicio: hoy,
      precioObjetivo: evaluacion.dineroMinimo,
      crecimientoAnualPrecio: ajustes.crecimientoAnualPrecioVivienda,
      rentabilidadAnualAhorro: ajustes.rentabilidadAnualAhorro,
      mesesMaximos: 120,
      objetivoEnMes: (mes: number) => {
        const factorPrecio = Math.pow(1 + ajustes.crecimientoAnualPrecioVivienda, mes / 12);
        const precioFuturo = multiplyCents(precioPlan, factorPrecio);
        return evaluarPrecio(
          precioFuturo,
          construirContexto(estado, precioFuturo, undefined, CONTEXTO_VIVIENDA_PLAN),
        ).dineroMinimo;
      },
    }),
    [perfil, capacidadAhorroActual, ajustes, evaluacion.dineroMinimo, hoy, precioPlan, estado],
  );

  const meses = useMemo(() => mesesHastaObjetivo(proyeccionInput), [proyeccionInput]);
  const puntosProyeccion = useMemo(() => proyectarAhorro(proyeccionInput), [proyeccionInput]);

  const ahorroActual = perfil.ahorrosActuales;
  const faltanteAhorro = maxCents(ZERO, subtractCents(evaluacion.dineroMinimo, ahorroActual));
  const fechaEstimada =
    meses !== null
      ? (() => {
          const diaAncla = Number(hoy.slice(8, 10));
          return formatFecha(addMonthsAnchored(hoy, diaAncla, meses));
        })()
      : null;

  const tieneMinimo = ahorroActual >= evaluacion.dineroMinimo;
  const puntosHastaMeta =
    meses !== null ? puntosProyeccion.slice(0, Math.min(meses + 1, puntosProyeccion.length)) : [];

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
        <header className="border-b border-linea bg-acento-tenue px-5 py-3">
          <h1 className="rotulo">Ahorro y progreso hacia el objetivo</h1>
        </header>
        <div className="px-3 py-5 sm:px-4">
          {evaluacion.dineroMinimo <= 0 ? (
            <p className="text-sm text-tinta-media">
              Añade ingresos para calcular tu compra máxima cómoda.
            </p>
          ) : (
            <div>
              {tieneMinimo ? (
                <p className="rounded-medio bg-comodo-tenue px-4 py-2.5 text-sm font-medium text-comodo">
                  Ya tienes el dinero mínimo necesario. Puedes plantearte la compra.
                </p>
              ) : capacidadAhorroActual <= 0 ? (
                <p className="rounded-medio bg-revisar-tenue px-4 py-3 text-sm text-tinta">
                  Con los ingresos, deudas y gastos actuales no queda margen mensual para ahorrar.
                </p>
              ) : meses === null ? (
                <p className="rounded-medio bg-revisar-tenue px-4 py-3 text-sm text-tinta">
                  No se alcanza el objetivo en los próximos 10 años con tu capacidad de ahorro
                  actual.
                </p>
              ) : (
                <>
                  <div className="text-center">
                    <p className="rotulo mb-1 text-acento">
                      Capacidad actual: {formatEuros(capacidadAhorroActual)} al mes
                    </p>
                    <p className="font-display text-3xl leading-none text-tinta tabular-nums">
                      {meses} {meses === 1 ? 'mes' : 'meses'}
                      {fechaEstimada !== null && (
                        <span className="ml-2 text-xl text-tinta-media">→ {fechaEstimada}</span>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-tinta-media">
                      para completar los {formatEuros(faltanteAhorro)} que faltan.
                    </p>
                  </div>
                  <ProgresoHitos puntos={puntosHastaMeta} meses={meses} />
                </>
              )}
            </div>
          )}
        </div>
        {meses !== null && capacidadAhorroActual > 0 && (
          <button
            type="button"
            onClick={() => setTablaAbierta(true)}
            className="flex w-full items-center justify-center border-t border-linea px-5 py-3 text-sm font-medium text-acento transition-colors hover:bg-acento-tenue"
          >
            Ver ahorro mes a mes →
          </button>
        )}
      </section>

      {tablaAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-tinta/25 backdrop-blur-sm"
            onClick={() => setTablaAbierta(false)}
            aria-hidden="true"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-tabla-ahorro"
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-grande border border-linea bg-superficie shadow-elevado"
          >
            <header className="flex items-center justify-between border-b border-linea px-5 py-4">
              <div>
                <h2 id="titulo-tabla-ahorro" className="font-display text-lg text-tinta">
                  Ahorro mes a mes
                </h2>
                <p className="mt-0.5 text-xs text-tinta-suave">
                  Proyección hasta alcanzar tu objetivo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTablaAbierta(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg leading-none text-tinta-media transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                ×
              </button>
            </header>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-superficie text-left text-xs text-tinta-suave">
                  <tr className="border-b border-linea">
                    <th className="px-5 py-3 font-medium">Mes</th>
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 text-right font-medium">Ahorro acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {puntosHastaMeta.map((punto) => (
                    <tr key={punto.mes} className="border-b border-linea last:border-b-0">
                      <td className="px-5 py-2.5 text-tinta">
                        {punto.mes === 0 ? 'Hoy' : `Mes ${punto.mes}`}
                      </td>
                      <td className="px-3 py-2.5 text-tinta-media">{formatFecha(punto.fecha)}</td>
                      <td className="px-5 py-2.5 text-right font-cifra font-semibold tabular-nums text-tinta">
                        {formatEuros(punto.ahorroAcumulado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
