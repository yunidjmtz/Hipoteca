import { useEffect, useMemo, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { useNavigate, useSearchParams } from 'react-router';
import { Panel } from '@/components/Panel';
import { InputMoneda } from '@/components/InputMoneda';
import { InputPorcentaje } from '@/components/InputPorcentaje';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
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
  onActivar,
  onEditar,
  onEliminar,
  onGuardar,
  onCancelarEdicion,
}: {
  v: ProductoVinculado;
  input: FlujoInput;
  editando: boolean;
  onActivar: (activo: boolean) => void;
  onEditar: () => void;
  onEliminar: () => void;
  onGuardar: (vinculacion: ProductoVinculado) => void;
  onCancelarEdicion: () => void;
}) {
  const analisis = useMemo(() => (v.activo ? analizarVinculacion(v, input) : null), [v, input]);

  const etiqueta =
    analisis === null
      ? '—'
      : analisis.recomendacion === 'compensa'
        ? '✓ Compensa'
        : analisis.recomendacion === 'no_compensa'
          ? '✗ No compensa'
          : '~ Indeterminado';

  const colorEtiqueta =
    analisis?.recomendacion === 'compensa'
      ? 'text-comodo'
      : analisis?.recomendacion === 'no_compensa'
        ? 'text-no-viable'
        : 'text-tinta-suave';

  return (
    <>
      <tr className="border-b border-linea">
        <td className="py-2 pr-3 text-tinta">{v.nombre}</td>
        <td className="py-2 pr-3 font-mono text-tinta-media">
          <ValorPorcentajeTabla valor={v.bonificacionTin} />
        </td>
        <td className="py-2 pr-3 font-mono text-tinta-media">
          <ValorEurosTabla valor={v.costeAnual} />
        </td>
        <td className="py-2 pr-3 font-mono text-tinta-media">
          {analisis !== null ? <ValorEurosTabla valor={analisis.beneficioNeto} /> : '—'}
        </td>
        <td className={`py-2 pr-3 text-sm font-medium ${colorEtiqueta}`}>{etiqueta}</td>
        <td className="py-2 text-right">
          <div className="flex items-center justify-end gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-tinta cursor-pointer">
              <input
                type="checkbox"
                checked={v.activo}
                onChange={(e) => onActivar(e.target.checked)}
                className="h-4 w-4 accent-acento"
                aria-label={`Activar ${v.nombre}`}
              />
              Activo
            </label>
            <button
              type="button"
              onClick={onEditar}
              className="text-acento hover:underline"
              aria-label={`Editar ${v.nombre}`}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={onEliminar}
              className="text-no-viable hover:underline"
              aria-label={`Eliminar ${v.nombre}`}
            >
              Eliminar
            </button>
          </div>
        </td>
      </tr>
      {editando && (
        <tr className="border-b border-linea">
          <td colSpan={6} className="py-3">
            <EditarVinculacion
              vinculacion={v}
              onCancelar={onCancelarEdicion}
              onGuardar={onGuardar}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function Simulador() {
  const { estado, actualizarEscenarioSimulador, actualizarOfertas } = useEstado();
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const { escenarioSimulador: esc } = estado;
  const ofertaId = parametros.get('oferta');
  const ofertaActiva = estado.ofertas.find((oferta) => oferta.id === ofertaId) ?? null;
  const [mostrarFichaOferta, setMostrarFichaOferta] = useState(
    ofertaId !== null || parametros.get('guardar') === '1',
  );
  const [banco, setBanco] = useState(ofertaActiva?.banco ?? '');
  const [nombreOferta, setNombreOferta] = useState(ofertaActiva?.nombre ?? esc.titulo ?? '');
  const [estadoOferta, setEstadoOferta] = useState<EstadoOferta>(
    ofertaActiva?.estado ?? 'pendiente',
  );
  const [fechaOferta, setFechaOferta] = useState(
    ofertaActiva?.fecha ?? new Date().toISOString().slice(0, 10),
  );
  const [notasOferta, setNotasOferta] = useState(ofertaActiva?.notas ?? '');
  const [errorOferta, setErrorOferta] = useState('');
  const [ofertaGuardada, setOfertaGuardada] = useState(false);
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
    const nombreLimpio = nombreOferta.trim();
    if (bancoLimpio === '' || nombreLimpio === '') {
      setErrorOferta('Indica el banco y un nombre para guardar la oferta.');
      return;
    }

    const id = ofertaActiva?.id ?? crypto.randomUUID();
    const oferta: OfertaBancaria = ofertaDesdeSimulacion(esc, {
      id,
      banco: bancoLimpio,
      nombre: nombreLimpio,
      fecha: fechaOferta,
      estado: estadoOferta,
      notas: notasOferta,
    });
    const ofertas = ofertaActiva
      ? estado.ofertas.map((actual) => (actual.id === oferta.id ? oferta : actual))
      : [...estado.ofertas, oferta];

    actualizarEscenarioSimulador({ titulo: nombreLimpio });
    actualizarOfertas(ofertas);
    setErrorOferta('');
    setOfertaGuardada(true);
    setParametros({ oferta: id }, { replace: true });
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="rotulo mb-1">
              {ofertaActiva === null ? 'Simulador hipotecario' : `Oferta de ${ofertaActiva.banco}`}
            </p>
            <h1 className="font-display text-2xl text-tinta">
              {ofertaActiva === null ? '¿Cómo quedaría tu hipoteca?' : ofertaActiva.nombre}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {ofertaActiva !== null && (
              <button
                type="button"
                onClick={() => void navegar('/ofertas')}
                className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
              >
                Volver a ofertas
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMostrarFichaOferta((visible) => !visible);
                setOfertaGuardada(false);
              }}
              className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
            >
              {ofertaActiva === null ? 'Guardar como oferta' : 'Datos de la oferta'}
            </button>
          </div>
        </div>
      </header>

      {mostrarFichaOferta && (
        <Panel
          rotulo="Oferta bancaria"
          titulo={ofertaActiva === null ? 'Guardar esta simulación' : 'Datos de la oferta'}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-tinta-media">
              La oferta guardará exactamente las condiciones que estás simulando. Si después las
              cambias, vuelve a guardar para actualizar la comparativa.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
                Banco
                <input
                  type="text"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                  placeholder="Nombre del banco"
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
                Nombre de la oferta
                <input
                  type="text"
                  value={nombreOferta}
                  onChange={(e) => setNombreOferta(e.target.value)}
                  placeholder="Ej. Hipoteca fija 3 %"
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
                Estado
                <select
                  value={estadoOferta}
                  onChange={(e) => setEstadoOferta(e.target.value as EstadoOferta)}
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="estudio">En estudio</option>
                  <option value="preaprobada">Preaprobada</option>
                  <option value="fein_recibida">FEIN recibida</option>
                  <option value="rechazada">Rechazada</option>
                  <option value="firmada">Firmada</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
                Fecha de la oferta
                <input
                  type="date"
                  value={fechaOferta}
                  onChange={(e) => setFechaOferta(e.target.value)}
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
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
            {errorOferta !== '' && <p className="text-sm text-no-viable">{errorOferta}</p>}
            {ofertaGuardada && (
              <p className="text-sm font-medium text-comodo">
                Oferta guardada. Ya aparece en la comparativa.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={guardarComoOferta}
                className="rounded-medio bg-acento px-5 py-2 text-sm font-medium text-white hover:bg-acento/90"
              >
                {ofertaActiva === null ? 'Guardar oferta' : 'Actualizar oferta'}
              </button>
              <button
                type="button"
                onClick={() => void navegar('/ofertas')}
                className="rounded-medio border border-linea px-5 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
              >
                Ver comparativa
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Datos del préstamo ─────────────────────────────── */}
      <Panel rotulo="Hipoteca" titulo="Datos principales">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InputMoneda
              id="sim-precio"
              etiqueta="Precio de compra"
              valor={esc.precioCompra}
              vaciarAlEnfocar
              onChange={(v) => {
                act('precioCompra', v);
                if (esc.valorTasacion === esc.precioCompra) act('valorTasacion', v);
              }}
            />
            <InputMoneda
              id="sim-importe"
              etiqueta="Cuánto aportarás"
              valor={maxCents(ZERO, subtractCents(esc.precioCompra, esc.importeSolicitado))}
              vaciarAlEnfocar
              onChange={(aporte) =>
                act('importeSolicitado', maxCents(ZERO, subtractCents(esc.precioCompra, aporte)))
              }
            />
            <InputPorcentaje
              id="sim-ltv-max"
              etiqueta="Financiación del Banco"
              valor={esc.ltv}
              onChange={(ltv) => act('ltv', ltv)}
              ayuda="Porcentaje máximo aplicado sobre el menor valor entre precio y tasación."
            />
            <InputMoneda
              id="sim-tasacion"
              etiqueta="Tasación de la vivienda"
              valor={esc.valorTasacion}
              vaciarAlEnfocar
              onChange={(v) => act('valorTasacion', v)}
              ayuda="Valor que asigna una tasadora. Si es inferior al precio, el banco suele prestar menos."
            />
          </div>

          {/* Plazo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
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
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="sim-fecha" className="text-sm font-medium text-tinta">
                Fecha de la primera cuota
              </label>
              <input
                id="sim-fecha"
                type="date"
                value={esc.fechaPrimeraCuota}
                onChange={(e) => act('fechaPrimeraCuota', e.target.value)}
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>
          </div>

          {/* TIN fija */}
          {esc.tipo === 'fija' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputPorcentaje
                id="sim-tin-fijo"
                etiqueta="TIN anual"
                valor={esc.tinFijo ?? 0.035}
                onChange={(v) => act('tinFijo', v)}
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
            <InputPorcentaje
              id="sim-tae-oficial"
              etiqueta="TAE de la oferta o FEIN (opcional)"
              valor={esc.taeOficial ?? 0}
              mostrarVacioSiCero
              onChange={(v) => act('taeOficial', v)}
              onVaciar={() => act('taeOficial', 0)}
              ayuda="Copia la TAE que indica el banco. Sirve para compararla con la estimación y no modifica la cuota."
            />
          </div>
        </div>
      </Panel>

      {/* ── Vinculaciones ──────────────────────────────────── */}
      <Panel rotulo="Productos del banco" titulo="¿Merecen la pena los seguros y otros productos?">
        <div className="flex flex-col gap-4">
          <NuevaVinculacion
            onAnadir={(v) =>
              actualizarEscenarioSimulador({
                vinculaciones: [...esc.vinculaciones, v],
              })
            }
          />

          {esc.vinculaciones.length === 0 ? (
            <p className="text-sm text-tinta-suave">
              Sin productos vinculados. Añade seguros, tarjetas o planes de pensiones para ver su
              impacto en el TIN y el coste real.
            </p>
          ) : (
            <TablaResponsive minWidth="500px">
              <thead>
                <tr className="border-b border-linea text-left text-xs text-tinta-suave">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Descuento" unidad="%" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Coste anual" unidad="€/año" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <EncabezadoConUnidad titulo="Ahorro neto" unidad="€" />
                  </th>
                  <th className="py-2 font-medium">¿Interesa?</th>
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
                    onActivar={(activo) =>
                      actualizarEscenarioSimulador({
                        vinculaciones: esc.vinculaciones.map((vv) =>
                          vv.id === v.id ? { ...vv, activo } : vv,
                        ),
                      })
                    }
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

      {/* ── Resultados ─────────────────────────────────────── */}
      <Panel rotulo="Resultado" titulo="Tu hipoteca en resumen" acento>
        <div className="flex flex-col gap-4">
          {esc.plazoAnios === 1 && (
            <div className="rounded-medio border border-revisar/50 bg-revisar-tenue p-3 text-sm text-tinta">
              El plazo está configurado en <span className="font-semibold">1 año</span>, por eso la
              cuota es tan alta. En <span className="font-semibold">Plazo (años)</span> indica, por
              ejemplo, 25 y sal del campo para recalcularla.
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
              <span className="font-semibold">{formatEuros(aportacionActual)}</span>, pero el banco
              presta como máximo {formatEuros(importeMaxLtv)}. Necesitas aportar{' '}
              <span className="font-semibold">{formatEuros(aporteExtra)} más</span> (un total de{' '}
              {formatEuros(aportacionMinima)}).
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {esc.tipo === 'mixta' ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-tinta-suave">Durante el período fijo pagarás</span>
                  <span className="font-mono text-xl font-semibold text-tinta">
                    {formatEuros(cuotaFija)}
                    <span className="text-xs font-normal">/mes</span>
                  </span>
                  <span className="text-xs text-tinta-suave">
                    {aniosFijos} años al {formatPorcentaje(tinConVinculaciones)} efectivo
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-tinta-suave">Después pagarás aproximadamente</span>
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
              Estas cifras proyectan el Euríbor indicado durante el resto del préstamo. La cuota se
              recalculará en cada revisión con el índice aplicable, el capital pendiente y el plazo
              restante.
            </p>
          )}
          {esc.taeOficial !== undefined &&
            esc.taeOficial > 0 &&
            Math.abs(esc.taeOficial - taeEstimada) >= 0.001 && (
              <p className="border-t border-linea pt-3 text-xs leading-relaxed text-tinta-media">
                La diferencia con la TAE de la oferta suele deberse a costes obligatorios que aún no
                has añadido al simulador, como seguros, cuenta vinculada, tasación o comisiones.
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

      {/* ── Comparador de plazos ───────────────────────────── */}
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

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded-medio border border-dashed border-linea py-2 text-sm text-tinta-suave hover:border-acento hover:text-acento"
      >
        + Añadir producto vinculado
      </button>
    );
  }

  return (
    <div className="rounded-medio border border-linea bg-superficie p-4 flex flex-col gap-3">
      <p className="text-sm font-medium text-tinta">Nuevo producto vinculado</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          vaciarAlEnfocar
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
              setAniosExigidos(e.target.value === '' ? null : parseInt(e.target.value) || null)
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirmar}
          disabled={nombre.trim() === ''}
          className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Añadir
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-medio border border-linea px-4 py-2 text-sm text-tinta hover:bg-superficie-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: formulario para editar una vinculación
// ---------------------------------------------------------------------------

function EditarVinculacion({
  vinculacion,
  onGuardar,
  onCancelar,
}: {
  vinculacion: ProductoVinculado;
  onGuardar: (vinculacion: ProductoVinculado) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(vinculacion.nombre);
  const [bonificacion, setBonificacion] = useState(vinculacion.bonificacionTin);
  const [costeAnual, setCosteAnual] = useState<Cents>(vinculacion.costeAnual);
  const [obligatorio, setObligatorio] = useState(vinculacion.obligatorio);
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
          vaciarAlEnfocar
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={nombre.trim() === ''}
          className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar cambios
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-medio border border-linea px-4 py-2 text-sm text-tinta hover:bg-superficie-2"
        >
          Cancelar
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
