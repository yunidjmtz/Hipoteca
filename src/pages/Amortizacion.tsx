import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { Icono } from '@/components/Icono';
import { Panel } from '@/components/Panel';
import { InputMoneda } from '@/components/InputMoneda';
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
  readonly lineas: readonly LineaMensual[];
  readonly esSimulacion: boolean;
  readonly accionEncabezado?: ReactNode;
}

interface ResumenAnual {
  readonly numero: number;
  readonly desde: string;
  readonly hasta: string;
  readonly pagoTotal: Cents;
  readonly intereses: Cents;
  readonly deudaReducida: Cents;
  readonly extras: Cents;
  readonly pendiente: Cents;
}

function fechaLocal(fecha: string): Date {
  const [anio = '1970', mes = '1', dia = '1'] = fecha.split('-');
  return new Date(Number(anio), Number(mes) - 1, Number(dia));
}

function formatMesAnio(fecha: string): string {
  const texto = fechaLocal(fecha).toLocaleDateString('es-ES', {
    month: 'short',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '');
}

function formatPeriodo(desde: string, hasta: string): string {
  if (desde === hasta) return formatMesAnio(desde);
  const fechaDesde = fechaLocal(desde);
  const fechaHasta = fechaLocal(hasta);
  const mesDesde = fechaDesde.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  const mesHasta = fechaHasta.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');

  if (fechaDesde.getFullYear() === fechaHasta.getFullYear()) {
    return `${mesDesde}–${mesHasta} ${fechaHasta.getFullYear()}`;
  }
  return `${mesDesde} ${fechaDesde.getFullYear()}–${mesHasta} ${fechaHasta.getFullYear()}`;
}

function sumarLinea(linea: LineaMensual): Cents {
  return sumCents([linea.cuota, linea.amortizacionExtraordinaria, linea.comisiones]);
}

function deudaReducidaEnLinea(linea: LineaMensual): Cents {
  return sumCents([linea.principal, linea.amortizacionExtraordinaria]);
}

function agruparPorAnio(lineas: readonly LineaMensual[]): ResumenAnual[] {
  const grupos = new Map<number, LineaMensual[]>();

  for (const linea of lineas) {
    const numeroAnio = Math.floor((linea.numero - 1) / 12) + 1;
    const grupo = grupos.get(numeroAnio) ?? [];
    grupo.push(linea);
    grupos.set(numeroAnio, grupo);
  }

  return [...grupos.entries()].map(([numero, cuotas]) => {
    const primera = cuotas[0];
    const ultima = cuotas.at(-1);
    if (primera === undefined || ultima === undefined) {
      throw new Error('Un año del cuadro de amortización no puede estar vacío.');
    }

    return {
      numero,
      desde: primera.fecha,
      hasta: ultima.fecha,
      pagoTotal: sumCents(cuotas.map(sumarLinea)),
      intereses: sumCents(cuotas.map((linea) => linea.intereses)),
      deudaReducida: sumCents(cuotas.map(deudaReducidaEnLinea)),
      extras: sumCents(cuotas.map((linea) => linea.amortizacionExtraordinaria)),
      pendiente: ultima.pendiente,
    };
  });
}

function porcentaje(parte: Cents, total: Cents): number {
  if (total <= ZERO) return 0;
  return Math.min(100, Math.max(0, (parte / total) * 100));
}

function TablaAmortizacion({ lineas, esSimulacion, accionEncabezado }: PropsTabla) {
  const lineasCuotas = useMemo(() => lineas.filter((linea) => linea.numero > 0), [lineas]);
  const resumenesAnuales = useMemo(() => agruparPorAnio(lineasCuotas), [lineasCuotas]);
  const primeraCuota = lineasCuotas[0] ?? null;
  const cierrePrimerAnio = resumenesAnuales[0] ?? null;
  const ultimaCuota = lineasCuotas.at(-1) ?? null;
  const capitalPrimeraCuota = primeraCuota?.principal ?? ZERO;
  const interesesPrimeraCuota = primeraCuota?.intereses ?? ZERO;
  const porcentajeCapital = porcentaje(capitalPrimeraCuota, primeraCuota?.cuota ?? ZERO);
  const porcentajeIntereses = porcentaje(interesesPrimeraCuota, primeraCuota?.cuota ?? ZERO);

  return (
    <Panel contenidoClassName="p-0 overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-linea px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-2xl">
          <p className="rotulo mb-1">{esSimulacion ? 'Tu nuevo plan' : 'Tu plan actual'}</p>
          <h2 className="font-display text-2xl leading-tight text-tinta">
            Así se va pagando tu hipoteca
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-tinta-media">
            Un resumen por años para ver cuánto pagas, cuánto va a intereses y cómo baja tu deuda.
          </p>
        </div>
        {accionEncabezado !== undefined && <div className="shrink-0">{accionEncabezado}</div>}
      </header>

      {primeraCuota !== null && cierrePrimerAnio !== null && (
        <section
          aria-labelledby="primera-cuota-titulo"
          className="border-b border-linea bg-acento-tenue px-4 py-5 sm:px-6 sm:py-6"
        >
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(15rem,0.75fr)] md:items-center">
            <div>
              <p className="rotulo mb-1 text-acento">Tu primera cuota, sin tecnicismos</p>
              <h3 id="primera-cuota-titulo" className="text-xl leading-snug text-tinta">
                Pagas {formatEuros(primeraCuota.cuota)}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-tinta-media">
                De ese dinero,{' '}
                <strong className="text-tinta">{formatEuros(capitalPrimeraCuota)}</strong> sí reduce
                lo que debes. Los otros{' '}
                <strong className="text-tinta">{formatEuros(interesesPrimeraCuota)}</strong> son el
                coste que cobra el banco ese mes.
              </p>

              <div
                className="mt-4 flex h-3 w-full max-w-xl overflow-hidden rounded-full bg-superficie"
                role="img"
                aria-label={`${porcentajeCapital.toFixed(0)} % de la primera cuota reduce la deuda y ${porcentajeIntereses.toFixed(0)} % son intereses`}
              >
                <span className="h-full bg-comodo" style={{ width: `${porcentajeCapital}%` }} />
                <span
                  className="h-full bg-no-viable"
                  style={{ width: `${porcentajeIntereses}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-media">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-comodo" aria-hidden="true" />
                  Reduce tu deuda
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-no-viable" aria-hidden="true" />
                  Intereses del banco
                </span>
              </div>
            </div>

            <div className="rounded-grande border border-acento/20 bg-superficie px-4 py-4 shadow-papel">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-comodo-tenue text-comodo">
                  <Icono nombre="reloj" tamano={19} />
                </span>
                <div>
                  <p className="text-xs font-medium text-tinta-media">Después del primer año</p>
                  <p className="mt-0.5 font-cifra text-xl font-bold tabular-nums text-tinta">
                    {formatEuros(cierrePrimerAnio.pendiente)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
                    será lo que todavía debas al banco.
                  </p>
                </div>
              </div>
              {ultimaCuota !== null && (
                <p className="mt-4 border-t border-linea pt-3 text-xs text-tinta-media">
                  Terminas de pagar en{' '}
                  <strong className="font-semibold text-tinta">
                    {formatMesAnio(ultimaCuota.fecha)}
                  </strong>
                  .
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="detalle-pagos-titulo">
        <div className="border-b border-linea px-4 py-4 sm:px-6">
          <div>
            <h3 id="detalle-pagos-titulo" className="text-lg text-tinta">
              Tu hipoteca, año a año
            </h3>
            <p className="mt-0.5 text-xs text-tinta-media">
              Una vista sencilla para entender la evolución de la deuda.
            </p>
          </div>
        </div>

        <>
          <div className="divide-y divide-linea sm:hidden">
            {resumenesAnuales.map((resumen) => (
              <article key={resumen.numero} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-tinta">Año {resumen.numero}</p>
                    <p className="mt-0.5 text-xs text-tinta-suave">
                      {formatPeriodo(resumen.desde, resumen.hasta)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.6875rem] text-tinta-suave">Al terminar debes</p>
                    <p className="font-cifra text-base font-bold tabular-nums text-tinta">
                      {formatEuros(resumen.pendiente)}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-medio bg-superficie-2 px-2.5 py-2">
                    <dt className="text-[0.625rem] leading-tight text-tinta-media">
                      Pagas en total
                    </dt>
                    <dd className="mt-1 font-cifra text-sm font-semibold tabular-nums text-tinta">
                      {formatEuros(resumen.pagoTotal)}
                    </dd>
                  </div>
                  <div className="rounded-medio bg-no-viable-tenue px-2.5 py-2">
                    <dt className="text-[0.625rem] leading-tight text-tinta-media">Intereses</dt>
                    <dd className="mt-1 font-cifra text-sm font-semibold tabular-nums text-no-viable">
                      {formatEuros(resumen.intereses)}
                    </dd>
                  </div>
                  <div className="rounded-medio bg-comodo-tenue px-2.5 py-2">
                    <dt className="text-[0.625rem] leading-tight text-tinta-media">
                      Reduces deuda
                    </dt>
                    <dd className="mt-1 font-cifra text-sm font-semibold tabular-nums text-comodo">
                      {formatEuros(resumen.deudaReducida)}
                    </dd>
                  </div>
                </dl>
                {resumen.extras > ZERO && (
                  <p className="mt-2 text-xs font-medium text-acento">
                    Incluye {formatEuros(resumen.extras)} de pagos extra.
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-linea bg-superficie-2/50 text-left text-xs text-tinta-suave">
                  <th className="px-6 py-3 font-medium">Periodo</th>
                  <th className="px-3 py-3 font-medium">Pagas en total</th>
                  <th className="px-3 py-3 font-medium">Intereses del banco</th>
                  <th className="px-3 py-3 font-medium">Reduces tu deuda</th>
                  <th className="px-6 py-3 text-right font-medium">Deuda al terminar</th>
                </tr>
              </thead>
              <tbody>
                {resumenesAnuales.map((resumen) => (
                  <tr
                    key={resumen.numero}
                    className="border-b border-linea last:border-b-0 hover:bg-superficie-2/50"
                  >
                    <th scope="row" className="px-6 py-3.5 text-left font-semibold text-tinta">
                      Año {resumen.numero}
                      <span className="mt-0.5 block text-xs font-normal text-tinta-suave">
                        {formatPeriodo(resumen.desde, resumen.hasta)}
                      </span>
                    </th>
                    <td className="px-3 py-3.5 font-cifra tabular-nums text-tinta">
                      {formatEuros(resumen.pagoTotal)}
                      {resumen.extras > ZERO && (
                        <span className="mt-0.5 block text-xs text-acento">
                          Incluye {formatEuros(resumen.extras)} extra
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 font-cifra tabular-nums text-no-viable">
                      {formatEuros(resumen.intereses)}
                    </td>
                    <td className="px-3 py-3.5 font-cifra font-semibold tabular-nums text-comodo">
                      {formatEuros(resumen.deudaReducida)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(resumen.pendiente)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>

        <details className="border-t border-linea px-4 py-4 text-sm sm:px-6">
          <summary className="cursor-pointer font-medium text-acento">
            ¿Qué significa cada cifra?
          </summary>
          <dl className="mt-3 grid gap-3 text-tinta-media sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-tinta">Intereses</dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                Es el coste que cobra el banco por prestarte el dinero. No reduce tu deuda.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-tinta">Reduces tu deuda</dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                Es la parte que realmente devuelve el dinero prestado. Incluye tus pagos extra.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-tinta">Deuda al terminar</dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                Es lo que todavía debes después de hacer ese pago o cerrar ese año.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-tinta">Pagas en total</dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                Suma todas las cuotas del año, los pagos extra y, si existe, la comisión por
                amortizar.
              </dd>
            </div>
          </dl>
        </details>

        {lineasCuotas.length === 0 && (
          <button
            type="button"
            disabled
            className="m-4 rounded-medio border border-linea px-4 py-2 text-sm text-tinta-suave sm:m-6"
          >
            No hay cuotas para mostrar
          </button>
        )}
      </section>
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
  // Exportar el plan que se está mostrando
  // --------------------------------------------------------------------------

  function descargarPDFCuadro() {
    void descargarPDFAmortizacion(resultadoAmort?.flujoAmortizado ?? flujoBase);
  }

  if (ofertaSeleccionada === null) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="rotulo mb-1">Amortización</p>
          <h1 className="font-display text-3xl leading-tight text-tinta">
            Entiende cómo se paga tu hipoteca
          </h1>
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
                void navegar('/hipoteca/simulador?guardar=1');
              }}
              className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
            >
              Guardar una hipoteca →
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="rotulo mb-1">Amortización</p>
        <h1 className="font-display text-3xl leading-tight text-tinta">
          Entiende cómo se paga tu hipoteca
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
          Descubre qué parte de cada cuota reduce tu deuda y qué parte se queda el banco en
          intereses. También puedes probar si te compensa adelantar dinero.
        </p>
      </header>

      {resultadoAmort === null && (
        <Panel rotulo="Simulador de pagos extra" titulo="¿Qué pasa si adelantas dinero?">
          <div className="flex flex-col gap-5">
            <section>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="hipoteca-guardada" className="text-sm font-medium text-tinta">
                    Hipoteca que quieres analizar
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
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">Te presta el banco</span>
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
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-tinta-suave">
                        Intereses de todo el préstamo
                      </span>
                      <span className="font-mono font-semibold text-tinta">
                        {formatEuros(interesesTotales)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
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
                  etiqueta="Dinero extra que pagarías cada mes"
                  valor={importeAportacion}
                  onChange={(importe) => {
                    setImporteAportacion(importe);
                    setMostrarResultado(false);
                  }}
                />
                <p className="text-xs text-tinta-media">
                  Lo sumaremos a tu cuota durante los meses que indiques. Ese dinero se usa para
                  reducir directamente la deuda.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-linea pt-5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="amort-desde" className="text-sm font-medium text-tinta">
                    Empezar en la cuota
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
                    Terminar en la cuota
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
                  className="w-full rounded-medio bg-acento px-5 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  Ver cuánto ahorrarías
                </button>
              </div>
            </section>
          </div>
        </Panel>
      )}

      {resultadoAmort !== null && (
        <Panel
          rotulo="Resultado de tu prueba"
          titulo={
            resultadoAmort.ahorroNeto > ZERO
              ? 'Adelantar dinero mejora esta hipoteca'
              : 'Este pago extra no te genera ahorro real'
          }
          acento
          contenidoClassName="px-5 py-5 sm:px-6 sm:py-6"
        >
          <div
            className={[
              'rounded-grande px-4 py-5 sm:px-5',
              resultadoAmort.ahorroNeto > ZERO ? 'bg-comodo-tenue' : 'bg-no-viable-tenue',
            ].join(' ')}
          >
            <p className="text-sm text-tinta-media">
              {resultadoAmort.ahorroNeto > ZERO
                ? 'Después de descontar la comisión, tu ahorro real sería de'
                : 'Después de contar la comisión, el resultado sería'}
            </p>
            <p
              className={[
                'mt-1 cifra-grande font-bold',
                resultadoAmort.ahorroNeto > ZERO ? 'text-comodo' : 'text-no-viable',
              ].join(' ')}
            >
              {formatEuros(resultadoAmort.ahorroNeto)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-tinta-media">
              Ahorras {formatEuros(resultadoAmort.ahorroIntereses)} en intereses y pagas{' '}
              {formatEuros(resultadoAmort.comision)} de comisión.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {opcion === 'cuota' && resultadoAmort.nuevaCuota !== null && (
              <div className="rounded-grande border border-linea bg-superficie-2 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-superficie text-acento shadow-papel">
                    <Icono nombre="recibo" tamano={19} />
                  </span>
                  <div>
                    <p className="text-xs text-tinta-media">Tu nueva cuota mensual</p>
                    <p className="mt-0.5 font-cifra text-xl font-bold tabular-nums text-tinta">
                      {formatEuros(resultadoAmort.nuevaCuota)}
                    </p>
                    {resultadoAmort.diferenciaCuota !== null &&
                      resultadoAmort.diferenciaCuota > ZERO && (
                        <p className="mt-1 text-xs font-medium text-comodo">
                          Pagarías {formatEuros(resultadoAmort.diferenciaCuota)} menos al mes.
                        </p>
                      )}
                  </div>
                </div>
              </div>
            )}
            {opcion === 'plazo' && resultadoAmort.nuevoNumCuotas !== null && (
              <div className="rounded-grande border border-linea bg-superficie-2 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-superficie text-acento shadow-papel">
                    <Icono nombre="reloj" tamano={19} />
                  </span>
                  <div>
                    <p className="text-xs text-tinta-media">Terminarías de pagar</p>
                    <p className="mt-0.5 font-cifra text-xl font-bold tabular-nums text-tinta">
                      {formatMesAnio(resultadoAmort.flujoAmortizado.at(-1)?.fecha ?? '')}
                    </p>
                    {resultadoAmort.diferenciaMeses !== null &&
                      resultadoAmort.diferenciaMeses > 0 && (
                        <p className="mt-1 text-xs font-medium text-comodo">
                          {resultadoAmort.diferenciaMeses} mes
                          {resultadoAmort.diferenciaMeses !== 1 ? 'es' : ''} antes.
                        </p>
                      )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-grande border border-linea px-4 py-4">
              <p className="text-xs text-tinta-media">Intereses con el nuevo plan</p>
              <p className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-tinta">
                {formatEuros(resultadoAmort.interesesAmortizados)}
              </p>
              <p className="mt-1 text-xs text-tinta-suave">
                Antes habrías pagado {formatEuros(resultadoAmort.interesesOriginales)}.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-linea pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={editarSimulacion}
              className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
            >
              Cambiar la prueba
            </button>
            <button
              type="button"
              onClick={limpiarSimulacion}
              className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta-media hover:bg-superficie-2 hover:text-tinta"
            >
              Empezar de nuevo
            </button>
          </div>
        </Panel>
      )}

      <TablaAmortizacion
        key={`${ofertaSeleccionada.id}-${resultadoAmort === null ? 'actual' : 'simulado'}`}
        lineas={resultadoAmort?.flujoAmortizado ?? flujoBase}
        esSimulacion={resultadoAmort !== null}
        accionEncabezado={
          <button
            type="button"
            onClick={descargarPDFCuadro}
            className="inline-flex min-h-10 items-center gap-2 rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
          >
            <Icono nombre="recibo" tamano={17} />
            Descargar PDF
          </button>
        }
      />
    </div>
  );
}
