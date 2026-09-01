import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { InfoTooltip } from '@/components/InfoTooltip';
import { formatEuros } from '@/core/format';
import {
  type Cents,
  ZERO,
  addCents,
  maxCents,
  subtractCents,
} from '@/core/money';
import {
  buscarPrecioMaximo,
  calcularAlquilerActualMensual,
  calcularCapacidadAhorroActual,
  calcularDeudasMensuales,
  calcularGastosFijosActualesMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
  esCompraComoda,
  RANGO_BUSQUEDA_CAPACIDAD,
} from '@/finance/affordability';
import { construirContexto, CONTEXTO_VIVIENDA_PLAN } from '@/finance/contexto';
import { EscalaPrecios } from '@/pages/EscalaPrecios';
// ─── Barras de capacidad máxima ───────────────────────────────────────────────

function BarrasCapacidad({
  comodo,
  bancario,
  ratioComodo,
  ratioBancario,
}: {
  comodo: Cents | null;
  bancario: Cents | null;
  ratioComodo: number;
  ratioBancario: number;
}) {
  const limiteEscala = bancario ?? comodo;
  const anchoComodo =
    limiteEscala !== null && comodo !== null && limiteEscala > ZERO
      ? Math.min(100, (comodo / limiteEscala) * 100)
      : 0;
  const margenSeguridad =
    bancario !== null && comodo !== null && bancario > comodo
      ? subtractCents(bancario, comodo)
      : null;

  const ayudaCompraComoda =
    'Precio máximo manteniendo el coste mensual de la vivienda dentro de tu límite personal y un margen positivo tras tus gastos.';
  const ayudaLimiteBancario =
    'Precio máximo estimado antes de alcanzar el límite de endeudamiento configurado para el banco. No contempla tu margen personal de seguridad.';

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-grande border border-comodo/30 bg-comodo-tenue px-4 py-4 shadow-papel sm:px-5">
        <div
          aria-hidden="true"
          className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-acento/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-12 left-1/3 h-24 w-24 rounded-full bg-comodo/10 blur-2xl"
        />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-medio border border-comodo/25 bg-superficie/70 text-comodo shadow-papel">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3.5 11 8.5-7 8.5 7" />
                  <path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="rotulo text-comodo">Compra cómoda</p>
                  <InfoTooltip texto={ayudaCompraComoda} alineado="derecha" />
                </div>
                <p className="mt-0.5 text-xs leading-snug text-tinta-media">
                  Tu referencia para comprar sin apretar el presupuesto
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-comodo/20 bg-superficie/75 px-2.5 py-1 font-cifra text-[0.68rem] font-semibold text-comodo tabular-nums">
              {Math.round(ratioComodo * 100)} % esfuerzo
            </span>
          </div>

          <p className="mt-4 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.035em] text-tinta tabular-nums sm:text-[2rem]">
            {comodo !== null ? formatEuros(comodo) : '—'}
          </p>

          {margenSeguridad !== null && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-superficie/70 px-2.5 py-1.5 text-xs text-tinta-media">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-comodo" />
              <span>
                Deja{' '}
                <strong className="font-semibold text-tinta">
                  {formatEuros(margenSeguridad)}
                </strong>{' '}
                antes del máximo bancario
              </span>
            </div>
          )}
        </div>
      </div>

      {limiteEscala !== null && (
        <div className="rounded-grande border border-linea bg-superficie-2/45 px-4 py-4 sm:px-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="rotulo">Tu rango estimado</p>
              <p className="mt-1 text-xs text-tinta-media">De una compra tranquila al máximo</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-revisar">Más esfuerzo →</span>
          </div>

          <div
            className="relative mt-4 flex h-3 overflow-visible rounded-full bg-revisar-tenue shadow-inner"
            role="img"
            aria-label={`Compra cómoda hasta ${formatEuros(comodo ?? ZERO)}; límite bancario hasta ${formatEuros(limiteEscala)}`}
          >
            <span
              className="h-full rounded-full bg-comodo transition-all duration-500"
              style={{ width: `${anchoComodo}%` }}
            />
            {comodo !== null && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-superficie bg-comodo shadow-papel"
                style={{ left: `${anchoComodo}%` }}
              />
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.055em] text-comodo">
                Compra cómoda
              </p>
              <p className="mt-0.5 font-cifra text-sm font-semibold text-tinta tabular-nums">
                {comodo !== null ? formatEuros(comodo) : '—'}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.055em] text-revisar">
                  Límite bancario
                </p>
                <InfoTooltip texto={ayudaLimiteBancario} alineado="derecha" />
              </div>
              <p className="mt-0.5 font-cifra text-sm font-semibold text-tinta tabular-nums">
                {bancario !== null ? formatEuros(bancario) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-1 pt-1 text-xs text-tinta-media">
        <span>Calculado con tus ingresos y deudas actuales</span>
        <span className="shrink-0 rounded-full bg-acento-tenue px-2 py-1 font-cifra font-semibold text-acento tabular-nums">
          Banco {Math.round(ratioBancario * 100)} %
        </span>
      </div>
    </div>
  );
}

