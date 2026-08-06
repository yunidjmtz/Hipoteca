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

  return (
    <div className="w-full max-w-md rounded-medio border border-linea bg-superficie-2/50 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-tinta-suave">Total mínimo</p>
        <p className="font-cifra text-sm font-semibold tabular-nums text-tinta">
          {formatEuros(necesario)}
        </p>
      </div>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full bg-linea"
        role="progressbar"
        aria-label="Progreso hacia el desembolso inicial mínimo"
        aria-valuemin={0}
        aria-valuemax={necesario}
        aria-valuenow={Math.min(ahorro, necesario)}
      >
        <div
          className="h-full rounded-full bg-acento transition-all duration-700"
          style={{ width: `${progreso * 100}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-tinta-suave">Tienes</p>
          <p className="mt-0.5 font-cifra text-lg font-semibold tabular-nums text-acento">
            {formatEuros(ahorro)}
          </p>
        </div>
        <div>
          <p className="text-xs text-tinta-suave">Te falta</p>
          <p
            className={`mt-0.5 font-cifra text-lg font-semibold tabular-nums ${faltante > 0 ? 'text-ajustado' : 'text-comodo'}`}
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

  return (
    <div className="space-y-4">
      {filas.map(({ label, ayuda, value, ratio }) => {
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
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  destacado?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={[
        'relative rounded-medio border px-4 py-3',
        destacado
          ? 'border-acento/40 bg-acento-tenue'
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
          destacado ? 'text-acento' : alerta ? 'text-revisar' : 'text-tinta',
        ].join(' ')}
      >
        {valor}
      </p>
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
    { etiqueta: 'Deudas', importe: deudas, color: 'bg-no-viable' },
    { etiqueta: 'Gastos', importe: gastos, color: 'bg-ajustado' },
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

  const rango = useMemo(() => ({ min: toCents(50_000), max: toCents(2_000_000) }), []);
  const rangoIngresos = useMemo(() => ({ min: toCents(50_000), max: toCents(10_000_000) }), []);

  const ctxFactory = useMemo(
    () => (p: ReturnType<typeof toCents>) => construirContexto(estado, p),
    [estado],
  );

  const porAhorro = useMemo(
    () => buscarPrecioMaximo((e) => e.faltante === 0, ctxFactory, rango),
    [ctxFactory, rango],
  );

  const porIngresos = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.ratioBancario <= ajustes.ratioBancarioMaximo,
        ctxFactory,
        rangoIngresos,
      ),
    [ctxFactory, rangoIngresos, ajustes.ratioBancarioMaximo],
  );

  const porComodo = useMemo(
    () =>
      buscarPrecioMaximo(
        (e) => e.ratioPersonal <= ajustes.ratioPersonalObjetivo,
        ctxFactory,
        rangoIngresos,
      ),
    [ctxFactory, rangoIngresos, ajustes.ratioPersonalObjetivo],
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
            <div className="flex items-center justify-between border-b border-linea bg-acento-tenue px-5 py-3">
              <p className="rotulo">Resumen en tiempo real</p>
              <Link
                to="/"
                className="inline-flex items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
              >
                Actualizar datos →
              </Link>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TarjetaResumen
                  rotulo="Ingresos / mes"
                  valor={ingresosMensuales > 0 ? formatEuros(ingresosMensuales) : '—'}
                  detalle={perfil.titulares.length === 2 ? '2 titulares' : '1 titular'}
                  destacado={ingresosMensuales > 0}
                />
                <TarjetaResumen
                  rotulo="Ahorros actuales"
                  valor={formatEuros(perfil.ahorrosActuales)}
                />
                <TarjetaResumen
                  rotulo="Cuota máx. bancaria"
                  valor={cuotaMaximaBancaria > 0 ? formatEuros(cuotaMaximaBancaria) : '—'}
                  detalle={`${formatPorcentaje(ajustes.ratioBancarioMaximo)} de ingresos − deudas`}
                />
                <TarjetaResumen
                  rotulo="Capacidad de ahorro"
                  valor={ingresosMensuales > 0 ? formatEuros(capacidadAhorroActual) : '—'}
                  detalle="Incluye alquiler y gastos actuales"
                  alerta={ingresosMensuales > 0 && capacidadAhorroActual === 0}
                />
                <TarjetaResumen
                  rotulo="Gastos del mes"
                  valor={formatEuros(gastosDelMes)}
                  detalle="Incluye el alquiler actual"
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {modo === 'resumen' && (
        <>
          <section className="aparece-2 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="flex items-center justify-between border-b border-linea bg-acento-tenue px-5 py-3">
              <div className="flex items-start gap-2">
                <span className="flex w-7 self-stretch items-center justify-center rounded-chico bg-acento-tenue text-acento">
                  <Icono nombre="casa" tamano={16} />
                </span>
                <div className="flex flex-col items-start gap-1">
                  <p className="rotulo">Mi plan hipotecario</p>
                  {preferencias.precioObjetivo > 0 && <EstadoBadge estado={evaluacion.estado} />}
                </div>
              </div>
              {evaluacion.estado !== 'no_viable' && (
                <Link
                  to="/plan-hipotecario"
                  className="inline-flex items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
                >
                  Ir a mi plan →
                </Link>
              )}
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
                <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:hidden">
                  <div className="rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Precio
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
                  <div className="rounded-chico bg-superficie-2 px-3 py-2">
                    <p className="text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.06em] text-tinta-media">
                      Cuota
                    </p>
                    <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                      {formatEuros(evaluacion.cuota)}
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
                <div className="hidden overflow-x-auto px-5 py-4 sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-linea text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-tinta-media">
                        <th className="pb-2 pr-4 font-semibold">Precio</th>
                        <th className="pb-2 pr-4 text-right font-semibold">Cuota</th>
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
                          {formatEuros(evaluacion.cuota)}
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
              <p className="px-5 py-4 text-sm text-tinta-media">
                Introduce un precio objetivo en Tus datos para ver la estimación de la compra.
              </p>
            )}
          </section>

          <section className="aparece-3 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            <div className="border-b border-linea bg-acento-tenue px-5 py-3">
              <p className="rotulo">Capacidad de compra</p>
              <h3 className="mt-1 font-display text-base text-tinta">
                Qué precio puedes asumir hoy
              </h3>
            </div>
            <div className="p-5">
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
          <section className="flex items-center justify-between gap-4 rounded-grande border border-linea bg-superficie px-5 py-4 shadow-papel">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-medio bg-acento-tenue text-acento">
                <Icono nombre="casa" tamano={19} />
              </span>
              <div>
                <p className="rotulo">Precio objetivo</p>
                <p className="font-display text-xl text-tinta tabular-nums">
                  {formatEuros(evaluacion.precio)}
                </p>
                <div className="mt-1.5">
                  <EstadoBadge estado={evaluacion.estado} />
                </div>
              </div>
            </div>
            <Link
              to="/escala"
              className="inline-flex shrink-0 items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
            >
              Ver escala →
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
              <section className="rounded-grande border border-linea bg-superficie px-6 py-5 shadow-papel">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="rotulo mb-1">Desembolso inicial</p>
                    <h3 className="font-display text-[1.1rem] leading-snug text-tinta">
                      Todo lo que necesitas para comprar
                    </h3>
                  </div>
                  <ProgresoEntrada
                    ahorro={evaluacion.ahorroDisponible}
                    necesario={evaluacion.dineroMinimo}
                    faltante={evaluacion.faltante}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                  {desgloseDesembolso.map(([etiqueta, valor]) => (
                    <div key={etiqueta}>
                      <p className="text-xs leading-snug text-tinta-media">{etiqueta}</p>
                      <p className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
                        {formatEuros(valor)}
                      </p>
                    </div>
                  ))}
                  <div className="border-l-2 border-acento pl-3">
                    <p className="text-xs leading-snug text-tinta-media">Mínimo total</p>
                    <p className="mt-1 font-cifra font-semibold tabular-nums text-acento">
                      {formatEuros(evaluacion.dineroMinimo)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm leading-relaxed text-tinta-suave">
                  <span>
                    Puedes cambiar estas estimaciones, incluido el porcentaje de inmobiliaria, en
                  </span>
                  <button
                    type="button"
                    onClick={abrirAjustes}
                    className="inline-flex items-center rounded-medio border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-papel transition-colors hover:bg-superficie-2"
                  >
                    Ajustes →
                  </button>
                  <span>.</span>
                </div>
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
              Ajusta el interés, el plazo y el dinero que pedirías al banco para obtener una cuota
              más precisa.
            </p>
            <Link
              to="/ofertas/simulador"
              className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento"
            >
              Añadir oferta →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
