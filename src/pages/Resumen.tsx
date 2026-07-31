import { useMemo } from 'react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useEstado } from '@/app/EstadoProvider';
import { EstadoBadge } from '@/components/EstadoBadge';
import {
  EncabezadoConUnidad,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
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
  calcularCapacidadAhorroActual,
  calcularDeudasMensuales,
  calcularGastosFijosMensuales,
  calcularIngresoMensualNormalizado,
  evaluarPrecio,
} from '@/finance/affordability';
import { construirContexto } from '@/finance/contexto';
import type { EvaluacionPrecio, EstadoViabilidad } from '@/domain/types';
import { Meta } from '@/pages/Meta';

const ESTADO_COLOR: Record<EstadoViabilidad, string> = {
  comodo: 'var(--c-comodo)',
  viable: 'var(--c-comodo)',
  ajustado: 'var(--c-ajustado)',
  falta_ahorro: 'var(--c-revisar)',
  cuota_excesiva: 'var(--c-revisar)',
  no_viable: 'var(--c-no-viable)',
};

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
  const size = 68;
  const grosor = 6;
  const radio = (size - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;

  return (
    <div className="flex items-center gap-3 rounded-medio border border-linea bg-superficie-2/50 px-4 py-3">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="relative">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ transform: 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radio}
              fill="none"
              stroke="var(--c-linea)"
              strokeWidth={grosor}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radio}
              fill="none"
              stroke="var(--c-acento)"
              strokeWidth={grosor}
              strokeLinecap="round"
              strokeDasharray={`${progreso * circunferencia} ${circunferencia}`}
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-cifra text-sm font-semibold tabular-nums text-tinta">
            {Math.round(progreso * 100)}%
          </span>
        </div>
        <span className="text-xs font-medium text-tinta-suave">Entrada mínima</span>
      </div>
      <div className="min-w-[8rem] leading-tight">
        <p className="text-xs text-tinta-suave">Tienes disponible</p>
        <p className="font-cifra tabular-nums text-base font-bold text-tinta">
          {formatEuros(ahorro)}
        </p>
        <p className="mt-1 text-xs text-tinta-suave">Necesitas {formatEuros(necesario)}</p>
        {faltante > 0 && (
          <p className="mt-0.5 font-cifra tabular-nums text-xs font-semibold text-ajustado">
            Te faltan {formatEuros(faltante)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Barras de capacidad máxima ───────────────────────────────────────────────

function BarrasCapacidad({
  ahorro,
  ingresos,
  comodo,
  objetivo,
  ratioIngresos,
  ratioComodo,
}: {
  ahorro: number | null;
  ingresos: number | null;
  comodo: number | null;
  objetivo: number;
  ratioIngresos: number;
  ratioComodo: number;
}) {
  const valoresTecho = [ahorro, ingresos].filter((valor): valor is number => valor !== null);
  const techoReal = valoresTecho.length > 0 ? Math.min(...valoresTecho) : null;
  const limitaAhorro = ahorro !== null && techoReal === ahorro;
  const limitePrincipal = limitaAhorro ? 'el ahorro disponible' : 'la cuota que admite el banco';
  const diferenciaReal = techoReal !== null ? techoReal - objetivo : null;

  const maxVal = Math.max(ahorro ?? 0, ingresos ?? 0, comodo ?? 0, objetivo) * 1.08 || 1;
  const p = (v: number | null) =>
    v !== null ? `${Math.min((v / maxVal) * 100, 100).toFixed(2)}%` : '0%';
  const objPct = `${Math.min((objetivo / maxVal) * 100, 100).toFixed(2)}%`;

  const filas = [
    {
      label: 'Por ahorro disponible',
      ayuda:
        'El precio máximo cuya entrada, impuestos, notaría, tasación e inmobiliaria puedes cubrir hoy.',
      value: ahorro,
    },
    {
      label: 'Por ingresos',
      ayuda: 'El máximo que admite el banco según tu cuota e ingresos.',
      value: ingresos,
      ratio: ratioIngresos,
    },
    {
      label: 'Compra cómoda',
      ayuda: 'El precio que mantiene la cuota dentro de tu límite personal.',
      value: comodo,
      ratio: ratioComodo,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-medio border border-linea bg-superficie-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="rotulo mb-1">Tu techo real hoy</p>
          <p className="text-sm text-tinta-media">
            {techoReal !== null
              ? `Lo determina ${limitePrincipal}.`
              : 'Completa tu perfil para calcularlo.'}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-[1.55rem] leading-none text-tinta tabular-nums">
            {techoReal !== null ? formatEuros(toCents(techoReal)) : '—'}
          </p>
          {diferenciaReal !== null && (
            <p
              className="mt-1 text-xs font-semibold"
              style={{
                color: diferenciaReal >= 0 ? 'var(--c-comodo)' : 'var(--c-no-viable)',
              }}
            >
              {diferenciaReal >= 0
                ? `${formatEuros(toCents(diferenciaReal))} por encima del objetivo`
                : `${formatEuros(toCents(Math.abs(diferenciaReal)))} por debajo del objetivo`}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea pb-3">
        <span className="text-xs text-tinta-media">Cada barra se compara con</span>
        <span className="flex items-center gap-2 text-xs font-semibold text-acento">
          <span className="h-3 w-0.5 rounded-full bg-acento" aria-hidden="true" />
          Objetivo: {formatEuros(toCents(objetivo))}
        </span>
      </div>

      {filas.map(({ label, ayuda, value, ratio }) => {
        const diferencia = value !== null ? value - objetivo : null;
        const cumpleObjetivo = diferencia !== null && diferencia >= 0;
        const quedaCerca =
          diferencia !== null && diferencia < 0 && Math.abs(diferencia) <= objetivo * 0.05;
        const color = cumpleObjetivo
          ? 'var(--c-comodo)'
          : quedaCerca
            ? 'var(--c-ajustado)'
            : 'var(--c-no-viable)';

        return (
          <div key={label}>
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-tinta">
                  {label}
                  {ratio !== undefined && (
                    <span className="rounded-full bg-superficie-2 px-2 py-0.5 font-cifra text-[0.7rem] font-semibold text-acento tabular-nums">
                      {Math.round(ratio * 100)} %
                    </span>
                  )}
                </p>
                <p className="text-xs text-tinta-suave">{ayuda}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="font-cifra text-sm font-semibold text-tinta tabular-nums">
                  {value !== null ? formatEuros(toCents(value)) : '—'}
                </p>
                {diferencia !== null && (
                  <p className="text-[0.7rem] font-medium" style={{ color }}>
                    {cumpleObjetivo
                      ? `${formatEuros(toCents(diferencia))} de margen`
                      : `Faltan ${formatEuros(toCents(Math.abs(diferencia)))}`}
                  </p>
                )}
              </div>
            </div>
            <div
              className="relative h-3 overflow-visible rounded-full bg-superficie-2"
              role="img"
              aria-label={`${label}: ${
                value !== null ? formatEuros(toCents(value)) : 'sin datos'
              }; objetivo ${formatEuros(toCents(objetivo))}`}
            >
              {value !== null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: p(value),
                    background: color,
                    opacity: 0.72,
                    transition: 'width 0.6s ease',
                  }}
                />
              )}
              <div
                className="absolute -inset-y-1 w-0.5 rounded-full bg-acento"
                style={{ left: objPct }}
                aria-hidden="true"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Escala visual de precios ─────────────────────────────────────────────────

function EscalaVisual({ filas, objetivo }: { filas: EvaluacionPrecio[]; objetivo: number }) {
  if (!filas.length) return null;

  return (
    <div className="relative rounded-medio bg-superficie-2/45 px-2 py-3 sm:px-3">
      <div
        className="absolute top-[2.1rem] left-[10%] right-[10%] h-1 rounded-full bg-linea"
        aria-hidden="true"
      />
      <div
        className="absolute top-[2.1rem] left-[40%] right-[40%] h-1 rounded-full bg-acento/70"
        aria-hidden="true"
      />
      <div className="relative flex">
        {filas.map((fila) => {
          const esObj = fila.precio === objetivo;
          const color = ESTADO_COLOR[fila.estado];
          const faltaAhorro = fila.faltante > 0;
          return (
            <div key={fila.precio} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="hidden font-cifra text-[0.6rem] leading-none text-center text-tinta-media tabular-nums sm:block">
                {formatEuros(fila.precio)}
              </span>
              <span className="font-cifra text-[0.65rem] leading-none text-center text-tinta-media tabular-nums sm:hidden">
                {Math.round(fromCents(fila.precio) / 1000)}k
              </span>
              <div className="relative z-10 flex h-9 items-center justify-center">
                <div
                  className="flex items-center justify-center rounded-full border-2 transition-all"
                  style={{
                    width: esObj ? '2.25rem' : '1.5rem',
                    height: esObj ? '2.25rem' : '1.5rem',
                    background: esObj ? color : 'var(--c-superficie)',
                    borderColor: color,
                    boxShadow: esObj
                      ? `0 0 0 4px color-mix(in srgb, ${color} 20%, transparent)`
                      : undefined,
                    flexShrink: 0,
                  }}
                >
                  {esObj && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                      <circle cx="4" cy="4" r="2.5" fill="white" />
                    </svg>
                  )}
                </div>
              </div>
              <div className={esObj ? '' : 'hidden sm:block'}>
                <EstadoBadge estado={fila.estado} />
              </div>
              {faltaAhorro && (
                <span
                  className={[
                    'font-cifra text-[0.58rem] font-semibold leading-none text-no-viable tabular-nums text-center',
                    esObj ? '' : 'hidden sm:inline',
                  ].join(' ')}
                >
                  Faltan {formatEuros(fila.faltante)}
                </span>
              )}
              <span className="hidden font-cifra text-[0.58rem] leading-none text-center text-tinta-suave tabular-nums sm:inline">
                {formatEuros(fila.cuota)}/m
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-tinta-suave sm:hidden">
        El punto central marca tu precio objetivo.
      </p>
    </div>
  );
}

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
        'rounded-medio border px-4 py-3',
        destacado
          ? 'border-acento/40 bg-acento-tenue'
          : alerta
            ? 'border-revisar/40 bg-revisar-tenue'
            : 'border-linea bg-superficie-2',
      ].join(' ')}
    >
      <p className="rotulo">{rotulo}</p>
      <p
        className={[
          'font-cifra tabular-nums text-lg font-semibold leading-tight',
          destacado ? 'text-acento' : alerta ? 'text-revisar' : 'text-tinta',
        ].join(' ')}
      >
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs leading-tight text-tinta-media">{detalle}</p>}
    </div>
  );
}

function RepartoMensual({
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

export function Resumen() {
  const { estado } = useEstado();
  const navegar = useNavigate();
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
    perfil.otrosIngresosMensuales,
  );
  const resumenVacio = ingresosMensuales <= ZERO && preferencias.precioObjetivo <= ZERO;
  const deudasMensuales = calcularDeudasMensuales(perfil.deudas);
  const gastosTrasComprar = calcularGastosFijosMensuales(perfil.gastosFijos);
  const cuotaMaximaBancaria = maxCents(
    ZERO,
    subtractCents(
      centsRoundHalfUp(ingresosMensuales * ajustes.ratioBancarioMaximo),
      deudasMensuales,
    ),
  );
  const cuotaObjetivo = centsRoundHalfUp(ingresosMensuales * ajustes.ratioPersonalObjetivo);
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
        (e) => e.ratioBancario <= ajustes.ratioPersonalObjetivo,
        ctxFactory,
        rangoIngresos,
      ),
    [ctxFactory, rangoIngresos, ajustes.ratioPersonalObjetivo],
  );

  const filasEscala = useMemo((): EvaluacionPrecio[] => {
    const paso = toCents(preferencias.pasoEscala);
    const obj = preferencias.precioObjetivo;
    const precios = [
      subtractCents(subtractCents(obj, paso), paso),
      subtractCents(obj, paso),
      obj,
      addCents(obj, paso),
      addCents(addCents(obj, paso), paso),
    ].filter((p) => p > 0);
    return precios.map((p) => evaluarPrecio(p, construirContexto(estado, p)));
  }, [estado, preferencias.precioObjetivo, preferencias.pasoEscala]);

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
              Completar Tus datos
            </Link>
            <span className="text-xs text-tinta-media">Redirigiendo automáticamente…</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="rotulo mb-1">Paso 2</p>
        <h1 className="font-display text-2xl text-tinta">Tu situación de un vistazo</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
          Esta es una primera estimación con las condiciones generales de Ajustes. Para introducir
          una oferta concreta del banco, usa el Simulador.
        </p>
      </header>

      {!['Aragón', 'Genérica (editable)'].includes(preferencias.ccaa) && (
        <div className="rounded-medio border border-revisar/40 bg-revisar-tenue px-4 py-3 text-sm text-tinta">
          Los impuestos de {preferencias.ccaa} son una estimación genérica. Revisa el tipo de ITP
          antes de tomar una decisión.
        </div>
      )}

      <section className="aparece-1 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
        <div className="flex items-center justify-between border-b border-linea bg-acento-tenue px-5 py-3">
          <p className="rotulo">Resumen en tiempo real</p>
          <p className="text-xs text-tinta-suave">Se actualiza al introducir datos</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TarjetaResumen
              rotulo="Ingresos / mes"
              valor={ingresosMensuales > 0 ? formatEuros(ingresosMensuales) : '—'}
              detalle={perfil.titulares.length === 2 ? '2 titulares' : '1 titular'}
              destacado={ingresosMensuales > 0}
            />
            <TarjetaResumen rotulo="Ahorros actuales" valor={formatEuros(perfil.ahorrosActuales)} />
            <TarjetaResumen
              rotulo="Cuota máx. bancaria"
              valor={cuotaMaximaBancaria > 0 ? formatEuros(cuotaMaximaBancaria) : '—'}
              detalle={`${formatPorcentaje(ajustes.ratioBancarioMaximo)} de ingresos − deudas`}
            />
            <TarjetaResumen
              rotulo="Capacidad de ahorro actual"
              valor={ingresosMensuales > 0 ? formatEuros(capacidadAhorroActual) : '—'}
              detalle="Incluye alquiler y gastos actuales"
              alerta={ingresosMensuales > 0 && capacidadAhorroActual === 0}
            />
          </div>

          {ingresosMensuales > 0 && (
            <div className="mt-4">
              <p className="rotulo mb-1">
                Reparto mensual con una cuota del {Math.round(ajustes.ratioPersonalObjetivo * 100)}{' '}
                %
              </p>
              <p className="mb-2 text-sm leading-relaxed text-tinta-suave">
                Tras comprar: no incluye los gastos marcados como alquiler actual.
              </p>
              <RepartoMensual
                ingresos={ingresosMensuales}
                deudas={deudasMensuales}
                gastos={gastosTrasComprar}
                cuotaObjetivo={cuotaObjetivo}
              />
            </div>
          )}
        </div>
      </section>

      <section className="aparece-2 overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <p className="rotulo">Tu precio objetivo</p>
          <Link to="/escala" className="text-xs text-acento hover:underline underline-offset-2">
            Ver escala completa →
          </Link>
        </div>
        {preferencias.precioObjetivo > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:hidden">
              <div className="rounded-chico bg-superficie-2 px-3 py-2">
                <p className="text-xs text-tinta-suave">Precio (€)</p>
                <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                  <ValorEurosTabla valor={evaluacion.precio} />
                </p>
              </div>
              <div className="rounded-chico bg-superficie-2 px-3 py-2">
                <p className="text-xs text-tinta-suave">Cuota (€)</p>
                <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                  <ValorEurosTabla valor={evaluacion.cuota} />
                </p>
              </div>
              <div className="rounded-chico bg-superficie-2 px-3 py-2">
                <p className="text-xs text-tinta-suave">Ratio (%)</p>
                <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                  {Number.isFinite(evaluacion.ratioBancario) ? (
                    <ValorPorcentajeTabla valor={evaluacion.ratioBancario} />
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div className="rounded-chico bg-superficie-2 px-3 py-2">
                <p className="text-xs text-tinta-suave">Faltante (€)</p>
                <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                  {evaluacion.faltante > 0 ? (
                    <ValorEurosTabla valor={evaluacion.faltante} />
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-chico bg-acento-tenue px-3 py-2">
                <span className="text-xs text-tinta-suave">Estado</span>
                <EstadoBadge estado={evaluacion.estado} />
              </div>
            </div>
            <div className="hidden overflow-x-auto px-5 py-4 sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs text-tinta-suave">
                    <th className="pb-2 pr-4 font-medium">
                      <EncabezadoConUnidad titulo="Precio" unidad="€" />
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      <EncabezadoConUnidad titulo="Cuota" unidad="€" />
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      <EncabezadoConUnidad titulo="Ratio" unidad="%" />
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      <EncabezadoConUnidad titulo="Faltante" unidad="€" />
                    </th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-acento-tenue">
                    <td className="py-2 pr-4 font-cifra font-semibold tabular-nums text-tinta">
                      <ValorEurosTabla valor={evaluacion.precio} />
                    </td>
                    <td className="py-2 pr-4 text-right font-cifra tabular-nums text-tinta">
                      <ValorEurosTabla valor={evaluacion.cuota} />
                    </td>
                    <td className="py-2 pr-4 text-right font-cifra tabular-nums text-tinta">
                      {Number.isFinite(evaluacion.ratioBancario)
                        ? <ValorPorcentajeTabla valor={evaluacion.ratioBancario} />
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-cifra tabular-nums text-tinta">
                      {evaluacion.faltante > 0 ? (
                        <ValorEurosTabla valor={evaluacion.faltante} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2">
                      <EstadoBadge estado={evaluacion.estado} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-linea px-5 py-3 text-sm text-tinta-media">
              {evaluacion.motivo}
            </p>
          </>
        ) : (
          <p className="px-5 py-4 text-sm text-tinta-media">
            Introduce un precio objetivo en Tus datos para ver la estimación de la compra.
          </p>
        )}
      </section>

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
        <p className="mt-4 text-xs leading-relaxed text-tinta-suave">
          Puedes cambiar estas estimaciones, incluido el porcentaje de inmobiliaria, desde Ajustes.
        </p>
      </section>

      <section className="aparece-3 flex flex-col gap-4" aria-label="Meta de ahorro">
        <Meta />
      </section>

      <section className="aparece-4 rounded-grande border border-linea bg-superficie shadow-papel px-6 py-5">
        <p className="rotulo mb-1">Capacidad máxima</p>
        <h3 className="mb-5 font-display text-[1.1rem] leading-snug text-tinta">
          Qué precio puedes asumir hoy
        </h3>
        <BarrasCapacidad
          ahorro={porAhorro.precioMaximo !== null ? fromCents(porAhorro.precioMaximo) : null}
          ingresos={porIngresos.precioMaximo !== null ? fromCents(porIngresos.precioMaximo) : null}
          comodo={porComodo.precioMaximo !== null ? fromCents(porComodo.precioMaximo) : null}
          objetivo={fromCents(preferencias.precioObjetivo)}
          ratioIngresos={ajustes.ratioBancarioMaximo}
          ratioComodo={ajustes.ratioPersonalObjetivo}
        />
      </section>

      {/* Escala visual */}
      <section className="aparece-5 rounded-grande border border-linea bg-superficie shadow-papel px-6 py-5">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <div>
            <p className="rotulo mb-1">Escala de precios</p>
            <h3 className="font-display text-[1.1rem] leading-snug text-tinta">
              Alrededor del objetivo
            </h3>
          </div>
          <Link
            to="/escala"
            className="rounded-medio border border-linea bg-superficie px-3 py-1.5 text-xs text-tinta transition-colors hover:bg-superficie-2 whitespace-nowrap"
          >
            Ver completa →
          </Link>
        </div>
        <EscalaVisual filas={filasEscala} objetivo={preferencias.precioObjetivo} />
      </section>

      <section className="rounded-grande border border-acento/30 bg-acento-tenue px-5 py-4">
        <p className="rotulo mb-1">Siguiente paso</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-tinta">
            Ajusta el interés, el plazo y el dinero que pedirías al banco para obtener una cuota más
            precisa.
          </p>
          <Link
            to="/simulador"
            className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-semibold text-sobre-acento"
          >
            Abrir simulador
          </Link>
        </div>
      </section>
    </div>
  );
}
