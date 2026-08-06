import { useEffect, useMemo, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { useNavigate, useSearchParams } from 'react-router';
import { Panel } from '@/components/Panel';
import { InputMoneda } from '@/components/InputMoneda';
import { InputPorcentaje } from '@/components/InputPorcentaje';
import { InfoTooltip } from '@/components/InfoTooltip';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
import { fechaLocalISO } from '@/core/dates';
import { formatEuros, formatPorcentaje } from '@/core/format';
import {
  type Cents,
  ZERO,
  toCents,
  multiplyCents,
  subtractCents,
  sumCents,
  maxCents,
  minCents,
} from '@/core/money';
import {
  construirFlujoDeCaja,
  calcularTinMes,
  calcularBonificacionTotal,
} from '@/finance/mortgage';
import { analizarVinculacion } from '@/finance/linkedProducts';
import { calcularTaeEstimada } from '@/finance/apr';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import { ofertaDesdeSimulacion, simulacionDesdeOferta } from '@/domain/mortgageOffer';
import { BANCOS_ESPANA, type BancoEspana } from '@/data/bancosEspana';
import type {
  EscenarioHipoteca,
  EstadoOferta,
  FlujoInput,
  OfertaBancaria,
  ProductoVinculado,
  TipoHipoteca,
  PeriodicidadRevision,
} from '@/domain/types';
import {
  ANIOS_FIJOS_MIXTO_POR_DEFECTO,
  TIN_FIJO_MIXTO_POR_DEFECTO,
  normalizarEscenarioHipoteca,
} from '@/domain/mortgageScenario';

// ---------------------------------------------------------------------------
// Subcomponente: Fila de vinculación en la tabla de análisis
// ---------------------------------------------------------------------------

function FilaVinculacion({
  v,
  input,
  editando,
  onEditar,
  onEliminar,
  onGuardar,
  onCancelarEdicion,
}: {
  v: ProductoVinculado;
  input: FlujoInput;
  editando: boolean;
  onEditar: () => void;
  onEliminar: () => void;
  onGuardar: (vinculacion: ProductoVinculado) => void;
  onCancelarEdicion: () => void;
}) {
  const analisis = useMemo(() => (v.activo ? analizarVinculacion(v, input) : null), [v, input]);
  const resultadoNeto = analisis?.beneficioNeto ?? null;
  const claseResultado =
    resultadoNeto === null
      ? ''
      : resultadoNeto > 0
        ? 'bg-comodo-tenue/60'
        : resultadoNeto < 0
          ? 'bg-no-viable-tenue/60'
          : '';

  return (
    <>
      <tr className={`border-b border-linea ${claseResultado}`}>
        <td className="py-2 pr-3 text-tinta">{v.nombre}</td>
        <td className="py-2 pr-3 font-mono text-tinta-media">
          <ValorPorcentajeTabla valor={v.bonificacionTin} />
        </td>
        <td className="py-2 pr-3 font-mono text-tinta-media">{formatEuros(v.costeAnual)}</td>
        <td
          className={[
            'py-2 pr-3 font-mono font-medium',
            resultadoNeto === null
              ? 'text-tinta-suave'
              : resultadoNeto > 0
                ? 'text-comodo'
                : resultadoNeto < 0
                  ? 'text-no-viable'
                  : 'text-tinta-media',
          ].join(' ')}
        >
          {resultadoNeto === null ? '—' : formatEuros(resultadoNeto)}
        </td>
        <td className="py-2 text-right">
          <button
            type="button"
            onClick={onEditar}
            className="rounded-chico border border-linea px-2 py-1 text-xs font-semibold text-acento hover:bg-superficie"
          >
            Ver
          </button>
        </td>
      </tr>
      {editando && (
        <tr className="border-b border-linea">
          <td colSpan={5} className="p-0">
            <div className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`titulo-editar-vinculacion-${v.id}`}
                className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="rotulo mb-1">Producto vinculado</p>
                    <h2
                      id={`titulo-editar-vinculacion-${v.id}`}
                      className="font-display text-xl text-tinta"
                    >
                      {v.nombre}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onCancelarEdicion}
                    aria-label="Cerrar edición"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
                  >
                    ×
                  </button>
                </div>
                <EditarVinculacion vinculacion={v} onEliminar={onEliminar} onGuardar={onGuardar} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

function normalizarBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES');
}

function InsigniaBanco({ banco }: { readonly banco: BancoEspana }) {
  const [falloLogo, setFalloLogo] = useState(false);

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-chico px-0.5 text-[9px] font-bold leading-none text-white"
      style={{ backgroundColor: banco.color }}
      aria-hidden="true"
    >
      {falloLogo ? (
        banco.iniciales
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(banco.dominio)}&sz=64`}
          alt=""
          onError={() => setFalloLogo(true)}
          className="h-6 w-6 rounded-[3px] bg-white object-contain"
        />
      )}
    </span>
  );
}

function SelectorBanco({
  valor,
  onChange,
}: {
  readonly valor: string;
  readonly onChange: (valor: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const consulta = normalizarBusqueda(valor);
  const sugerencias = BANCOS_ESPANA.filter((banco) =>
    [banco.nombre, ...(banco.aliases ?? [])].some((texto) =>
      normalizarBusqueda(texto).includes(consulta),
    ),
  ).slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={valor}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierto(false);
        }}
        onBlur={() => window.setTimeout(() => setAbierto(false), 120)}
        placeholder="Escribe o selecciona un banco"
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-controls="sugerencias-banco"
        className="w-full rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
      />
      {abierto && sugerencias.length > 0 && (
        <ul
          id="sugerencias-banco"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-medio border border-linea bg-superficie p-1 shadow-elevado"
        >
          {sugerencias.map((banco) => (
            <li key={banco.nombre}>
              <button
                type="button"
                role="option"
                aria-selected={valor === banco.nombre}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(banco.nombre);
                  setAbierto(false);
                }}
                className="flex w-full items-center gap-2 rounded-chico px-2 py-2 text-left text-sm text-tinta hover:bg-superficie-2"
              >
                <InsigniaBanco banco={banco} />
                {banco.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Simulador() {
  const { estado, actualizarEscenarioSimulador, actualizarOfertas } = useEstado();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const { escenarioSimulador: esc } = estado;
  const ofertaId = parametros.get('oferta');
  const ofertaActiva = estado.ofertas.find((oferta) => oferta.id === ofertaId) ?? null;
  const viviendaId =
    ofertaActiva?.viviendaId ?? parametros.get('vivienda') ?? estado.viviendas[0]?.id ?? '';
  const [mostrarFichaOferta] = useState(ofertaId !== null || parametros.get('guardar') === '1');
  const [banco, setBanco] = useState(ofertaActiva?.banco ?? '');
  const [estadoOferta, setEstadoOferta] = useState<EstadoOferta>(
    ofertaActiva?.estado ?? 'pendiente',
  );
  const [fechaOferta, setFechaOferta] = useState(ofertaActiva?.fecha ?? fechaLocalISO());
  const [notasOferta, setNotasOferta] = useState(ofertaActiva?.notas ?? '');
  const [errorOferta, setErrorOferta] = useState('');
  const [plazoTexto, setPlazoTexto] = useState<string | null>(null);
  const [aniosFijosTexto, setAniosFijosTexto] = useState<string | null>(null);
  const [vinculacionEditada, setVinculacionEditada] = useState<string | null>(null);

  useEffect(() => {
    if (ofertaActiva !== null) {
      actualizarEscenarioSimulador(simulacionDesdeOferta(ofertaActiva));
    }
  }, [ofertaActiva, actualizarEscenarioSimulador]);

  function guardarComoOferta() {
    const bancoLimpio = banco.trim();
    if (viviendaId === '' || !estado.viviendas.some((vivienda) => vivienda.id === viviendaId)) {
      setErrorOferta('Selecciona una vivienda antes de guardar la hipoteca.');
      return;
    }
    if (bancoLimpio === '') {
      setErrorOferta('Indica el banco para guardar la oferta.');
      return;
    }

    const id = ofertaActiva?.id ?? crypto.randomUUID();
    const oferta: OfertaBancaria = ofertaDesdeSimulacion(esc, {
      id,
      viviendaId,
      banco: bancoLimpio,
      nombre: bancoLimpio,
      fecha: fechaOferta,
      estado: estadoOferta,
      notas: notasOferta,
    });
    const ofertas = ofertaActiva
      ? estado.ofertas.map((actual) => (actual.id === oferta.id ? oferta : actual))
      : [...estado.ofertas, oferta];

    actualizarEscenarioSimulador({ titulo: bancoLimpio });
    actualizarOfertas(ofertas);
    setErrorOferta('');
    void navegar(`/ofertas?tab=hipotecas&vivienda=${encodeURIComponent(viviendaId)}`);
  }

  function act<K extends keyof EscenarioHipoteca>(campo: K, valor: EscenarioHipoteca[K]) {
    actualizarEscenarioSimulador({ [campo]: valor });
  }

  function guardarPlazo() {
    const valor = parseInt(plazoTexto ?? '', 10);
    setPlazoTexto(null);
    if (Number.isNaN(valor)) return;

    const plazoAnios = Math.min(40, Math.max(1, valor));
    actualizarEscenarioSimulador(normalizarEscenarioHipoteca({ ...esc, plazoAnios }));
  }

  function guardarAniosFijos() {
    const valor = parseInt(aniosFijosTexto ?? '', 10);
    setAniosFijosTexto(null);
    if (Number.isNaN(valor)) return;
    act('mixtaAniosFijos', Math.min(Math.max(1, esc.plazoAnios - 1), Math.max(1, valor)));
  }

  // ---------------------------------------------------------------------------
  // Derivados financieros
  // ---------------------------------------------------------------------------

  const flujoInput = useMemo(
    // El suelo se desactiva aquí: no se muestra ni afecta al simulador independiente.
    () => flujoInputDesdeEscenario({ ...esc, sueloTin: 0 }),
    [esc],
  );
  const flujo = useMemo(() => construirFlujoDeCaja(flujoInput), [flujoInput]);

  const aniosFijos = esc.mixtaAniosFijos ?? ANIOS_FIJOS_MIXTO_POR_DEFECTO;
  const mesesFijos = Math.min(aniosFijos * 12, flujoInput.plazoMeses - 1);

  // Cuota del periodo fijo (o cuota única para fija)
  const cuotaFija: Cents = flujo[1]?.cuota ?? ZERO;

  // Para mixta: cuota estimada de la fase variable con TIN actual
  const cuotaVariable: Cents = esc.tipo === 'mixta' ? (flujo[mesesFijos + 1]?.cuota ?? ZERO) : ZERO;
  const tinVariableEstimado =
    esc.tipo === 'mixta' ? calcularTinMes(mesesFijos + 1, flujoInput, mesesFijos) : ZERO;

  // TIN efectivo (con y sin vinculaciones activas)
  const tinSinVinculaciones = calcularTinMes(1, { ...flujoInput, vinculaciones: [] }, mesesFijos);
  const tinConVinculaciones = calcularTinMes(1, flujoInput, mesesFijos);
  const hayBonificaciones = calcularBonificacionTotal(esc.vinculaciones, 1) > 0;

  // Tasación < precio: aviso obligatorio (R5)
  const tasacionInferior = esc.valorTasacion < esc.precioCompra && esc.valorTasacion > ZERO;
  const baseFinanciable = minCents(esc.precioCompra, esc.valorTasacion);
  const importeMaxLtv = multiplyCents(baseFinanciable, esc.ltv);
  const superaLtv = esc.importeSolicitado > importeMaxLtv;
  const aporteExtra = maxCents(ZERO, subtractCents(esc.importeSolicitado, importeMaxLtv));
  const aportacionActual = maxCents(ZERO, subtractCents(esc.precioCompra, esc.importeSolicitado));
  const aportacionMinima = maxCents(ZERO, subtractCents(esc.precioCompra, importeMaxLtv));

  const interesesTotales = sumCents(flujo.slice(1).map((linea) => linea.intereses));
  const taeEstimada = calcularTaeEstimada(flujo, esc.importeSolicitado, esc.vinculaciones);

  // ---------------------------------------------------------------------------
  // Comparador de plazos — §6.4 (F20)
  // ---------------------------------------------------------------------------

  const plazosDisponibles = useMemo(() => {
    const todos = [10, 15, 20, 25, 30, 35, 40, esc.plazoAnios];
    return [...new Set(todos.filter((p) => p <= esc.plazoAnios))].sort((a, b) => a - b);
  }, [esc.plazoAnios]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="rotulo">
              {ofertaActiva === null ? 'Nueva oferta bancaria' : `Oferta de ${ofertaActiva.banco}`}
            </p>
            {ofertaActiva !== null && (
              <h1 className="mt-1 font-display text-xl text-tinta">{ofertaActiva.nombre}</h1>
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              void navegar(
                viviendaId === ''
                  ? '/ofertas?tab=hipotecas'
                  : `/ofertas?tab=hipotecas&vivienda=${encodeURIComponent(viviendaId)}`,
              )
            }
            className="shrink-0 rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
          >
            ← Volver a ofertas
          </button>
        </div>
      </header>

      {mostrarFichaOferta && (
        <Panel rotulo="Oferta bancaria">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
              Banco
              <SelectorBanco valor={banco} onChange={setBanco} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 flex flex-col gap-1 text-sm font-medium text-tinta">
                Estado
                <select
                  value={estadoOferta}
                  onChange={(e) => setEstadoOferta(e.target.value as EstadoOferta)}
                  className="w-full min-w-0 rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="estudio">En estudio</option>
                  <option value="preaprobada">Preaprobada</option>
                  <option value="fein_recibida">FEIN recibida</option>
                  <option value="rechazada">Rechazada</option>
                  <option value="firmada">Firmada</option>
                </select>
              </label>
              <label className="min-w-0 flex flex-col gap-1 text-sm font-medium text-tinta">
                Fecha de la oferta
                <input
                  type="date"
                  value={fechaOferta}
                  onChange={(e) => setFechaOferta(e.target.value)}
                  className="w-full min-w-0 rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
              Notas
              <textarea
                value={notasOferta}
                onChange={(e) => setNotasOferta(e.target.value)}
                rows={3}
                placeholder="Condiciones pendientes, contacto, fecha límite…"
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </label>
          </div>
        </Panel>
      )}

      {/* ── Datos del préstamo ─────────────────────────────── */}
      <Panel rotulo="Hipoteca">
        <div className="flex flex-col gap-5">
          {/* Tipo */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Cómo se calcula el interés</span>
            <div className="flex gap-2 flex-wrap">
              {(['fija', 'variable', 'mixta'] as TipoHipoteca[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    actualizarEscenarioSimulador(normalizarEscenarioHipoteca({ ...esc, tipo: t }))
                  }
                  className={[
                    'rounded-medio border px-4 py-2 text-sm font-medium capitalize',
                    esc.tipo === t
                      ? 'border-acento bg-acento/10 text-acento'
                      : 'border-linea text-tinta hover:bg-superficie-2',
                  ].join(' ')}
                >
                  {t === 'fija' ? 'Fijo' : t === 'variable' ? 'Variable' : 'Mixto'}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-tinta-media">
              Fijo mantiene el mismo interés; variable puede cambiar; mixto empieza fijo y después
              pasa a variable.
            </p>
          </div>

          {/* Importe y precio */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <InputMoneda
              id="sim-precio"
              etiqueta="Precio de compra"
              valor={esc.precioCompra}
              onChange={(v) => {
                const valorTasacion =
                  esc.valorTasacion === esc.precioCompra ? v : esc.valorTasacion;
                actualizarEscenarioSimulador({
                  precioCompra: v,
                  valorTasacion,
                  importeSolicitado: multiplyCents(minCents(v, valorTasacion), esc.ltv),
                });
              }}
            />
            <InputMoneda
              id="sim-tasacion"
              etiqueta="Valor de tasación"
              valor={esc.valorTasacion}
              onChange={(v) =>
                actualizarEscenarioSimulador({
                  valorTasacion: v,
                  importeSolicitado: multiplyCents(minCents(esc.precioCompra, v), esc.ltv),
                })
              }
              ayuda="Valor que asigna una tasadora. El banco aplica la financiación sobre el menor valor entre el precio de compra y la tasación."
            />
            <div className="col-span-2 rounded-medio border border-linea bg-superficie-2/60 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-tinta-media">Cuánto aportarás</p>
                  <p className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                    {formatEuros(aportacionActual)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end">
                    <p className="text-xs text-tinta-media">Financiación del banco</p>
                    <InfoTooltip texto="Porcentaje aplicado sobre el precio de compra. El préstamo máximo definitivo se calcula sobre el menor valor entre el precio y la tasación." />
                  </div>
                  <p className="mt-0.5 font-cifra font-semibold tabular-nums text-acento">
                    {formatPorcentaje(esc.ltv)}
                  </p>
                </div>
              </div>
              <input
                id="sim-ltv-max"
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={esc.ltv * 100}
                onChange={(evento) => {
                  const ltv = Number(evento.target.value) / 100;
                  actualizarEscenarioSimulador({
                    ltv,
                    importeSolicitado: multiplyCents(baseFinanciable, ltv),
                  });
                }}
                aria-label="Financiación del banco"
                aria-valuetext={`${formatPorcentaje(esc.ltv)}; aportas ${formatEuros(aportacionActual)}`}
                className="mt-2 h-10 w-full cursor-pointer accent-acento"
              />
            </div>
          </div>

          {/* Plazo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 flex flex-col gap-1">
              <label htmlFor="sim-plazo" className="text-sm font-medium text-tinta">
                Plazo (años)
              </label>
              <input
                id="sim-plazo"
                type="number"
                min={1}
                max={40}
                value={plazoTexto ?? String(esc.plazoAnios)}
                onFocus={() => setPlazoTexto('')}
                onChange={(e) => setPlazoTexto(e.target.value)}
                onBlur={guardarPlazo}
                className="w-full min-w-0 rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>

            <div className="min-w-0 flex flex-col gap-1">
              <label htmlFor="sim-fecha" className="text-sm font-medium text-tinta">
                Fecha de la primera cuota
              </label>
              <input
                id="sim-fecha"
                type="date"
                value={esc.fechaPrimeraCuota}
                onChange={(e) => act('fechaPrimeraCuota', e.target.value)}
                className="w-full min-w-0 rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>
          </div>

          {/* TIN fija */}
          {esc.tipo === 'fija' && (
            <div className="grid grid-cols-2 gap-3">
              <InputPorcentaje
                id="sim-tin-fijo"
                etiqueta="TIN anual"
                valor={esc.tinFijo ?? 0.035}
                onChange={(v) => act('tinFijo', v)}
              />
              <InputPorcentaje
                id="sim-tae-oficial"
                etiqueta="TAE oferta / FEIN"
                valor={esc.taeOficial ?? 0}
                mostrarVacioSiCero
                onChange={(v) => act('taeOficial', v)}
                onVaciar={() => act('taeOficial', 0)}
                ayuda="Copia la TAE que indica el banco. Sirve para compararla con la estimación y no modifica la cuota."
              />
            </div>
          )}

          {/* Variable */}
          {(esc.tipo === 'variable' || esc.tipo === 'mixta') && (
            <div className="flex flex-col gap-4">
              {esc.tipo === 'mixta' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InputPorcentaje
                    id="sim-tin-mixto"
                    etiqueta="TIN período fijo"
                    valor={esc.mixtaTinFijo ?? TIN_FIJO_MIXTO_POR_DEFECTO}
                    onChange={(v) => act('mixtaTinFijo', v)}
                  />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="sim-anios-fijos" className="text-sm font-medium text-tinta">
                      Años del período fijo
                    </label>
                    <input
                      id="sim-anios-fijos"
                      type="number"
                      min={1}
                      max={esc.plazoAnios - 1}
                      value={
                        aniosFijosTexto ??
                        String(
                          Math.min(
                            esc.mixtaAniosFijos ?? ANIOS_FIJOS_MIXTO_POR_DEFECTO,
                            Math.max(1, esc.plazoAnios - 1),
                          ),
                        )
                      }
                      onFocus={() => setAniosFijosTexto('')}
                      onChange={(e) => setAniosFijosTexto(e.target.value)}
                      onBlur={guardarAniosFijos}
                      className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InputPorcentaje
                  id="sim-euribor"
                  etiqueta="Euríbor actual"
                  valor={esc.euribor ?? 0.035}
                  onChange={(v) => act('euribor', v)}
                  {...(esc.euriborFechaValor !== undefined
                    ? { ayuda: `Valor del ${esc.euriborFechaValor}` }
                    : {})}
                />
                <InputPorcentaje
                  id="sim-diferencial"
                  etiqueta="Diferencial"
                  valor={esc.diferencial ?? 0.01}
                  onChange={(v) => act('diferencial', v)}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-tinta">Cada cuánto se revisa</span>
                  <div className="flex gap-2">
                    {(['semestral', 'anual'] as PeriodicidadRevision[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => act('periodicidadRevision', p)}
                        className={[
                          'rounded-medio border px-3 py-2 text-sm capitalize',
                          esc.periodicidadRevision === p
                            ? 'border-acento bg-acento/10 text-acento'
                            : 'border-linea text-tinta hover:bg-superficie-2',
                        ].join(' ')}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comisión de apertura */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputPorcentaje
              id="sim-apertura"
              etiqueta="Comisión que cobra el banco al abrir"
              valor={esc.comisiones.apertura}
              onChange={(v) =>
                actualizarEscenarioSimulador({
                  comisiones: { ...esc.comisiones, apertura: v },
                })
              }
              ayuda="Porcentaje sobre el capital. Habitualmente 0–1 %."
            />
            {esc.tipo !== 'fija' && (
              <InputPorcentaje
                id="sim-tae-oficial"
                etiqueta="TAE de la oferta o FEIN (opcional)"
                valor={esc.taeOficial ?? 0}
                mostrarVacioSiCero
                onChange={(v) => act('taeOficial', v)}
                onVaciar={() => act('taeOficial', 0)}
                ayuda="Copia la TAE que indica el banco. Sirve para compararla con la estimación y no modifica la cuota."
              />
            )}
          </div>
        </div>
      </Panel>

      {/* ── Vinculaciones ──────────────────────────────────── */}
      <Panel rotulo="Productos del banco" contenidoClassName="pt-3">
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <NuevaVinculacion
              onAnadir={(v) =>
                actualizarEscenarioSimulador({
                  vinculaciones: [...esc.vinculaciones, v],
                })
              }
            />
          </div>

          {esc.vinculaciones.length === 0 ? (
            <p className="text-sm text-tinta-suave">
              Sin productos vinculados. Añade seguros, tarjetas o planes de pensiones para ver su
              impacto en el TIN y el coste real.
            </p>
          ) : (
            <TablaResponsive minWidth="0">
              <thead>
                <tr className="border-b border-linea text-left text-xs text-tinta-suave">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Desc." unidad="%" />
                  </th>
                  <th className="py-2 pr-3 font-medium">Coste anual</th>
                  <th className="py-2 pr-3 font-medium">Ahorro/Pérdida</th>
                  <th className="py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {esc.vinculaciones.map((v) => (
                  <FilaVinculacion
                    key={v.id}
                    v={v}
                    input={flujoInput}
                    editando={vinculacionEditada === v.id}
                    onEditar={() => setVinculacionEditada(v.id)}
                    onEliminar={() => {
                      setVinculacionEditada((id) => (id === v.id ? null : id));
                      actualizarEscenarioSimulador({
                        vinculaciones: esc.vinculaciones.filter((vv) => vv.id !== v.id),
                      });
                    }}
                    onCancelarEdicion={() => setVinculacionEditada(null)}
                    onGuardar={(vinculacion) => {
                      actualizarEscenarioSimulador({
                        vinculaciones: esc.vinculaciones.map((vv) =>
                          vv.id === vinculacion.id ? vinculacion : vv,
                        ),
                      });
                      setVinculacionEditada(null);
                    }}
                  />
                ))}
              </tbody>
            </TablaResponsive>
          )}
        </div>
      </Panel>

      {mostrarFichaOferta && (
        <Panel>
          <div className="flex flex-col gap-3">
            {errorOferta !== '' && <p className="text-sm text-no-viable">{errorOferta}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={guardarComoOferta}
                className="rounded-medio bg-acento px-5 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90"
              >
                {ofertaActiva === null ? 'Guardar hipoteca' : 'Actualizar hipoteca'}
              </button>
              <button
                type="button"
                onClick={() =>
                  void navegar(
                    viviendaId === ''
                      ? '/ofertas?tab=hipotecas'
                      : `/ofertas?tab=hipotecas&vivienda=${encodeURIComponent(viviendaId)}`,
                  )
                }
                className="rounded-medio border border-linea px-5 py-2.5 text-sm font-medium text-tinta hover:bg-superficie-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Resultados ─────────────────────────────────────── */}
      {!mostrarFichaOferta && (
        <Panel rotulo="Resultado" titulo="Tu hipoteca en resumen" acento>
          <div className="flex flex-col gap-4">
            {esc.plazoAnios === 1 && (
              <div className="rounded-medio border border-revisar/50 bg-revisar-tenue p-3 text-sm text-tinta">
                El plazo está configurado en <span className="font-semibold">1 año</span>, por eso
                la cuota es tan alta. En <span className="font-semibold">Plazo (años)</span> indica,
                por ejemplo, 25 y sal del campo para recalcularla.
              </div>
            )}
            {/* Aviso tasación inferior (R5) */}
            {tasacionInferior && (
              <div className="rounded-medio border border-ajustado/50 bg-ajustado/10 p-3 text-sm text-tinta">
                Como la tasación es inferior al precio, el máximo financiable configurado baja a{' '}
                <span className="font-semibold">{formatEuros(importeMaxLtv)}</span>.
              </div>
            )}
            {superaLtv && (
              <div className="rounded-medio border border-revisar/50 bg-revisar-tenue p-3 text-sm text-tinta">
                Ahora aportarías{' '}
                <span className="font-semibold">{formatEuros(aportacionActual)}</span>, pero el
                banco presta como máximo {formatEuros(importeMaxLtv)}. Necesitas aportar{' '}
                <span className="font-semibold">{formatEuros(aporteExtra)} más</span> (un total de{' '}
                {formatEuros(aportacionMinima)}).
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {esc.tipo === 'mixta' ? (
                <>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-tinta-suave">
                      Durante el período fijo pagarás
                    </span>
                    <span className="font-mono text-xl font-semibold text-tinta">
                      {formatEuros(cuotaFija)}
                      <span className="text-xs font-normal">/mes</span>
                    </span>
                    <span className="text-xs text-tinta-suave">
                      {aniosFijos} años al {formatPorcentaje(tinConVinculaciones)} efectivo
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-tinta-suave">
                      Después pagarás aproximadamente
                    </span>
                    <span className="font-mono text-xl font-semibold text-tinta">
                      {formatEuros(cuotaVariable)}
                      <span className="text-xs font-normal">/mes</span>
                    </span>
                    <span className="text-xs text-tinta-suave">
                      Euríbor {formatPorcentaje(esc.euribor ?? 0)} + diferencial{' '}
                      {formatPorcentaje(esc.diferencial ?? 0)}; TIN estimado{' '}
                      {formatPorcentaje(tinVariableEstimado)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-tinta-suave">
                    {esc.tipo === 'variable'
                      ? 'Cuota inicial hasta la próxima revisión'
                      : 'Cada mes pagarás'}
                  </span>
                  <span className="font-mono text-xl font-semibold text-tinta">
                    {formatEuros(cuotaFija)}
                    <span className="text-xs font-normal">/mes</span>
                  </span>
                  <span className="text-xs text-tinta-suave">
                    {esc.tipo === 'variable'
                      ? `con el TIN actual del ${formatPorcentaje(tinConVinculaciones)}`
                      : `durante ${esc.plazoAnios} años al ${formatPorcentaje(tinConVinculaciones)}`}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-media">El banco te presta</span>
                <span className="font-mono text-xl font-semibold text-tinta">
                  {formatEuros(esc.importeSolicitado)}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-media">Tú aportas al comprar</span>
                <span className="font-mono text-xl font-semibold text-tinta">
                  {formatEuros(aportacionActual)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-linea pt-4 sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-media">
                  {esc.tipo === 'fija'
                    ? 'Intereses durante toda la hipoteca'
                    : 'Intereses estimados si el Euríbor se mantiene'}
                </span>
                <span className="font-mono font-semibold text-tinta">
                  {formatEuros(interesesTotales)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-tinta-media">
                  {esc.tipo === 'fija'
                    ? 'TAE calculada para comparar ofertas'
                    : 'TAE estimada con el escenario actual'}
                </span>
                <span className="font-mono font-semibold text-tinta">
                  {taeEstimada > 0 ? formatPorcentaje(taeEstimada) : '—'}
                </span>
              </div>
              {esc.taeOficial !== undefined && esc.taeOficial > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-tinta-media">TAE de la oferta / FEIN</span>
                  <span className="font-mono font-semibold text-acento">
                    {formatPorcentaje(esc.taeOficial)}
                  </span>
                </div>
              )}
            </div>
            {esc.tipo !== 'fija' && (
              <p className="border-t border-linea pt-3 text-xs leading-relaxed text-tinta-media">
                Estas cifras proyectan el Euríbor indicado durante el resto del préstamo. La cuota
                se recalculará en cada revisión con el índice aplicable, el capital pendiente y el
                plazo restante.
              </p>
            )}
            {esc.taeOficial !== undefined &&
              esc.taeOficial > 0 &&
              Math.abs(esc.taeOficial - taeEstimada) >= 0.001 && (
                <p className="border-t border-linea pt-3 text-xs leading-relaxed text-tinta-media">
                  La diferencia con la TAE de la oferta suele deberse a costes obligatorios que aún
                  no has añadido al simulador, como seguros, cuenta vinculada, tasación o
                  comisiones.
                </p>
              )}

            {hayBonificaciones && (
              <div className="border-t border-linea pt-3 text-sm text-tinta-media">
                Con los productos del banco que has seleccionado, el interés baja del{' '}
                <span className="font-mono font-semibold text-tinta">
                  {formatPorcentaje(tinSinVinculaciones)}
                </span>{' '}
                al{' '}
                <span className="font-mono font-semibold text-comodo">
                  {formatPorcentaje(tinConVinculaciones)}
                </span>
                .
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ── Comparador de plazos ───────────────────────────── */}
      {!mostrarFichaOferta && (
        <>
          <Panel rotulo="Comparador" titulo="Plazos alternativos">
            <TablaResponsive minWidth="460px">
              <thead>
                <tr className="border-b border-linea text-left text-xs text-tinta-suave">
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Plazo" unidad="años" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Cuota" unidad="€" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Diferencia" unidad="€/mes" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Intereses" unidad="€" />
                  </th>
                  <th className="py-2 font-medium">
                    <EncabezadoConUnidad titulo="Diferencia" unidad="€" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {plazosDisponibles.map((plazoAnios) => {
                  const inputPlazo: FlujoInput = {
                    ...flujoInput,
                    plazoMeses: plazoAnios * 12,
                  };
                  const flujoPlazo = construirFlujoDeCaja(inputPlazo);
                  const cuota = flujoPlazo[1]?.cuota ?? ZERO;
                  const intereses = sumCents(flujoPlazo.slice(1).map((l) => l.intereses));
                  const interesesBase = sumCents(flujo.slice(1).map((l) => l.intereses));
                  const cuotaBase2 = flujo[1]?.cuota ?? ZERO;

                  return (
                    <tr
                      key={plazoAnios}
                      className={[
                        'border-b border-linea last:border-b-0',
                        plazoAnios === esc.plazoAnios ? 'bg-superficie-2 font-medium' : '',
                      ].join(' ')}
                    >
                      <td className="py-2 pr-3 text-tinta">
                        {plazoAnios}
                        <span className="hidden sm:inline"> años</span>
                        {plazoAnios === esc.plazoAnios && (
                          <span className="ml-1 text-xs text-tinta-suave">(actual)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-tinta">
                        <ValorEurosTabla valor={cuota} />
                      </td>
                      <td
                        className={`py-2 pr-3 font-mono ${subtractCents(cuota, cuotaBase2) > 0 ? 'text-no-viable' : 'text-comodo'}`}
                      >
                        {subtractCents(cuota, cuotaBase2) >= 0 ? '+' : ''}
                        <ValorEurosTabla valor={subtractCents(cuota, cuotaBase2)} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-tinta">
                        <ValorEurosTabla valor={intereses} />
                      </td>
                      <td
                        className={`py-2 font-mono ${subtractCents(intereses, interesesBase) > 0 ? 'text-no-viable' : 'text-comodo'}`}
                      >
                        {subtractCents(intereses, interesesBase) >= 0 ? '+' : ''}
                        <ValorEurosTabla valor={subtractCents(intereses, interesesBase)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaResponsive>
            <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
              Compara la misma financiación desde el inicio. En una hipoteca fija, las cifras son
              exactas con las condiciones indicadas; en una variable o mixta, estiman que el Euríbor
              actual se mantendrá.
            </p>
          </Panel>

          {/* ── Comparador de entrada adicional ───────────────── */}
          <ComparadorEntrada flujoInput={flujoInput} esc={esc} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: formulario para añadir vinculación
// ---------------------------------------------------------------------------

function NuevaVinculacion({ onAnadir }: { onAnadir: (v: ProductoVinculado) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [bonificacion, setBonificacion] = useState(0.003);
  const [costeAnual, setCosteAnual] = useState<Cents>(toCents(300));
  const [obligatorio, setObligatorio] = useState(true);
  const [aniosExigidos, setAniosExigidos] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  function confirmar() {
    if (nombre.trim() === '') return;
    onAnadir({
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      activo: true,
      bonificacionTin: bonificacion,
      costeInicial: ZERO,
      costeAnual,
      incrementoAnual: 0,
      aniosExigidos,
      obligatorio,
      observaciones: '',
    });
    setNombre('');
    setBonificacion(0.003);
    setCosteAnual(toCents(300));
    setAbierto(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
      >
        + Añadir producto bancario
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setAbierto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nueva-vinculacion"
            className="max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado sm:max-h-[90dvh]"
          >
            <p className="rotulo mb-1">Producto bancario</p>
            <h2 id="titulo-nueva-vinculacion" className="font-display text-xl text-tinta">
              Añadir producto bancario
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="vinc-nombre" className="text-sm font-medium text-tinta">
                  Nombre
                </label>
                <input
                  id="vinc-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Seguro de vida, tarjeta…"
                  autoFocus
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </div>
              <InputPorcentaje
                id="vinc-bonif"
                etiqueta="Bonificación TIN"
                valor={bonificacion}
                onChange={setBonificacion}
                ayuda="Reducción del TIN por tener este producto."
              />
              <InputMoneda
                id="vinc-coste"
                etiqueta="Coste anual"
                valor={costeAnual}
                onChange={setCosteAnual}
              />
              <div className="flex flex-col gap-1">
                <label htmlFor="vinc-anios" className="text-sm font-medium text-tinta">
                  Años exigidos (vacío = toda la hipoteca)
                </label>
                <input
                  id="vinc-anios"
                  type="number"
                  min={1}
                  value={aniosExigidos ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    setAniosExigidos(
                      e.target.value === '' ? null : parseInt(e.target.value) || null,
                    )
                  }
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                checked={obligatorio}
                onChange={(e) => setObligatorio(e.target.checked)}
                className="h-4 w-4 accent-acento"
              />
              El banco lo exige para obtener las condiciones del préstamo
            </label>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-medio border border-linea px-4 py-2.5 text-sm font-medium text-tinta hover:bg-superficie-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={nombre.trim() === ''}
                className="rounded-medio bg-acento px-4 py-2.5 text-sm font-medium text-sobre-acento disabled:opacity-50"
              >
                Añadir producto
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: formulario para editar una vinculación
// ---------------------------------------------------------------------------

function EditarVinculacion({
  vinculacion,
  onGuardar,
  onEliminar,
}: {
  vinculacion: ProductoVinculado;
  onGuardar: (vinculacion: ProductoVinculado) => void;
  onEliminar: () => void;
}) {
  const [nombre, setNombre] = useState(vinculacion.nombre);
  const [bonificacion, setBonificacion] = useState(vinculacion.bonificacionTin);
  const [costeAnual, setCosteAnual] = useState<Cents>(vinculacion.costeAnual);
  const [obligatorio, setObligatorio] = useState(vinculacion.obligatorio);
  const [activo, setActivo] = useState(vinculacion.activo);
  const [aniosExigidos, setAniosExigidos] = useState<number | null>(vinculacion.aniosExigidos);
  const idBase = `vinc-editar-${vinculacion.id}`;

  function guardar() {
    if (nombre.trim() === '') return;
    onGuardar({
      ...vinculacion,
      nombre: nombre.trim(),
      bonificacionTin: bonificacion,
      costeAnual,
      aniosExigidos,
      obligatorio,
      activo,
    });
  }

  return (
    <div className="rounded-medio border border-acento/40 bg-acento/5 p-4 flex flex-col gap-3">
      <p className="text-sm font-medium text-tinta">Editar producto vinculado</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-nombre`} className="text-sm font-medium text-tinta">
            Nombre
          </label>
          <input
            id={`${idBase}-nombre`}
            type="text"
            value={nombre}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setNombre(e.target.value)}
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </div>
        <InputPorcentaje
          id={`${idBase}-bonificacion`}
          etiqueta="Bonificación TIN"
          valor={bonificacion}
          onChange={setBonificacion}
          ayuda="Reducción del TIN por tener este producto."
        />
        <InputMoneda
          id={`${idBase}-coste`}
          etiqueta="Coste anual"
          valor={costeAnual}
          onChange={setCosteAnual}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-anios`} className="text-sm font-medium text-tinta">
            Años exigidos (vacío = toda la hipoteca)
          </label>
          <input
            id={`${idBase}-anios`}
            type="number"
            min={1}
            value={aniosExigidos ?? ''}
            placeholder="—"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              setAniosExigidos(e.target.value === '' ? null : parseInt(e.target.value, 10) || null)
            }
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-tinta cursor-pointer">
        <input
          type="checkbox"
          checked={obligatorio}
          onChange={(e) => setObligatorio(e.target.checked)}
          className="h-4 w-4 accent-acento"
        />
        El banco lo exige para obtener las condiciones del préstamo
      </label>
      <label className="flex items-center gap-2 text-sm text-tinta cursor-pointer">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-4 w-4 accent-acento"
        />
        Incluir este producto en el cálculo
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={nombre.trim() === ''}
          className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento disabled:opacity-50"
        >
          Guardar cambios
        </button>
        <button
          type="button"
          onClick={onEliminar}
          className="rounded-medio border border-no-viable/40 px-4 py-2 text-sm font-medium text-no-viable hover:bg-no-viable-tenue"
        >
          Eliminar producto
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: comparador de entrada adicional
// ---------------------------------------------------------------------------

function ComparadorEntrada({
  flujoInput,
  esc,
}: {
  flujoInput: FlujoInput;
  esc: EscenarioHipoteca;
}) {
  const extras: Cents[] = [toCents(5_000), toCents(10_000), toCents(20_000)];

  const interesesBase = sumCents(
    construirFlujoDeCaja(flujoInput)
      .slice(1)
      .map((l) => l.intereses),
  );

  const filas = extras.map((extra) => {
    const nuevoImporte = maxCents(ZERO, subtractCents(esc.importeSolicitado, extra));
    const inputNuevo: FlujoInput = { ...flujoInput, capital: nuevoImporte };
    const flujoNuevo = construirFlujoDeCaja(inputNuevo);
    const cuotaNueva = flujoNuevo[1]?.cuota ?? ZERO;
    const interesesNuevos = sumCents(flujoNuevo.slice(1).map((l) => l.intereses));
    const ahorroIntereses = subtractCents(interesesBase, interesesNuevos);

    return { extra, cuotaNueva, ahorroIntereses };
  });

  const cuotaBase = construirFlujoDeCaja(flujoInput)[1]?.cuota ?? ZERO;

  return (
    <Panel rotulo="Comparador" titulo="Entrada adicional">
      <TablaResponsive minWidth="420px">
        <thead>
          <tr className="border-b border-linea text-left text-xs text-tinta-suave">
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Entrada adicional" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Nueva cuota" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Ahorro" unidad="€/mes" />
            </th>
            <th className="py-2 font-medium">
              <EncabezadoConUnidad titulo="Intereses ahorrados" unidad="€" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-linea bg-superficie-2 font-medium">
            <td className="py-2 pr-3 text-tinta">Entrada actual</td>
            <td className="py-2 pr-3 font-mono text-tinta">
              <ValorEurosTabla valor={cuotaBase} />
            </td>
            <td className="py-2 pr-3 font-mono text-tinta-suave">—</td>
            <td className="py-2 pr-3 font-mono text-tinta-suave">—</td>
          </tr>
          {filas.map(({ extra, cuotaNueva, ahorroIntereses }) => (
            <tr key={extra} className="border-b border-linea last:border-b-0">
              <td className="py-2 pr-3 font-semibold text-tinta">
                +<ValorEurosTabla valor={extra} />
              </td>
              <td className="py-2 pr-3 font-mono text-tinta">
                <ValorEurosTabla valor={cuotaNueva} />
              </td>
              <td className="py-2 pr-3 font-mono text-comodo">
                -<ValorEurosTabla valor={subtractCents(cuotaBase, cuotaNueva)} />
              </td>
              <td className="py-2 font-mono text-comodo">
                -<ValorEurosTabla valor={ahorroIntereses} />
              </td>
            </tr>
          ))}
        </tbody>
      </TablaResponsive>
      <p className="mt-3 text-xs text-tinta-suave">
        La entrada adicional reduce el capital financiado y los intereses totales de la hipoteca.
      </p>
    </Panel>
  );
}