function DialogoEscalaPrecios({ alCerrar }: { readonly alCerrar: () => void }) {
  const botonCerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overflowBodyAnterior = document.body.style.overflow;
    const overflowHtmlAnterior = document.documentElement.style.overflow;
    const overscrollHtmlAnterior = document.documentElement.style.overscrollBehavior;
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar();
    };

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.addEventListener('keydown', alPulsarTecla);
    botonCerrarRef.current?.focus();

    return () => {
      document.body.style.overflow = overflowBodyAnterior;
      document.documentElement.style.overflow = overflowHtmlAnterior;
      document.documentElement.style.overscrollBehavior = overscrollHtmlAnterior;
      document.removeEventListener('keydown', alPulsarTecla);
    };
  }, [alCerrar]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overscroll-none bg-tinta/35 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-escala-precios"
        aria-describedby="descripcion-escala-precios"
        className="flex h-[min(46rem,calc(100dvh-1rem))] w-full max-w-4xl flex-col overflow-hidden overscroll-contain rounded-grande border border-linea bg-superficie shadow-elevado sm:h-[min(46rem,calc(100dvh-2rem))]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-linea bg-acento-tenue px-4 py-4 sm:px-6">
          <div>
            <p className="rotulo text-acento">Capacidad de compra</p>
            <h2 id="titulo-escala-precios" className="mt-1 font-display text-xl text-tinta">
              Desglose por rango de precio
            </h2>
            <p
              id="descripcion-escala-precios"
              className="mt-1 max-w-2xl text-xs leading-relaxed text-tinta-media sm:text-sm"
            >
              Compara la entrada, el dinero mínimo, lo que te faltaría y la cuota estimada para
              cada precio.
            </p>
          </div>
          <button
            ref={botonCerrarRef}
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar desglose por precio"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linea bg-superficie text-xl leading-none text-tinta shadow-papel transition-colors hover:bg-superficie-2"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain px-3 py-4 sm:px-6 sm:py-5">
          <EscalaPrecios incrustada />
        </div>
      </section>
    </div>,
    document.body,
  );
}

// ─── Escala resumida de precios ───────────────────────────────────────────────

// ─── Resumen financiero ───────────────────────────────────────────────────────

function TarjetaResumen({
  rotulo,
  valor,
  detalle,
  destacado = false,
  alerta,
  negativo = false,
  positivo = false,
  className,
  pie,
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  destacado?: boolean;
  alerta?: boolean;
  negativo?: boolean;
  positivo?: boolean;
  className?: string;
  pie?: string;
}) {
  return (
    <div
      className={[
        'relative rounded-medio border px-4 py-3',
        className,
        destacado
          ? 'border-acento/40 bg-acento-tenue'
          : positivo
            ? 'border-comodo/40 bg-comodo-tenue'
            : negativo
              ? 'border-no-viable/40 bg-no-viable/10'
              : alerta
                ? 'border-revisar/40 bg-revisar-tenue'
                : 'border-linea bg-superficie-2',
      ].join(' ')}
    >
      <div className="pr-4">
        <p className="text-[0.6rem] font-semibold uppercase leading-4 tracking-[0.04em] text-tinta-media">
          {rotulo}
        </p>
        {detalle && (
          <div className="absolute top-2 right-2">
            <InfoTooltip texto={detalle} alineado="derecha" />
          </div>
        )}
      </div>
      <p
        className={[
          'font-cifra tabular-nums text-lg font-semibold leading-tight',
          destacado
            ? 'text-acento'
            : positivo
              ? 'text-comodo'
              : negativo
                ? 'text-no-viable'
                : alerta
                  ? 'text-revisar'
                  : 'text-tinta',
        ].join(' ')}
      >
        {valor}
      </p>
      {pie && (
        <p className="mt-1 whitespace-pre-line font-cifra text-xs font-medium text-tinta-media">
          {pie}
        </p>
      )}
    </div>
  );
}

