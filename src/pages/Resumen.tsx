import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { EstadoBadge } from '@/components/EstadoBadge';
import { Icono } from '@/components/Icono';
import { InfoTooltip } from '@/components/InfoTooltip';
import { formatEuros, formatPorcentaje } from '@/core/format';
import {
  type Cents,
  ZERO,
  addCents,
  centsRoundHalfUp,
  fromCents,
  maxCents,
  subtractCents,
  toCents,
} from '@/core/money';
import {
  buscarPrecioMaximo,
  calcularAlquilerActualMensual,
  calcularCapacidadAhorroActual,
  calcularDeudasMensuales,
  calcularGastosFijosActualesMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
  evaluarPrecio,
  RANGO_BUSQUEDA_CAPACIDAD,
} from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import { Meta } from '@/pages/Meta';

function ProgresoEntrada({
  ahorro,
  necesario,
  faltante,
}: {
  readonly ahorro: Cents;
  readonly necesario: Cents;
  readonly faltante: Cents;
}) {
  const progreso = necesario > 0 ? Math.min(1, ahorro / necesario) : 0;
  const porcentaje = Math.round(progreso * 100);

  return (
    <div className="w-full max-w-md rounded-medio border border-linea bg-superficie-2/50 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-tinta-suave">Total mínimo</p>
        <p className="font-cifra text-sm font-semibold tabular-nums text-tinta">
          {formatEuros(necesario)}
        </p>
      </div>
      <div
        className="mt-2 h-4 overflow-hidden rounded-full bg-linea"
        role="progressbar"
        aria-label="Progreso hacia el desembolso inicial mínimo"
        aria-valuemin={0}
        aria-valuemax={necesario}
        aria-valuenow={Math.min(ahorro, necesario)}
      >
        <div
          className="flex h-full items-center justify-center overflow-hidden rounded-full bg-acento px-2 transition-all duration-700"
          style={{ width: `${progreso * 100}%` }}
        >
          <span className="whitespace-nowrap text-[0.65rem] font-medium leading-none text-sobre-acento">
            {porcentaje} %
          </span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-tinta-suave">Tienes</p>
          <p className="mt-0.5 font-cifra text-lg font-semibold tabular-nums text-acento">
            {formatEuros(ahorro)}
          </p>
        </div>
        <div>
          <p className="text-xs text-tinta-suave">Te falta</p>
          <p
            className={`mt-0.5 font-cifra text-lg font-semibold tabular-nums ${faltante > 0 ? 'text-no-viable' : 'text-comodo'}`}
          >
            {formatEuros(faltante)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Barras de capacidad máxima ───────────────────────────────────────────────

function BarrasCapacidad({
  ahorro,
  ingresos,
  comodo,
  ratioIngresos,
  ratioComodo,
}: {
  ahorro: number | null;
  ingresos: number | null;
  comodo: number | null;
  ratioIngresos: number;
  ratioComodo: number;
}) {
  const filas = [
    {
      label: 'Con tus ahorros actuales',
      ayuda: 'Precio cuya entrada y gastos de compra puedes cubrir hoy.',
      value: ahorro,
    },
    {
      label: 'Compra Máxima',
      ayuda: 'Precio máximo con una cuota de hasta el límite que acepta el banco.',
      value: ingresos,
      ratio: ratioIngresos,
    },
    {
      label: 'Compra cómoda',
      ayuda: 'Precio máximo manteniendo la cuota dentro de tu límite personal.',
      value: comodo,
      ratio: ratioComodo,
    },
  ];
  const filasOrdenadas = [filas[0]!, filas[2]!, filas[1]!];

  return (
    <div className="space-y-4">
      {filasOrdenadas.map(({ label, ayuda, value, ratio }) => {
        return (
          <div key={label} className="rounded-medio bg-superficie-2/70 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                    {label}
                  </span>
                  {ratio !== undefined && (
                    <span className="rounded-full bg-superficie-2 px-2 py-0.5 font-cifra text-[0.7rem] font-semibold text-acento tabular-nums">
                      {Math.round(ratio * 100)} %
                    </span>
                  )}
                </div>
                <p className="mt-1 font-cifra text-base font-semibold text-tinta tabular-nums">
                  {value !== null ? formatEuros(toCents(value)) : '—'}
                </p>
              </div>
              <InfoTooltip texto={ayuda} alineado="derecha" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Escala visual de precios ─────────────────────────────────────────────────

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

export function Resumen({ modo = 'resumen' }: { readonly modo?: 'resumen' | 'plan' }) {
  const { estado } = useEstado();
  const navegar = useNavigate();
  const { abrirAjustes } = useOutletContext<{ abrirAjustes: () => void }>();
  const { preferencias, ajustes, perfil } = estado;

  const ctx = useMemo(
    () => construirContexto(estado, preferencias.precioObjetivo),
    [estado, preferencias.precioObjetivo],
  );

  const evaluacion = useMemo(
    () => evaluarPrecio(preferencias.precioObjetivo, ctx),
    [preferencias.precioObjetivo, ctx],
  );

  const ingresosMensuales = addCents(
    calcularIngresoMensualNormalizado(perfil.titulares),
    calcularOtrosIngresosMensuales(perfil),
  );
  const detalleIngresos = perfil.titulares
    .map(
      (titular, indice) =>
        `Titular ${indice + 1}: ${formatEuros(calcularIngresoMensualNormalizado([titular]))}/Mes`,
    )
    .join('\n');
  const resumenVacio = ingresosMensuales <= ZERO && preferencias.precioObjetivo <= ZERO;
  const deudasMensuales = calcularDeudasMensuales(perfil.deudas);
  const alquilerMarcado = calcularAlquilerActualMensual(perfil.gastosFijos);
  const gastosDelMes = addCents(
    calcularGastosFijosActualesMensuales(perfil.gastosFijos),
    alquilerMarcado > ZERO ? ZERO : perfil.alquilerActual,
  );
  const cuotaMaximaBancaria = maxCents(
    ZERO,
    subtractCents(
      centsRoundHalfUp(ingresosMensuales * ajustes.ratioBancarioMaximo),
      deudasMensuales,
    ),
  );
  const capacidadAhorroActual = calcularCapacidadAhorroActual(perfil);

  const ctxFactory = useMemo(
    () => (p: ReturnType<typeof toCents>) => construirContexto(estado, p),
    [estado],
  );

  const porAhorro = useMemo(
    () => buscarPrecioMaximo((e) => e.faltante === 0, ctxFactory, RANGO_BUSQUEDA_CAPACIDAD),
    [ctxFactory],
  );

  const porIngresos = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.ratioBancario <= ajustes.ratioBancarioMaximo,
        ctxFactory,
        RANGO_BUSQUEDA_CAPACIDAD,
      ),
    [ctxFactory, ajustes.ratioBancarioMaximo],
  );

  const porComodo = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.ratioPersonal <= ajustes.ratioPersonalObjetivo,
        ctxFactory,
        RANGO_BUSQUEDA_CAPACIDAD,
      ),
    [ctxFactory, ajustes.ratioPersonalObjetivo],
  );
  const hipotecaNoViablePorIngresos = evaluacion.ratioBancario > ajustes.ratioBancarioMaximo;

  useEffect(() => {
    if (!resumenVacio) return;
    const redireccion = window.setTimeout(() => {
      void navegar('/', { replace: true });
    }, 1800);
    return () => window.clearTimeout(redireccion);
  }, [navegar, resumenVacio]);

  const desgloseDesembolso: readonly (readonly [string, Cents])[] = [
    ['Entrada', evaluacion.entrada],
    ['Impuestos', evaluacion.impuestos],
    ['Notaría, registro, gestoría y tasación', evaluacion.gastosObligatorios],
    ['Inmobiliaria (IVA incluido)', evaluacion.gastosInmobiliaria],
    ...(evaluacion.gastosBroker > 0
      ? ([['Broker hipotecario', evaluacion.gastosBroker]] as const)
      : []),
  ];

  if (resumenVacio) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="rotulo mb-1">Resumen</p>
          <h1 className="font-display text-2xl text-tinta">Primero, completa Tus datos</h1>
        </header>
        <section
          className="rounded-grande border border-acento/35 bg-acento-tenue px-6 py-6 shadow-papel"
          role="status"
        >
          <p className="max-w-xl text-sm leading-relaxed text-tinta">
            Para preparar tu resumen necesitamos, al menos, tus ingresos y el precio objetivo de la
            vivienda. Te llevaremos a <strong>Tus datos</strong> para completarlos.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link
              to="/"
              className="rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento"
            >
              Completar Tus datos →
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

      {modo === 'resumen' && (
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
                Ir a mis datos →
              </Link>
            </div>
          </section>
        </div>
      )}

      {modo === 'resumen' && (
        <>
          <section className="aparece-2 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="flex items-center justify-between border-b border-linea bg-acento-tenue px-5 py-3">
              <p className="rotulo">Mi plan hipotecario</p>
              {preferencias.precioObjetivo > 0 && <EstadoBadge estado={evaluacion.estado} />}
            </div>
            {preferencias.precioObjetivo > 0 && evaluacion.estado === 'no_viable' ? (
              <div className="flex flex-col items-center px-6 py-7 text-center">
                <p className="max-w-sm text-sm leading-relaxed text-tinta-media">
                  Una vivienda de{' '}
                  <strong className="font-cifra font-semibold text-tinta">
                    {formatEuros(evaluacion.precio)}
                  </strong>{' '}
                  tendría una cuota equivalente al{' '}
                  <strong className="font-cifra font-semibold text-no-viable">
                    {formatPorcentaje(evaluacion.ratioBancario)}
                  </strong>{' '}
                  de tus ingresos, pero el banco admite como máximo el{' '}
                  <strong className="font-cifra font-semibold text-tinta">
                    {formatPorcentaje(ajustes.ratioBancarioMaximo)}
                  </strong>
                  .
                </p>
                {evaluacion.faltante > 0 && (
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-tinta-media">
                    Además, te faltan{' '}
                    <strong className="font-cifra font-semibold text-no-viable">
                      {formatEuros(evaluacion.faltante)}
                    </strong>{' '}
                    para cubrir la entrada y los gastos iniciales.
                  </p>
                )}
                <Link
                  to="/plan-hipotecario"
                  className="mt-4 inline-flex items-center rounded-medio border border-linea bg-superficie px-4 py-2 text-sm font-medium text-acento shadow-papel transition-colors hover:bg-acento-tenue"
                >
                  Cambiar el plan →
                </Link>
              </div>
            ) : preferencias.precioObjetivo > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 px-3 py-4 sm:hidden">
                  <div className="col-span-2 rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Precio de la vivienda
                    </p>
                    <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(evaluacion.precio)}
                      {Number.isFinite(evaluacion.ratioBancario) && (
                        <span className="mt-1 block text-xs font-medium text-tinta-media">
                          Ratio endeudamiento: {formatPorcentaje(evaluacion.ratioBancario)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Cuota hipotecaria aproximada
                    </p>
                    <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(evaluacion.cuota)} /Mes
                      <span className="mt-1 block text-xs font-medium text-tinta-media">
                        Cuota máx. bancaria: {formatEuros(cuotaMaximaBancaria)} /Mes
                      </span>
                    </p>
                  </div>
                  <div className="rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="whitespace-nowrap text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Necesitas reunir
                    </p>
                    <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(evaluacion.dineroMinimo)}
                    </p>
                  </div>
                  <div className="rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Faltante
                    </p>
                    <p
                      className={`mt-0.5 font-cifra font-semibold tabular-nums ${
                        evaluacion.faltante > 0 ? 'text-no-viable' : 'text-tinta'
                      }`}
                    >
                      {evaluacion.faltante > 0 ? formatEuros(evaluacion.faltante) : '—'}
                    </p>
                  </div>
                </div>
                <div className="hidden overflow-x-auto px-4 py-4 sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-linea text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-tinta-media">
                        <th className="pb-2 pr-4 font-semibold">Precio de la vivienda</th>
                        <th className="pb-2 pr-4 text-right font-semibold">
                          Cuota hipotecaria aproximada
                        </th>
                        <th className="pb-2 pr-4 text-right font-semibold">Necesitas reunir</th>
                        <th className="pb-2 pr-4 text-right font-semibold">Faltante</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-acento-tenue">
                        <td className="py-2 pr-4 font-cifra font-semibold tabular-nums text-tinta">
                          {formatEuros(evaluacion.precio)}
                          {Number.isFinite(evaluacion.ratioBancario) && (
                            <span className="ml-2 text-xs font-medium text-tinta-media">
                              Ratio endeudamiento: {formatPorcentaje(evaluacion.ratioBancario)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-cifra tabular-nums text-tinta">
                          {formatEuros(evaluacion.cuota)} /Mes
                          <span className="mt-1 block text-xs font-medium text-tinta-media">
                            Cuota máx. bancaria: {formatEuros(cuotaMaximaBancaria)} /Mes
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-cifra tabular-nums text-tinta">
                          {formatEuros(evaluacion.dineroMinimo)}
                        </td>
                        <td
                          className={`py-2 pr-4 text-right font-cifra tabular-nums ${
                            evaluacion.faltante > 0 ? 'text-no-viable' : 'text-tinta'
                          }`}
                        >
                          {evaluacion.faltante > 0 ? formatEuros(evaluacion.faltante) : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="px-3 py-4 sm:px-4 text-sm text-tinta-media">
                Introduce un precio objetivo en Tus datos para ver la estimación de la compra.
              </p>
            )}
            {evaluacion.estado !== 'no_viable' && (
              <div className="flex justify-end border-t border-linea px-5 py-3">
                <Link
                  to="/plan-hipotecario"
                  className="inline-flex items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
                >
                  Ir a mi plan →
                </Link>
              </div>
            )}
          </section>

          <section className="aparece-3 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="border-b border-linea bg-acento-tenue px-5 py-3">
              <p className="rotulo">Capacidad de compra estimada</p>
            </div>
            <div className="px-3 py-5 sm:px-4">
              <BarrasCapacidad
                ahorro={porAhorro.precioMaximo !== null ? fromCents(porAhorro.precioMaximo) : null}
                ingresos={
                  porIngresos.precioMaximo !== null ? fromCents(porIngresos.precioMaximo) : null
                }
                comodo={porComodo.precioMaximo !== null ? fromCents(porComodo.precioMaximo) : null}
                ratioIngresos={ajustes.ratioBancarioMaximo}
                ratioComodo={ajustes.ratioPersonalObjetivo}
              />
            </div>
          </section>
        </>
      )}

      {modo === 'plan' && (
        <div className="flex flex-col gap-5">
          <section className="overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-acento-tenue text-acento">
                  <Icono nombre="casa" tamano={19} />
                </span>
                <div>
                  <p className="rotulo">Precio objetivo</p>
                  <p className="font-display text-xl text-tinta tabular-nums">
                    {formatEuros(evaluacion.precio)}
                  </p>
                </div>
              </div>
              <EstadoBadge estado={evaluacion.estado} />
            </div>
            <Link
              to="/escala"
              className="flex w-full items-center justify-center border-t border-linea px-5 py-3 text-sm font-medium text-acento transition-colors hover:bg-acento-tenue"
            >
              Ver escala de precios →
            </Link>
          </section>

          {hipotecaNoViablePorIngresos ? (
            <section className="rounded-grande border border-no-viable/35 bg-no-viable-tenue px-6 py-5 shadow-papel">
              <p className="rotulo mb-1 text-no-viable">Hipoteca no viable</p>
              <h2 className="font-display text-[1.1rem] leading-snug text-tinta">
                Con tus ingresos actuales, esta hipoteca supera el límite del banco.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-tinta-media">
                {evaluacion.motivo}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-chico bg-superficie/70 px-3 py-2.5">
                  <p className="text-xs text-tinta-suave">Cuota estimada</p>
                  <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                    {formatEuros(evaluacion.cuota)}
                  </p>
                </div>
                <div className="rounded-chico bg-superficie/70 px-3 py-2.5">
                  <p className="text-xs text-tinta-suave">Endeudamiento</p>
                  <p className="mt-0.5 font-cifra font-semibold tabular-nums text-no-viable">
                    {Number.isFinite(evaluacion.ratioBancario)
                      ? formatPorcentaje(evaluacion.ratioBancario)
                      : 'Sin ingresos'}
                  </p>
                </div>
                <div className="rounded-chico bg-superficie/70 px-3 py-2.5">
                  <p className="text-xs text-tinta-suave">Límite bancario</p>
                  <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                    {formatPorcentaje(ajustes.ratioBancarioMaximo)}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="rounded-grande border border-linea bg-superficie px-6 py-4 shadow-papel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="rotulo mb-1">Desembolso inicial</p>
                  </div>
                  <ProgresoEntrada
                    ahorro={evaluacion.ahorroDisponible}
                    necesario={evaluacion.dineroMinimo}
                    faltante={evaluacion.faltante}
                  />
                </div>
                <div className="mt-4 border-t border-linea pt-3">
                  <p className="rotulo">Desglose de Desembolso:</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                    {desgloseDesembolso.map(([etiqueta, valor]) => (
                      <div key={etiqueta}>
                        <p className="text-xs leading-snug text-tinta-media">{etiqueta}</p>
                        <p className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
                          {formatEuros(valor)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-tinta-suave">
                  Puedes cambiar estas estimaciones, incluido el porcentaje de inmobiliaria, en{' '}
                  <button
                    type="button"
                    onClick={abrirAjustes}
                    className="font-medium text-acento underline decoration-acento/50 underline-offset-4 transition-colors hover:text-acento-oscuro hover:decoration-acento"
                  >
                    Ajustes
                  </button>
                  .
                </p>
              </section>

              {evaluacion.faltante > 0 && (
                <section className="aparece-3 flex flex-col gap-4" aria-label="Meta de ahorro">
                  <Meta />
                </section>
              )}
            </>
          )}
        </div>
      )}

      {modo === 'resumen' && (
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
      )}
    </div>
  );
}
