import { useEffect, useMemo, useRef, useState } from 'react';
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

type FrecuenciaAportacion = 'unica' | 'mensual';

function mesParaInput(fecha: string): string {
  return fecha.slice(0, 7);
}

function cuotaParaMes(fechaPrimeraCuota: string, mesSeleccionado: string): number {
  const [anioBase = '1970', mesBase = '1'] = fechaPrimeraCuota.split('-');
  const [anioSeleccionado = anioBase, mesSeleccionadoNumero = mesBase] = mesSeleccionado.split('-');

  return (
    (Number(anioSeleccionado) - Number(anioBase)) * 12 +
    Number(mesSeleccionadoNumero) -
    Number(mesBase) +
    1
  );
}

function formatDuracionMeses(meses: number): string {
  if (meses < 12) return `${meses} mes${meses === 1 ? '' : 'es'}`;
  const anios = Math.floor(meses / 12);
  const mesesSueltos = meses % 12;
  const textoAnios = `${anios} año${anios === 1 ? '' : 's'}`;
  if (mesesSueltos === 0) return textoAnios;
  return `${textoAnios} y ${mesesSueltos} mes${mesesSueltos === 1 ? '' : 'es'}`;
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

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-t border-linea px-4 py-4 transition-colors hover:bg-superficie-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <div>
            <h3 id="detalle-pagos-titulo" className="text-lg text-tinta">
              Ver la evolución año a año
            </h3>
            <p className="mt-0.5 text-xs text-tinta-media">
              Abre el desglose completo solo cuando lo necesites.
            </p>
          </div>
          <span className="shrink-0 text-xl leading-none text-acento transition-transform group-open:rotate-45">
            +
          </span>
        </summary>

        <section aria-labelledby="detalle-pagos-titulo" className="border-t border-linea">
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
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

interface PropsAmortizacion {
  readonly ofertaInicial?: OfertaBancaria;
  readonly integrada?: boolean;
}

export function Amortizacion({ ofertaInicial, integrada = false }: PropsAmortizacion) {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const resultadoRef = useRef<HTMLDivElement>(null);
  const { escenarioSimulador, ofertas } = estado;
  const [idOfertaSeleccionada, setIdOfertaSeleccionada] = useState<string>(
    () => ofertaInicial?.id ?? ofertas[0]?.id ?? '',
  );
  const ofertaSeleccionada: OfertaBancaria | null =
    ofertaInicial ??
    ofertas.find((oferta) => oferta.id === idOfertaSeleccionada) ??
    ofertas[0] ??
    null;
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
  const [frecuenciaAportacion, setFrecuenciaAportacion] = useState<FrecuenciaAportacion>('unica');
  const [desdeMes, setDesdeMes] = useState(12);
  const [duracionMeses, setDuracionMeses] = useState(12);
  const [opcion, setOpcion] = useState<OpcionAmortizacion>('plazo');
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const inicioAportaciones = Math.min(Math.max(desdeMes, 1), plazoMeses);
  const mesesDisponibles = Math.max(plazoMeses - inicioAportaciones + 1, 1);
  const numeroAportaciones =
    frecuenciaAportacion === 'unica' ? 1 : Math.min(duracionMeses, mesesDisponibles);
  const finAportaciones = inicioAportaciones + numeroAportaciones - 1;
  const fechaInicioAportacion = flujoBase[inicioAportaciones]?.fecha ?? inputBase.fechaPrimeraCuota;
  const fechaFinAportacion = flujoBase[finAportaciones]?.fecha ?? fechaInicioAportacion;
  const fechaFinHipoteca = flujoBase.at(-1)?.fecha ?? inputBase.fechaPrimeraCuota;
  const opcionesDuracion = useMemo(
    () =>
      [...new Set([3, 6, 12, 24, mesesDisponibles].filter((meses) => meses <= mesesDisponibles))]
        .filter((meses) => meses > 0)
        .sort((a, b) => a - b),
    [mesesDisponibles],
  );
  const aportacionesValidas = useMemo(() => {
    if (importeAportacion <= ZERO) return [];

    return Array.from({ length: numeroAportaciones }, (_, indice) => ({
      importe: importeAportacion,
      enMes: inicioAportaciones + indice,
    }));
  }, [importeAportacion, inicioAportaciones, numeroAportaciones]);
  const totalAportaciones = useMemo(
    () => sumCents(aportacionesValidas.map((aportacion) => aportacion.importe)),
    [aportacionesValidas],
  );

  const comisionParcial = escenarioBase.comisiones.amortizacionParcial;

  const resultadoAmort = useMemo(() => {
    if (!mostrarResultado || aportacionesValidas.length === 0) return null;
    return simularAmortizacionAnticipada(inputBase, {
      aportaciones: aportacionesValidas,
      opcion,
      comisionParcial,
    });
  }, [mostrarResultado, aportacionesValidas, opcion, comisionParcial, inputBase]);

  useEffect(() => {
    if (resultadoAmort === null) return;

    const frame = window.requestAnimationFrame(() => {
      resultadoRef.current?.scrollIntoView({ block: 'start' });
      resultadoRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [resultadoAmort]);

  function simular() {
    setMostrarResultado(true);
  }

  function editarSimulacion() {
    setMostrarResultado(false);
  }

  function limpiarSimulacion() {
    setImporteAportacion(ZERO);
    setFrecuenciaAportacion('unica');
    setDesdeMes(12);
    setDuracionMeses(12);
    setOpcion('plazo');
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
      <div className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-3">
      {!integrada && (
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
      )}

      {resultadoAmort === null && (
        <Panel rotulo="Simulador sencillo" titulo="Prueba un pago extra">
          <div className="flex flex-col gap-6">
            {!integrada && (
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
            )}

            <section
              aria-label="Resumen de la hipoteca"
              className="rounded-grande bg-superficie-2 px-4 py-4"
            >
              <p className="text-sm leading-relaxed text-tinta-media">
                Ahora pagas{' '}
                <strong className="font-cifra text-base tabular-nums text-tinta">
                  {formatEuros(cuota)} al mes
                </strong>{' '}
                y terminarías en{' '}
                <strong className="text-tinta">{formatMesAnio(fechaFinHipoteca)}</strong>.
              </p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-acento">
                  Ver datos de esta hipoteca
                </summary>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-linea pt-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-tinta-suave">Capital prestado</dt>
                    <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(capital)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-tinta-suave">Plazo</dt>
                    <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {escenarioBase.plazoAnios} años
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-tinta-suave">Intereses previstos</dt>
                    <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(interesesTotales)}
                    </dd>
                  </div>
                </dl>
              </details>
            </section>

            <section aria-labelledby="paso-aportacion" className="border-t border-linea pt-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-bold text-sobre-acento">
                  1
                </span>
                <div>
                  <h3 id="paso-aportacion" className="text-base text-tinta">
                    Elige tu pago extra
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-tinta-media">
                    Todo el importe reduce directamente lo que debes al banco.
                  </p>
                </div>
              </div>

              <fieldset>
                <legend className="sr-only">Cómo harías el pago extra</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['unica', 'Una sola vez'],
                      ['mensual', 'Cada mes'],
                    ] as const
                  ).map(([frecuencia, etiqueta]) => (
                    <label
                      key={frecuencia}
                      className={[
                        'cursor-pointer rounded-medio border px-3 py-3 text-center text-sm font-semibold transition-colors',
                        frecuenciaAportacion === frecuencia
                          ? 'border-acento bg-acento-tenue text-acento'
                          : 'border-linea text-tinta-media hover:bg-superficie-2',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="frecuencia-amortizacion"
                        value={frecuencia}
                        checked={frecuenciaAportacion === frecuencia}
                        onChange={() => {
                          setFrecuenciaAportacion(frecuencia);
                          setMostrarResultado(false);
                        }}
                        className="sr-only"
                      />
                      {etiqueta}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4">
                <InputMoneda
                  id="amort-importe"
                  etiqueta={
                    frecuenciaAportacion === 'unica'
                      ? '¿Cuánto dinero adelantarías?'
                      : '¿Cuánto añadirías cada mes?'
                  }
                  valor={importeAportacion}
                  onChange={(importe) => {
                    setImporteAportacion(importe);
                    setMostrarResultado(false);
                  }}
                />
              </div>
            </section>

            <section aria-labelledby="paso-cuando" className="border-t border-linea pt-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-bold text-sobre-acento">
                  2
                </span>
                <div>
                  <h3 id="paso-cuando" className="text-base text-tinta">
                    Indica cuándo
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-tinta-media">
                    Usa una fecha real; no necesitas saber el número de cuota.
                  </p>
                </div>
              </div>

              <div
                className={[
                  'grid gap-4',
                  frecuenciaAportacion === 'mensual' ? 'sm:grid-cols-2' : '',
                ].join(' ')}
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor="amort-desde" className="text-sm font-medium text-tinta">
                    {frecuenciaAportacion === 'unica'
                      ? 'Mes en que harías el pago'
                      : 'Mes en que empezarías'}
                  </label>
                  <input
                    id="amort-desde"
                    type="month"
                    min={mesParaInput(inputBase.fechaPrimeraCuota)}
                    max={mesParaInput(fechaFinHipoteca)}
                    value={mesParaInput(fechaInicioAportacion)}
                    onChange={(e) => {
                      const cuotaElegida = cuotaParaMes(
                        inputBase.fechaPrimeraCuota,
                        e.target.value,
                      );
                      setDesdeMes(Math.min(Math.max(cuotaElegida, 1), plazoMeses));
                      setMostrarResultado(false);
                    }}
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                  />
                </div>

                {frecuenciaAportacion === 'mensual' && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="amort-duracion" className="text-sm font-medium text-tinta">
                      Durante cuánto tiempo
                    </label>
                    <select
                      id="amort-duracion"
                      value={numeroAportaciones}
                      onChange={(e) => {
                        setDuracionMeses(Number(e.target.value));
                        setMostrarResultado(false);
                      }}
                      className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                    >
                      {opcionesDuracion.map((meses) => (
                        <option key={meses} value={meses}>
                          {meses === mesesDisponibles
                            ? `Hasta terminar (${formatDuracionMeses(meses)})`
                            : formatDuracionMeses(meses)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>

            <section aria-labelledby="paso-objetivo" className="border-t border-linea pt-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-bold text-sobre-acento">
                  3
                </span>
                <div>
                  <h3 id="paso-objetivo" className="text-base text-tinta">
                    Elige qué quieres conseguir
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-tinta-media">
                    Si dudas, terminar antes suele ahorrar más intereses.
                  </p>
                </div>
              </div>

              <fieldset>
                <legend className="sr-only">Objetivo del pago extra</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        valor: 'plazo',
                        titulo: 'Terminar antes',
                        descripcion: 'Mantienes una cuota parecida y acortas la hipoteca.',
                        recomendacion: 'Suele ahorrar más',
                      },
                      {
                        valor: 'cuota',
                        titulo: 'Pagar menos al mes',
                        descripcion: 'Mantienes la fecha final y reduces la cuota mensual.',
                        recomendacion: null,
                      },
                    ] as const
                  ).map((objetivo) => (
                    <label
                      key={objetivo.valor}
                      className={[
                        'cursor-pointer rounded-grande border px-4 py-4 transition-colors',
                        opcion === objetivo.valor
                          ? 'border-acento bg-acento-tenue'
                          : 'border-linea hover:bg-superficie-2',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="objetivo-amortizacion"
                        value={objetivo.valor}
                        checked={opcion === objetivo.valor}
                        onChange={() => {
                          setOpcion(objetivo.valor);
                          setMostrarResultado(false);
                        }}
                        className="sr-only"
                      />
                      <span className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-tinta">{objetivo.titulo}</strong>
                        {objetivo.recomendacion !== null && (
                          <span className="rounded-full bg-comodo-tenue px-2 py-0.5 text-[0.6875rem] font-semibold text-comodo">
                            {objetivo.recomendacion}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-tinta-media">
                        {objetivo.descripcion}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {importeAportacion > ZERO && (
              <div aria-live="polite" className="rounded-grande bg-acento-tenue px-4 py-4">
                <p className="rotulo text-acento">Tu prueba</p>
                <p className="mt-1 text-sm leading-relaxed text-tinta">
                  {frecuenciaAportacion === 'unica' ? (
                    <>
                      Un pago de <strong>{formatEuros(importeAportacion)}</strong> en{' '}
                      <strong>{formatMesAnio(fechaInicioAportacion)}</strong>.
                    </>
                  ) : (
                    <>
                      <strong>{formatEuros(importeAportacion)} al mes</strong> durante{' '}
                      <strong>{formatDuracionMeses(numeroAportaciones)}</strong>, de{' '}
                      {formatMesAnio(fechaInicioAportacion)} a {formatMesAnio(fechaFinAportacion)}.
                      En total aportarías hasta <strong>{formatEuros(totalAportaciones)}</strong>.
                    </>
                  )}
                </p>
                {comisionParcial > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-tinta-media">
                    Incluiremos la comisión del banco ({formatPorcentaje(comisionParcial)}) en el
                    resultado.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={simular}
              disabled={aportacionesValidas.length === 0}
              className="w-full rounded-medio bg-acento px-5 py-3 text-sm font-semibold text-sobre-acento transition-colors hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Calcular mi ahorro
            </button>
          </div>
        </Panel>
      )}

      {resultadoAmort !== null && (
        <div ref={resultadoRef} tabIndex={-1} className="scroll-mt-3 focus:outline-none">
          <Panel
            rotulo="Tu resultado"
            titulo={
              resultadoAmort.ahorroNeto > ZERO
                ? `Podrías ahorrar ${formatEuros(resultadoAmort.ahorroNeto)}`
                : 'Este plan no te ahorra dinero'
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
              <p className="rotulo">Ahorro neto estimado</p>
              <p
                className={[
                  'mt-1 cifra-grande font-bold',
                  resultadoAmort.ahorroNeto > ZERO ? 'text-comodo' : 'text-no-viable',
                ].join(' ')}
              >
                {formatEuros(resultadoAmort.ahorroNeto)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                {resultadoAmort.ahorroNeto > ZERO
                  ? `Es lo que dejarías de pagar al banco después de descontar ${formatEuros(resultadoAmort.comision)} de comisión.`
                  : 'La comisión es igual o mayor que los intereses que conseguirías evitar.'}
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-grande border border-linea">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-superficie-2 text-center text-xs font-semibold text-tinta-media">
                <p className="border-r border-linea px-3 py-2.5">Sin pago extra</p>
                <p className="px-3 py-2.5 text-acento">Con tu pago extra</p>
              </div>

              {opcion === 'cuota' && resultadoAmort.nuevaCuota !== null && (
                <dl className="grid grid-cols-2 text-center">
                  <div className="border-r border-linea px-3 py-4">
                    <dt className="text-xs text-tinta-suave">Cuota mensual</dt>
                    <dd className="mt-1 font-cifra text-lg font-bold tabular-nums text-tinta">
                      {formatEuros(cuota)}
                    </dd>
                  </div>
                  <div className="px-3 py-4">
                    <dt className="text-xs text-tinta-suave">Nueva cuota</dt>
                    <dd className="mt-1 font-cifra text-lg font-bold tabular-nums text-comodo">
                      {formatEuros(resultadoAmort.nuevaCuota)}
                    </dd>
                    {resultadoAmort.diferenciaCuota !== null &&
                      resultadoAmort.diferenciaCuota > ZERO && (
                        <dd className="mt-1 text-xs font-semibold text-comodo">
                          {formatEuros(resultadoAmort.diferenciaCuota)} menos al mes
                        </dd>
                      )}
                  </div>
                </dl>
              )}

              {opcion === 'plazo' && resultadoAmort.nuevoNumCuotas !== null && (
                <dl className="grid grid-cols-2 text-center">
                  <div className="border-r border-linea px-3 py-4">
                    <dt className="text-xs text-tinta-suave">Terminarías en</dt>
                    <dd className="mt-1 text-base font-bold text-tinta">
                      {formatMesAnio(fechaFinHipoteca)}
                    </dd>
                  </div>
                  <div className="px-3 py-4">
                    <dt className="text-xs text-tinta-suave">Nueva fecha</dt>
                    <dd className="mt-1 text-base font-bold text-comodo">
                      {formatMesAnio(resultadoAmort.flujoAmortizado.at(-1)?.fecha ?? '')}
                    </dd>
                    {resultadoAmort.diferenciaMeses !== null &&
                      resultadoAmort.diferenciaMeses > 0 && (
                        <dd className="mt-1 text-xs font-semibold text-comodo">
                          {formatDuracionMeses(resultadoAmort.diferenciaMeses)} antes
                        </dd>
                      )}
                  </div>
                </dl>
              )}

              <dl className="grid grid-cols-2 border-t border-linea text-center">
                <div className="border-r border-linea px-3 py-4">
                  <dt className="text-xs text-tinta-suave">Intereses</dt>
                  <dd className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
                    {formatEuros(resultadoAmort.interesesOriginales)}
                  </dd>
                </div>
                <div className="px-3 py-4">
                  <dt className="text-xs text-tinta-suave">Nuevos intereses</dt>
                  <dd className="mt-1 font-cifra font-semibold tabular-nums text-comodo">
                    {formatEuros(resultadoAmort.interesesAmortizados)}
                  </dd>
                  <dd className="mt-1 text-xs font-semibold text-comodo">
                    Evitas {formatEuros(resultadoAmort.ahorroIntereses)}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-tinta-media">
              Cálculo orientativo con las condiciones guardadas de esta hipoteca. El banco debe
              confirmar el importe exacto y cómo aplica la comisión.
            </p>

            <div className="mt-5 flex flex-col gap-2 border-t border-linea pt-4 sm:flex-row">
              <button
                type="button"
                onClick={editarSimulacion}
                className="rounded-medio bg-acento px-4 py-2.5 text-sm font-semibold text-sobre-acento hover:bg-acento/90"
              >
                Probar otra cantidad
              </button>
              <button
                type="button"
                onClick={limpiarSimulacion}
                className="rounded-medio border border-linea px-4 py-2.5 text-sm font-medium text-tinta-media hover:bg-superficie-2 hover:text-tinta"
              >
                Empezar de nuevo
              </button>
            </div>
          </Panel>
        </div>
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