function BalanceMensualCircular({
  ingresos,
  gastos,
  deudas,
  ahorro,
}: {
  readonly ingresos: Cents;
  readonly gastos: Cents;
  readonly deudas: Cents;
  readonly ahorro: Cents;
}) {
  const disponible = maxCents(ZERO, ahorro);
  const superaIngresos = gastos + deudas > ingresos;
  const total = superaIngresos ? addCents(gastos, deudas) : maxCents(ingresos, ZERO);
  const deudasYGastos = addCents(gastos, deudas);
  const porcentaje = (importe: Cents) => (total > ZERO ? (importe / total) * 100 : 0);
  const segmentos = [
    {
      etiqueta: 'Deudas y gastos',
      importe: deudasYGastos,
      color: 'color-mix(in srgb, var(--c-no-viable) 78%, var(--c-superficie))',
      claseTexto: 'text-no-viable',
    },
    {
      etiqueta: 'Dinero libre',
      importe: disponible,
      color: 'color-mix(in srgb, var(--c-comodo) 78%, var(--c-superficie))',
      claseTexto: 'text-comodo',
    },
  ].map((segmento) => ({ ...segmento, porcentaje: porcentaje(segmento.importe) }));

  let acumulado = 0;
  const arcos = segmentos.map((segmento) => {
    const inicio = acumulado;
    acumulado += segmento.porcentaje;
    return { ...segmento, inicio };
  });

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <div
        className="relative mx-auto h-36 w-36"
        role="img"
        aria-label={segmentos
          .map((segmento) => `${segmento.etiqueta}: ${formatEuros(segmento.importe)}`)
          .join('; ')}
      >
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--c-linea)" strokeWidth="15" />
          {arcos.map((segmento) => (
            <circle
              key={segmento.etiqueta}
              cx="60"
              cy="60"
              r="48"
              fill="none"
              pathLength="100"
              stroke={segmento.color}
              strokeDasharray={`${Math.min(segmento.porcentaje, 100)} ${Math.max(0, 100 - segmento.porcentaje)}`}
              strokeDashoffset={-segmento.inicio}
              strokeWidth="15"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.04em] text-tinta-media">
            {superaIngresos ? 'Gastos y deudas' : 'Ingresos'}
          </span>
          <span className="font-cifra text-base font-semibold tabular-nums text-tinta">
            {formatEuros(total)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {segmentos.map((segmento) => (
          <div key={segmento.etiqueta} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segmento.color }}
                aria-hidden="true"
              />
              <span className="text-tinta-media">{segmento.etiqueta}</span>
            </div>
            <span
              className={`shrink-0 font-cifra font-semibold tabular-nums ${segmento.claseTexto}`}
            >
              {formatEuros(segmento.importe)} · {Math.round(segmento.porcentaje)} %
            </span>
          </div>
        ))}
        {superaIngresos && (
          <p className="pt-1 text-xs text-no-viable">
            Tus gastos y deudas superan tus ingresos en{' '}
            {formatEuros(subtractCents(addCents(gastos, deudas), ingresos))}.
          </p>
        )}
      </div>
    </div>
  );
}

