import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import { InputMoneda } from '@/components/InputMoneda';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
} from '@/components/TablaResponsive';
import { formatEuros, formatPorcentaje } from '@/core/format';
import { type Cents, ZERO, sumCents } from '@/core/money';
import { simulacionDesdeOferta } from '@/domain/mortgageOffer';
import { construirFlujoDeCaja } from '@/finance/mortgage';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import { simularAmortizacionAnticipada, type OpcionAmortizacion } from '@/finance/prepayment';
import { descargarPDFAmortizacion } from '@/storage/exportar';
import type { FlujoInput, LineaMensual, OfertaBancaria } from '@/domain/types';

// ---------------------------------------------------------------------------
// Tabla de cuadro de amortización
// ---------------------------------------------------------------------------

interface PropsTabla {
  readonly lineas: LineaMensual[];
  readonly colorCapital?: string;
  readonly mostrarTodoInicialmente?: boolean;
  readonly accionEncabezado?: ReactNode;
}

function formatMesAnio(fecha: string): string {
  const [anio = '', mes = ''] = fecha.split('-');
  return `${mes}/${anio}`;
}

function TablaAmortizacion({
  lineas,
  colorCapital = '',
  mostrarTodoInicialmente = false,
  accionEncabezado,
}: PropsTabla) {
  const [verTodo, setVerTodo] = useState(mostrarTodoInicialmente);
  const lineasCuotas = lineas.slice(1);
  const lineasVisibles = verTodo ? lineasCuotas : lineasCuotas.slice(0, 10);

  return (
    <Panel contenidoClassName="p-0">
      <TablaResponsive
        minWidth="680px"
        className="max-h-[32rem] overflow-x-auto overflow-y-auto"
        cabecera={
          <div className="sticky top-0 z-20 flex min-h-[3.75rem] items-center justify-between gap-4 border-b border-linea bg-superficie px-6 py-3">
            <h2 className="font-display text-[1.35rem] leading-snug text-tinta">
              Cuadro de amortización
            </h2>
            {accionEncabezado !== undefined && <div className="shrink-0">{accionEncabezado}</div>}
          </div>
        }
      >
        <thead>
          <tr className="border-b border-linea text-left text-xs text-tinta-suave">
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              Nº
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              Fecha
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              <EncabezadoConUnidad titulo="Cuota" unidad="€" />
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              <EncabezadoConUnidad titulo="Intereses" unidad="€" />
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              <EncabezadoConUnidad titulo="Principal" unidad="€" />
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 pr-3 font-medium shadow-[0_1px_0_var(--c-linea)]">
              <EncabezadoConUnidad titulo="Amortización extra" unidad="€" />
            </th>
            <th className="sticky top-[3.75rem] z-10 bg-superficie py-2 font-medium shadow-[0_1px_0_var(--c-linea)]">
              <EncabezadoConUnidad titulo="Pendiente" unidad="€" />
            </th>
          </tr>
        </thead>
        <tbody>
          {lineasVisibles.map((linea) => (
            <tr
              key={linea.numero}
              className="border-b border-linea last:border-b-0 hover:bg-superficie-2"
            >
              <td className="py-2 pr-3 tabular-nums text-tinta-suave">{linea.numero}</td>
              <td className="py-2 pr-3 text-tinta-media">{formatMesAnio(linea.fecha)}</td>
              <td className="py-2 pr-3 font-mono text-tinta">
                <ValorEurosTabla valor={linea.cuota} />
              </td>
              <td className="py-2 pr-3 font-mono text-tinta-media">
                <ValorEurosTabla valor={linea.intereses} />
              </td>
              <td className="py-2 pr-3 font-mono text-tinta-media">
                <ValorEurosTabla valor={linea.principal} />
              </td>
              <td className="py-2 pr-3 font-mono text-acento">
                <ValorEurosTabla valor={linea.amortizacionExtraordinaria} />
              </td>
              <td className={`py-2 font-mono ${colorCapital || 'text-tinta'}`}>
                <ValorEurosTabla valor={linea.pendiente} />
              </td>
            </tr>
          ))}
        </tbody>
      </TablaResponsive>

      {lineasCuotas.length > 10 && !mostrarTodoInicialmente && (
        <div className="mt-4 border-t border-linea pt-4">
          <button
            type="button"
            onClick={() => {
              setVerTodo((v) => !v);
            }}
            className="text-sm font-medium text-acento hover:underline"
          >
            {verTodo
              ? 'Mostrar solo las primeras 10 cuotas'
              : `Ver más (${lineasCuotas.length} cuotas)`}
          </button>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function Amortizacion() {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const { escenarioSimulador, ofertas } = estado;
  const [idOfertaSeleccionada, setIdOfertaSeleccionada] = useState<string>(
    () => ofertas[0]?.id ?? '',
  );
  const ofertaSeleccionada: OfertaBancaria | null =
    ofertas.find((oferta) => oferta.id === idOfertaSeleccionada) ?? ofertas[0] ?? null;
  const escenarioBase = useMemo(
    () =>
      ofertaSeleccionada === null ? escenarioSimulador : simulacionDesdeOferta(ofertaSeleccionada),
    [escenarioSimulador, ofertaSeleccionada],
  );

  // --------------------------------------------------------------------------
  // Cuadro base (parte de la hipoteca guardada seleccionada)
  // --------------------------------------------------------------------------

  const inputBase: FlujoInput = useMemo<FlujoInput>(
    () => flujoInputDesdeEscenario(escenarioBase),
    [escenarioBase],
  );

  const flujoBase = useMemo(() => construirFlujoDeCaja(inputBase), [inputBase]);
  const capital = inputBase.capital;
  const plazoMeses = inputBase.plazoMeses;
  const cuota = flujoBase[1]?.cuota ?? ZERO;
  const lineasBase = useMemo(() => flujoBase.slice(1), [flujoBase]);
  const interesesTotales: Cents = useMemo(
    () => sumCents(lineasBase.map((l) => l.intereses)),
    [lineasBase],
  );

  // --------------------------------------------------------------------------
  // Amortización anticipada
  // --------------------------------------------------------------------------

  const [importeAportacion, setImporteAportacion] = useState<Cents>(ZERO);
  const [desdeMes, setDesdeMes] = useState(12);
  const [hastaMes, setHastaMes] = useState(24);
  const [opcion, setOpcion] = useState<OpcionAmortizacion>('cuota');
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const aportacionesValidas = useMemo(() => {
    if (importeAportacion <= ZERO) return [];
    const inicio = Math.min(Math.max(desdeMes, 1), plazoMeses);
    const fin = Math.min(Math.max(hastaMes, inicio), plazoMeses);

    return Array.from({ length: fin - inicio + 1 }, (_, indice) => ({
      importe: importeAportacion,
      enMes: inicio + indice,
    }));
  }, [importeAportacion, desdeMes, hastaMes, plazoMeses]);

  const comisionParcial = escenarioBase.comisiones.amortizacionParcial;

  const resultadoAmort = useMemo(() => {
    if (!mostrarResultado || aportacionesValidas.length === 0) return null;
    return simularAmortizacionAnticipada(inputBase, {
      aportaciones: aportacionesValidas,
      opcion,
      comisionParcial,
    });
  }, [mostrarResultado, aportacionesValidas, opcion, comisionParcial, inputBase]);

  function simular() {
    setMostrarResultado(true);
  }

  function editarSimulacion() {
    setMostrarResultado(false);
  }

  function limpiarSimulacion() {
    setImporteAportacion(ZERO);
    setDesdeMes(12);
    setHastaMes(24);
    setOpcion('cuota');
    setMostrarResultado(false);
  }

  // --------------------------------------------------------------------------
  // Exportar CSV
  // --------------------------------------------------------------------------

  function descargarPDFAmortizado() {
    if (resultadoAmort === null) return;
    void descargarPDFAmortizacion(resultadoAmort.flujoAmortizado);
  }

  if (ofertaSeleccionada === null) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
            Analiza el recorrido de una hipoteca guardada y prueba el efecto de un pago extra.
          </p>
        </header>
        <Panel rotulo="Para empezar" titulo="Guarda una hipoteca para analizarla">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-tinta-media">
              Esta sección trabaja con las propuestas que hayas guardado desde el Simulador. Así,
              cada simulación de amortización conserva las condiciones reales de ese banco.
            </p>
            <button
              type="button"
              onClick={() => {
                void navegar('/ofertas/simulador?guardar=1');
              }}
              className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
            >
              Guardar una hipoteca
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {resultadoAmort === null && (
        <Panel>
          <div className="flex flex-col gap-5">
            <section>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="hipoteca-guardada" className="sr-only">
                    Hipoteca guardada
                  </label>
                  <select
                    id="hipoteca-guardada"
                    value={ofertaSeleccionada.id}
                    onChange={(e) => {
                      setIdOfertaSeleccionada(e.target.value);
                      setMostrarResultado(false);
                    }}
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                  >
                    {ofertas.map((oferta) => (
                      <option key={oferta.id} value={oferta.id}>
                        {oferta.banco === oferta.nombre
                          ? oferta.banco
                          : `${oferta.banco} · ${oferta.nombre}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-linea pt-5">
                  <p className="rotulo mb-4">Hipoteca {escenarioBase.tipo}</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">Capital</span>
                      <span className="font-mono font-semibold text-tinta">
                        {formatEuros(capital)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">Cuota mensual</span>
                      <span className="font-mono font-semibold text-tinta">
                        {formatEuros(cuota)}
                      </span>
                    </div>
                    <div className="order-4 col-span-3 flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">Intereses totales</span>
                      <span className="font-mono font-semibold text-tinta">
                        {formatEuros(interesesTotales)}
                      </span>
                    </div>
                    <div className="order-3 flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">Plazo</span>
                      <span className="font-mono font-semibold text-tinta">
                        {escenarioBase.plazoAnios} años
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Amortización anticipada ──────────────────────────────── */}
            <section className="flex flex-col gap-5 border-t border-linea pt-5">
              <div className="flex flex-col gap-3">
                <InputMoneda
                  id="amort-importe"
                  etiqueta="Aportación en cada cuota"
                  valor={importeAportacion}
                  onChange={(importe) => {
                    setImporteAportacion(importe);
                    setMostrarResultado(false);
                  }}
                />
                <p className="text-xs text-tinta-media">
                  Aplicaremos esta misma cantidad a cada cuota del intervalo que indiques.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-linea pt-5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="amort-desde" className="text-sm font-medium text-tinta">
                    Desde la cuota nº
                  </label>
                  <input
                    id="amort-desde"
                    type="number"
                    min="1"
                    max={plazoMeses}
                    value={Math.min(desdeMes, plazoMeses)}
                    onChange={(e) => {
                      const nuevoDesde = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setDesdeMes(nuevoDesde);
                      setHastaMes((actual) => Math.max(actual, nuevoDesde));
                      setMostrarResultado(false);
                    }}
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-mono text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="amort-hasta" className="text-sm font-medium text-tinta">
                    Hasta la cuota nº
                  </label>
                  <input
                    id="amort-hasta"
                    type="number"
                    min="1"
                    max={plazoMeses}
                    value={Math.min(hastaMes, plazoMeses)}
                    onChange={(e) => {
                      setHastaMes(Math.max(desdeMes, parseInt(e.target.value, 10) || desdeMes));
                      setMostrarResultado(false);
                    }}
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-mono text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-tinta">Destinar a</span>
                  <details className="relative">
                    <summary
                      aria-label="Información sobre reducir cuota o plazo"
                      className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-linea text-xs font-semibold text-tinta-media transition-colors hover:border-acento hover:text-acento [&::-webkit-details-marker]:hidden"
                    >
                      i
                    </summary>
                    <div
                      role="note"
                      className="absolute top-full left-0 z-10 mt-2 w-72 rounded-medio border border-linea bg-superficie p-3 text-sm leading-relaxed text-tinta-media shadow-elevado"
                    >
                      <p>
                        <strong>Reducir cuota</strong>: pagas menos cada mes, pero el préstamo dura
                        lo mismo.
                      </p>
                      <p className="mt-2">
                        <strong>Reducir plazo</strong>: mantienes la cuota y terminas antes, por lo
                        que normalmente ahorras más intereses.
                      </p>
                    </div>
                  </details>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    {(['cuota', 'plazo'] as OpcionAmortizacion[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => {
                          setOpcion(o);
                          setMostrarResultado(false);
                        }}
                        className={[
                          'rounded-medio border px-4 py-2 text-sm font-medium',
                          opcion === o
                            ? 'border-acento bg-acento/10 text-acento'
                            : 'border-linea text-tinta hover:bg-superficie-2',
                        ].join(' ')}
                      >
                        {o === 'cuota' ? 'Reducir cuota' : 'Reducir plazo'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {comisionParcial > 0 && (
                <p className="text-xs text-tinta-media">
                  Comisión de amortización parcial aplicada:{' '}
                  <span className="font-mono">{formatPorcentaje(comisionParcial)}</span> (del
                  escenario de la hipoteca guardada)
                </p>
              )}

              <div>
                <button
                  type="button"
                  onClick={simular}
                  disabled={aportacionesValidas.length === 0}
                  className="rounded-medio bg-acento px-5 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Simular amortización
                </button>
              </div>
            </section>
          </div>
        </Panel>
      )}

      {resultadoAmort !== null && (
        <Panel
          rotulo="Simulación de Amortización"
          acento
          encabezadoClassName="px-5 pt-4 pb-3"
          contenidoClassName="px-5 py-4"
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-base font-semibold text-tinta">
                {ofertaSeleccionada.banco === ofertaSeleccionada.nombre
                  ? ofertaSeleccionada.banco
                  : `${ofertaSeleccionada.banco} · ${ofertaSeleccionada.nombre}`}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Capital</span>
                <span className="font-mono font-semibold text-tinta">{formatEuros(capital)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Cuota mensual</span>
                <span className="font-mono font-semibold text-tinta">{formatEuros(cuota)}</span>
              </div>
              <div className="order-4 col-span-3 flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Intereses totales</span>
                <span className="font-mono font-semibold text-tinta">
                  {formatEuros(interesesTotales)}
                </span>
              </div>
              <div className="order-3 flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Plazo</span>
                <span className="font-mono font-semibold text-tinta">
                  {escenarioBase.plazoAnios} años
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-linea pt-3 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-tinta-suave">Comisión</span>
              <span className="font-mono font-semibold text-tinta">
                {formatEuros(resultadoAmort.comision)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-tinta-suave">Ahorro neto</span>
              <span
                className={`font-mono font-semibold ${resultadoAmort.ahorroNeto > ZERO ? 'text-comodo' : 'text-no-viable'}`}
              >
                {formatEuros(resultadoAmort.ahorroNeto)}
              </span>
            </div>
            {opcion === 'cuota' && resultadoAmort.nuevaCuota !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Nueva cuota</span>
                <span className="font-mono font-semibold text-tinta">
                  {formatEuros(resultadoAmort.nuevaCuota)}
                  {resultadoAmort.diferenciaCuota !== null &&
                    resultadoAmort.diferenciaCuota > ZERO && (
                      <span className="ml-1 text-xs text-comodo">
                        (−{formatEuros(resultadoAmort.diferenciaCuota)})
                      </span>
                    )}
                </span>
              </div>
            )}
            {opcion === 'plazo' && resultadoAmort.nuevoNumCuotas !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-suave">Nuevo plazo</span>
                <span className="font-mono font-semibold text-tinta">
                  {resultadoAmort.nuevoNumCuotas} cuotas
                  {resultadoAmort.diferenciaMeses !== null &&
                    resultadoAmort.diferenciaMeses > 0 && (
                      <span className="ml-1 text-xs text-comodo">
                        (−{resultadoAmort.diferenciaMeses} mes
                        {resultadoAmort.diferenciaMeses !== 1 ? 'es' : ''})
                      </span>
                    )}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-3 border-t border-linea pt-3">
            <button
              type="button"
              onClick={editarSimulacion}
              className="rounded-medio border border-linea px-3 py-1.5 text-sm font-medium text-tinta hover:bg-superficie-2"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={limpiarSimulacion}
              className="rounded-medio border border-no-viable/35 bg-no-viable/10 px-3 py-1.5 text-sm font-medium text-no-viable hover:bg-no-viable/15"
            >
              Limpiar
            </button>
          </div>
        </Panel>
      )}

      {resultadoAmort !== null && (
        <TablaAmortizacion
          lineas={resultadoAmort.flujoAmortizado}
          colorCapital="text-comodo"
          accionEncabezado={
            <button
              type="button"
              onClick={descargarPDFAmortizado}
              className="rounded-medio border border-linea px-3 py-1.5 text-sm font-medium text-tinta hover:bg-superficie-2"
            >
              Descargar
            </button>
          }
        />
      )}
    </div>
  );
}
