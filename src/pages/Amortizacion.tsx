import { useMemo, useState } from 'react';
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import { InputMoneda } from '@/components/InputMoneda';
import { Explicacion } from '@/components/Explicacion';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
} from '@/components/TablaResponsive';
import { formatEuros, formatFecha, formatPorcentaje } from '@/core/format';
import { type Cents, ZERO, sumCents } from '@/core/money';
import { simulacionDesdeOferta } from '@/domain/mortgageOffer';
import { construirFlujoDeCaja } from '@/finance/mortgage';
import { calcularPlazoEfectivo } from '@/finance/affordability';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import { simularAmortizacionAnticipada, type OpcionAmortizacion } from '@/finance/prepayment';
import { generarCSVAmortizacion, descargarCSV } from '@/storage/exportar';
import type { FlujoInput, LineaMensual, OfertaBancaria } from '@/domain/types';

const GraficoCapital = lazy(async () => {
  const modulo = await import('@/components/GraficoCapital');
  return { default: modulo.GraficoCapital };
});

// ---------------------------------------------------------------------------
// Tabla de cuadro de amortización
// ---------------------------------------------------------------------------

interface PropsTabla {
  readonly lineas: LineaMensual[];
  readonly titulo: string;
  readonly colorCapital?: string;
}

function TablaAmortizacion({ lineas, titulo, colorCapital = '' }: PropsTabla) {
  const [verTodo, setVerTodo] = useState(false);
  const lineasCuotas = lineas.slice(1);
  const lineasVisibles = verTodo ? lineasCuotas : lineasCuotas.slice(0, 24);

  return (
    <Panel rotulo="Cuadro de amortización" titulo={titulo}>
      <TablaResponsive minWidth="520px">
        <thead>
          <tr className="border-b border-linea text-left text-xs text-tinta-suave">
            <th className="py-2 pr-3 font-medium">Nº</th>
            <th className="py-2 pr-3 font-medium">Fecha</th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Cuota" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Intereses" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Principal" unidad="€" />
            </th>
            <th className="py-2 font-medium">
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
              <td className="py-2 pr-3 text-tinta-media">{formatFecha(linea.fecha)}</td>
              <td className="py-2 pr-3 font-mono text-tinta">
                <ValorEurosTabla valor={linea.cuota} />
              </td>
              <td className="py-2 pr-3 font-mono text-tinta-media">
                <ValorEurosTabla valor={linea.intereses} />
              </td>
              <td className="py-2 pr-3 font-mono text-tinta-media">
                <ValorEurosTabla valor={linea.principal} />
              </td>
              <td className={`py-2 font-mono ${colorCapital || 'text-tinta'}`}>
                <ValorEurosTabla valor={linea.pendiente} />
              </td>
            </tr>
          ))}
        </tbody>
      </TablaResponsive>

      {lineasCuotas.length > 24 && (
        <div className="mt-4 border-t border-linea pt-4">
          <button
            type="button"
            onClick={() => {
              setVerTodo((v) => !v);
            }}
            className="text-sm font-medium text-acento hover:underline"
          >
            {verTodo
              ? 'Mostrar solo los primeros 24 meses'
              : `Ver todo (${lineasCuotas.length} cuotas)`}
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
  const { ajustes, escenarioSimulador, ofertas, perfil } = estado;
  const [idOfertaSeleccionada, setIdOfertaSeleccionada] = useState<string>(
    () => ofertas[0]?.id ?? '',
  );
  const ofertaSeleccionada: OfertaBancaria | null =
    ofertas.find((oferta) => oferta.id === idOfertaSeleccionada) ?? ofertas[0] ?? null;
  const escenarioBase = useMemo(
    () =>
      ofertaSeleccionada === null
        ? escenarioSimulador
        : simulacionDesdeOferta(ofertaSeleccionada),
    [escenarioSimulador, ofertaSeleccionada],
  );

  // --------------------------------------------------------------------------
  // Cuadro base (parte de la hipoteca guardada seleccionada)
  // --------------------------------------------------------------------------

  const plazoAnios = calcularPlazoEfectivo(
    escenarioBase.plazoAnios,
    ajustes,
    perfil.titulares,
  );

  const inputBase: FlujoInput = useMemo<FlujoInput>(
    () => flujoInputDesdeEscenario(escenarioBase, plazoAnios),
    [escenarioBase, plazoAnios],
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

  const [importeAmortizacion, setImporteAmortizacion] = useState<Cents>(ZERO);
  const [enMes, setEnMes] = useState(12);
  const [opcion, setOpcion] = useState<OpcionAmortizacion>('cuota');
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const mesAmortizacion = Math.min(enMes, plazoMeses);

  const comisionParcial = escenarioBase.comisiones.amortizacionParcial;

  const resultadoAmort = useMemo(() => {
    if (!mostrarResultado || importeAmortizacion <= ZERO) return null;
    return simularAmortizacionAnticipada(inputBase, {
      importe: importeAmortizacion,
      enMes: mesAmortizacion,
      opcion,
      comisionParcial,
    });
  }, [
    mostrarResultado,
    importeAmortizacion,
    mesAmortizacion,
    opcion,
    comisionParcial,
    inputBase,
  ]);

  function simular() {
    setMostrarResultado(true);
  }

  // --------------------------------------------------------------------------
  // Exportar CSV
  // --------------------------------------------------------------------------

  function exportarCSV() {
    const contenido = generarCSVAmortizacion(flujoBase);
    const fecha = new Date().toISOString().slice(0, 10);
    descargarCSV(contenido, `amortizacion-${fecha}.csv`);
  }

  function exportarCSVAmortizado() {
    if (resultadoAmort === null) return;
    const contenido = generarCSVAmortizacion(resultadoAmort.flujoAmortizado);
    const fecha = new Date().toISOString().slice(0, 10);
    descargarCSV(contenido, `amortizacion-anticipada-${fecha}.csv`);
  }

  if (ofertaSeleccionada === null) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="rotulo mb-1">Paso 5 · Hipotecas guardadas</p>
          <h1 className="font-display text-2xl text-tinta">Pagos y amortización</h1>
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
              className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
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
      {/* ── Resumen ─────────────────────────────────────────────── */}
      <div>
        <p className="rotulo mb-1">Paso 5 · Hipotecas guardadas</p>
        <h1 className="font-display text-2xl text-tinta">Pagos y amortización</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
          Elige una de tus hipotecas guardadas, observa cómo baja la deuda y prueba una amortización
          extra antes de tomar una decisión.
        </p>
      </div>

      <Panel rotulo="Hipoteca a analizar" titulo="Elige la propuesta del banco">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="hipoteca-guardada" className="text-sm font-medium text-tinta">
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
                  {oferta.banco} · {oferta.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-tinta-media">
            {ofertaSeleccionada.estado === 'fein_recibida'
              ? 'FEIN recibida'
              : ofertaSeleccionada.estado.replace('_', ' ')}
          </p>
        </div>
      </Panel>

      <Panel rotulo={`Hipoteca ${escenarioBase.tipo}`} titulo="Resumen de la operación">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-tinta-suave">Capital</span>
            <span className="font-mono font-semibold text-tinta">{formatEuros(capital)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-tinta-suave">Cuota mensual</span>
            <span className="font-mono font-semibold text-tinta">{formatEuros(cuota)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-tinta-suave">Intereses totales</span>
            <span className="font-mono font-semibold text-tinta">
              {formatEuros(interesesTotales)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-tinta-suave">Plazo</span>
            <span className="font-mono font-semibold text-tinta">{plazoAnios} años</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={exportarCSV}
            className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
          >
            Exportar CSV
          </button>
        </div>
      </Panel>

      <Suspense
        fallback={
          <Panel rotulo="Evolución de la deuda" titulo="Preparando el gráfico">
            <p className="text-sm text-tinta-media">Cargando la evolución del capital pendiente…</p>
          </Panel>
        }
      >
        <GraficoCapital
          flujoBase={flujoBase}
          flujoAmortizado={resultadoAmort?.flujoAmortizado ?? null}
          mesAmortizacion={mesAmortizacion}
        />
      </Suspense>

      {/* ── Amortización anticipada ──────────────────────────────── */}
      <Panel rotulo="Amortización anticipada" titulo="Simular pago extra de capital">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <InputMoneda
              id="amort-importe"
              etiqueta="Importe a amortizar"
              valor={importeAmortizacion}
              onChange={setImporteAmortizacion}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="amort-mes" className="text-sm font-medium text-tinta">
                En la cuota nº
              </label>
              <input
                id="amort-mes"
                type="number"
                min="1"
                max={plazoMeses}
                value={mesAmortizacion}
                onChange={(e) => {
                  setEnMes(Math.max(1, parseInt(e.target.value, 10) || 1));
                }}
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-mono text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tinta">Destinar a</span>
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
              <span className="font-mono">{formatPorcentaje(comisionParcial)}</span> (del escenario
              de la hipoteca guardada)
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={simular}
              disabled={importeAmortizacion <= ZERO}
              className="rounded-medio bg-acento px-5 py-2.5 text-sm font-medium text-white hover:bg-acento/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Simular amortización
            </button>
          </div>

          {/* Resultado */}
          {resultadoAmort !== null && (
            <div className="border-t border-linea pt-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-tinta-suave">Ahorro en intereses</span>
                  <span className="font-mono font-semibold text-comodo">
                    {formatEuros(resultadoAmort.ahorroIntereses)}
                  </span>
                </div>
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

              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={exportarCSVAmortizado}
                  className="rounded-medio border border-linea px-3 py-1.5 text-sm text-tinta hover:bg-superficie-2"
                >
                  Exportar nuevo cuadro CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarResultado(false);
                  }}
                  className="text-sm text-tinta-suave hover:underline"
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}
        </div>

        <Explicacion titulo="¿Cuál es mejor: reducir cuota o reducir plazo?">
          <p>
            <strong>Reducir cuota</strong>: pagas menos cada mes, pero el préstamo dura lo mismo.
            Útil para liberar dinero mensual o mejorar el ratio de endeudamiento.
          </p>
          <p className="mt-1">
            <strong>Reducir plazo</strong>: pagas lo mismo cada mes pero terminas antes. Genera más
            ahorro en intereses porque el capital se amortiza más rápido.
          </p>
        </Explicacion>
      </Panel>

      <details className="group rounded-grande border border-linea bg-superficie shadow-papel">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-tinta marker:text-acento">
          Ver el cuadro mensual completo
          <span className="ml-2 font-normal text-tinta-suave">(detalle y exportación)</span>
        </summary>
        <div className="border-t border-linea">
          <TablaAmortizacion lineas={flujoBase} titulo="Detalle mensual del plan original" />
        </div>
      </details>

      {resultadoAmort !== null && (
        <details className="group rounded-grande border border-comodo/35 bg-superficie shadow-papel">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-tinta marker:text-comodo">
            Ver el cuadro mensual tras amortizar
            <span className="ml-2 font-normal text-tinta-suave">(para contrastar ambos planes)</span>
          </summary>
          <div className="border-t border-linea">
            <TablaAmortizacion
              lineas={resultadoAmort.flujoAmortizado}
              titulo="Detalle mensual con amortización anticipada"
              colorCapital="text-comodo"
            />
          </div>
        </details>
      )}
    </div>
  );
}