export function RepartoMensual({
  ingresos,
  deudas,
  gastos,
  cuotaObjetivo,
}: {
  readonly ingresos: Cents;
  readonly deudas: Cents;
  readonly gastos: Cents;
  readonly cuotaObjetivo: Cents;
}) {
  const libre = maxCents(
    ZERO,
    subtractCents(subtractCents(subtractCents(ingresos, deudas), gastos), cuotaObjetivo),
  );
  const porcentaje = (importe: Cents) => Math.round((importe / ingresos) * 100);
  const ancho = (importe: Cents) => `${Math.min(100, (importe / ingresos) * 100)}%`;
  const segmentos = [
    { etiqueta: 'Deudas y gastos', importe: addCents(deudas, gastos), color: 'bg-no-viable' },
    { etiqueta: 'Cuota objetivo', importe: cuotaObjetivo, color: 'bg-acento' },
    { etiqueta: 'Libre', importe: libre, color: 'bg-comodo' },
  ].filter((segmento) => segmento.importe > 0);

  return (
    <div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-superficie-2"
        role="img"
        aria-label={segmentos
          .map((segmento) => `${segmento.etiqueta}: ${formatEuros(segmento.importe)}`)
          .join('; ')}
      >
        {segmentos.map((segmento) => (
          <div
            key={segmento.etiqueta}
            className={`h-full ${segmento.color} transition-all duration-500`}
            style={{ width: ancho(segmento.importe) }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-tinta-suave">
        {segmentos.map((segmento) => (
          <span key={segmento.etiqueta} className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${segmento.color}`} />
            {segmento.etiqueta} {formatEuros(segmento.importe)} · {porcentaje(segmento.importe)} %
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Resumen() {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const { preferencias, ajustes, perfil } = estado;
  const [escalaAbierta, setEscalaAbierta] = useState(false);
  const botonEscalaRef = useRef<HTMLButtonElement>(null);
  const cerrarEscala = useCallback(() => {
    setEscalaAbierta(false);
    window.requestAnimationFrame(() => botonEscalaRef.current?.focus());
  }, []);

  const otrosIngresosMensuales = calcularOtrosIngresosMensuales(perfil);
  const ingresosMensuales = addCents(
    calcularIngresoMensualNormalizado(perfil.titulares),
    otrosIngresosMensuales,
  );
  const detalleIngresos = [
    ...perfil.titulares.map(
      (titular, indice) =>
        `Titular ${indice + 1}: ${formatEuros(calcularIngresoMensualNormalizado([titular]))}/Mes`,
    ),
    ...(otrosIngresosMensuales > ZERO
      ? [`Otros ingresos: ${formatEuros(otrosIngresosMensuales)}/Mes`]
      : []),
  ].join('\n');
  const resumenVacio = ingresosMensuales <= ZERO;
  const deudasMensuales = calcularDeudasMensuales(perfil.deudas);
  const alquilerMarcado = calcularAlquilerActualMensual(perfil.gastosFijos);
  const gastosDelMes = addCents(
    calcularGastosFijosActualesMensuales(
      perfil.gastosFijos,
      perfil.gastoGeneralMensual,
      perfil.modoGastosMensuales,
    ),
    alquilerMarcado > ZERO ? ZERO : perfil.alquilerActual,
  );
  const capacidadAhorroActual = calcularCapacidadAhorroActual(perfil);

  const ctxFactory = useMemo(
    () => (p: Cents) => construirContexto(estado, p, undefined, CONTEXTO_VIVIENDA_PLAN),
    [estado],
  );

  const porComodo = useMemo(
    () =>
      buscarPrecioMaximo(
        (evaluacion) => esCompraComoda(evaluacion, ajustes.ratioPersonalObjetivo),
        ctxFactory,
        RANGO_BUSQUEDA_CAPACIDAD,
      ),
    [ctxFactory, ajustes.ratioPersonalObjetivo],
  );
  const porBancario = useMemo(
    () =>
      buscarPrecioMaximo(
        (evaluacion) => evaluacion.ratioBancario <= ajustes.ratioBancarioMaximo,
        ctxFactory,
        RANGO_BUSQUEDA_CAPACIDAD,
      ),
    [ctxFactory, ajustes.ratioBancarioMaximo],
  );

  useEffect(() => {
    if (!resumenVacio) return;
    const redireccion = window.setTimeout(() => {
      void navegar('/', { replace: true });
    }, 1800);
    return () => window.clearTimeout(redireccion);
  }, [navegar, resumenVacio]);

  if (resumenVacio) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="rotulo mb-1">Resumen</p>
          <h1 className="font-display text-2xl text-tinta">Primero, completa Mis finanzas</h1>
        </header>
        <section
          className="rounded-grande border border-acento/35 bg-acento-tenue px-6 py-6 shadow-papel"
          role="status"
        >
          <p className="max-w-xl text-sm leading-relaxed text-tinta">
            Para preparar tu resumen necesitamos, al menos, tus ingresos. Con ellos calcularemos
            automáticamente una compra cómoda. Te llevaremos a <strong>Mis finanzas</strong> para
            completarlos.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link
              to="/"
              className="rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento"
            >
              Completar mis finanzas →
            </Link>
            <span className="text-xs text-tinta-media">Redirigiendo automáticamente…</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {preferencias.ccaa !== '' && preferencias.ccaa !== 'Aragón' && (
        <div className="rounded-medio border border-revisar/40 bg-revisar-tenue px-4 py-3 text-sm text-tinta">
          Los impuestos de {preferencias.ccaa} usan una estimación genérica: ITP del 8 % y AJD del
          1,5 %, sin bonificaciones autonómicas. Confírmalos antes de tomar una decisión.
        </div>
      )}

      <div>
        <section className="aparece-1 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="border-b border-linea bg-acento-tenue px-5 py-3">
              <p className="rotulo">Mis finanzas</p>
            </div>
            <div className="px-3 py-5 sm:px-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <TarjetaResumen
                  rotulo="Ingresos / mes"
                  valor={ingresosMensuales > 0 ? formatEuros(ingresosMensuales) : '—'}
                  detalle={`${perfil.titulares.length} ${perfil.titulares.length === 1 ? 'titular' : 'titulares'}`}
                  destacado={ingresosMensuales > 0}
                  className="col-span-full"
                  pie={detalleIngresos}
                />
                <div className="col-span-full rounded-medio border border-acento/40 bg-acento-tenue p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.04em] text-tinta-media">
                      Balance mensual
                    </p>
                    <p className="text-xs text-tinta-media">Cómo repartes tus ingresos</p>
                  </div>
                  <BalanceMensualCircular
                    ingresos={ingresosMensuales}
                    gastos={gastosDelMes}
                    deudas={deudasMensuales}
                    ahorro={capacidadAhorroActual}
                  />
                </div>
                <TarjetaResumen
                  rotulo="Ahorros actuales"
                  valor={formatEuros(perfil.ahorrosActuales)}
                  className="col-span-full"
                />
              </div>
            </div>
            <div className="flex justify-end border-t border-linea px-5 py-3">
              <Link
                to="/"
                className="inline-flex items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
              >
                Editar mis finanzas →
              </Link>
            </div>
        </section>
      </div>

      <section className="aparece-2 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
        <div className="border-b border-linea bg-acento-tenue px-5 py-3">
          <p className="rotulo">Capacidad de compra estimada</p>
        </div>
        <div className="px-3 py-5 sm:px-4">
          <BarrasCapacidad
            comodo={porComodo.precioMaximo}
            bancario={porBancario.precioMaximo}
            ratioComodo={ajustes.ratioPersonalObjetivo}
            ratioBancario={ajustes.ratioBancarioMaximo}
          />
        </div>
        <div className="border-t border-linea px-3 py-3 sm:px-4">
          <button
            ref={botonEscalaRef}
            type="button"
            onClick={() => setEscalaAbierta(true)}
            className="group flex w-full items-center gap-3 rounded-medio px-2 py-2 text-left transition-colors hover:bg-superficie-2"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-acento-tenue text-acento">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              >
                <path d="M4 6.5h16M4 11.5h16M4 16.5h16" />
                <path d="M8 4v15" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-tinta">Ver desglose por precio</span>
              <span className="mt-0.5 block text-xs text-tinta-media">
                Entrada, cuota y ahorro necesario en cada rango
              </span>
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-lg text-acento transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </button>
        </div>
      </section>

      <section className="rounded-grande border border-acento/30 bg-acento-tenue px-5 py-4">
        <p className="rotulo mb-1">Siguiente paso</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-tinta">
            Añade un inmueble para comparar su precio con tu capacidad de compra y tus ahorros.
          </p>
          <Link
            to="/ofertas"
            className="shrink-0 self-end rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento"
          >
            Agregar una oferta →
          </Link>
        </div>
      </section>

      {escalaAbierta && <DialogoEscalaPrecios alCerrar={cerrarEscala} />}
    </div>
  );
}
