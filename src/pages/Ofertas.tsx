import { Fragment, useMemo, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { useNavigate } from 'react-router';
import { Panel } from '@/components/Panel';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
import { formatEuros } from '@/core/format';
import { subtractCents } from '@/core/money';
import { simulacionDesdeOferta } from '@/domain/mortgageOffer';
import {
  compararOfertas,
  PESOS_POR_DEFECTO,
  type PesosComparacion,
  type ResultadoComparacion,
} from '@/finance/offers';
import type { EstadoOferta, OfertaBancaria } from '@/domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ETIQUETAS_ESTADO: Record<EstadoOferta, string> = {
  pendiente: 'Pendiente',
  estudio: 'En estudio',
  preaprobada: 'Preaprobada',
  fein_recibida: 'FEIN recibida',
  rechazada: 'Rechazada',
  firmada: 'Firmada',
};

const CLASES_ESTADO: Record<EstadoOferta, string> = {
  pendiente: 'bg-superficie-2 text-tinta-suave border-linea',
  estudio: 'bg-ajustado-tenue text-ajustado border-ajustado/35',
  preaprobada: 'bg-comodo-tenue text-comodo border-comodo/35',
  fein_recibida: 'bg-comodo-tenue text-comodo border-comodo/35',
  rechazada: 'bg-no-viable-tenue text-no-viable border-no-viable/35',
  firmada: 'bg-acento/10 text-acento border-acento/35',
};

function BadgeEstadoOferta({ estado }: { readonly estado: EstadoOferta }) {
  return (
    <span
      className={`inline-flex items-center rounded-chico border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${CLASES_ESTADO[estado]}`}
    >
      {ETIQUETAS_ESTADO[estado]}
    </span>
  );
}

function BadgeMejor({ texto }: { readonly texto: string }) {
  return (
    <span className="inline-flex items-center rounded-chico border border-acento/35 bg-acento/10 px-1.5 py-0.5 text-[10px] font-semibold text-acento whitespace-nowrap">
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recomendación principal
// ---------------------------------------------------------------------------

interface PropsRecomendacion {
  readonly comparacion: readonly ResultadoComparacion[];
  readonly puntuacionActiva: boolean;
}

function Recomendacion({ comparacion, puntuacionActiva }: PropsRecomendacion) {
  const mejor = comparacion[0];

  if (mejor === undefined) return null;

  const importeDistinto = new Set(
    comparacion.map((resultado) => resultado.oferta.escenario.importeSolicitado),
  ).size > 1;
  const plazoDistinto = new Set(
    comparacion.map((resultado) => resultado.oferta.escenario.plazoAnios),
  ).size > 1;

  const razones = [
    mejor.esLaMenorCosteReal && 'menor coste total',
    mejor.esLaMenorCuota && 'cuota inicial más baja',
    mejor.esMenorDesembolso && 'menor desembolso inicial',
    mejor.esMenosVinculaciones && 'menos vinculaciones obligatorias',
  ].filter((razon): razon is string => Boolean(razon));

  const siguientePorCoste = comparacion
    .filter((resultado) => resultado.oferta.id !== mejor.oferta.id)
    .sort((a, b) => a.metricas.costeRealTotal - b.metricas.costeRealTotal)[0];
  const ahorroFrenteAlternativa =
    mejor.esLaMenorCosteReal && siguientePorCoste !== undefined
      ? subtractCents(siguientePorCoste.metricas.costeRealTotal, mejor.metricas.costeRealTotal)
      : null;

  return (
    <Panel rotulo="Recomendación" titulo="La hipoteca que mejor te sale ahora" acento>
      {comparacion.length === 1 ? (
        <div className="flex flex-col gap-2 text-sm text-tinta-media">
          <p>
            <span className="font-semibold text-tinta">
              {mejor.oferta.banco} · {mejor.oferta.nombre}
            </span>{' '}
            es la única hipoteca guardada por ahora.
          </p>
          <p>Guarda al menos una alternativa para saber cuál te conviene más.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium text-tinta">
                  {mejor.oferta.banco} · {mejor.oferta.nombre}
                </h3>
                <BadgeMejor texto="Mejor opción" />
              </div>
              <p className="mt-1 text-sm text-tinta-media">
                {puntuacionActiva
                  ? razones.length > 0
                    ? `Destaca por ${razones.join(', ')}.`
                    : 'Es la que ofrece el mejor equilibrio con tus prioridades actuales.'
                  : 'Está primera con los criterios actuales. Activa la puntuación para ver el resultado y ajustar los pesos.'}
              </p>
            </div>
            {puntuacionActiva && (
              <p className="text-sm text-tinta-media">
                Resultado comparativo{' '}
                <span className="font-mono font-semibold text-tinta">
                  {Math.round(mejor.puntuacion)} / 100
                </span>
              </p>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-3 border-t border-linea pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-tinta-suave">Coste total estimado</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold text-tinta">
                {formatEuros(mejor.metricas.costeRealTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-tinta-suave">Cuota inicial</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold text-tinta">
                {formatEuros(mejor.metricas.cuotaInicial)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-tinta-suave">Desembolso inicial</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold text-tinta">
                {formatEuros(mejor.metricas.desembolsoInicial)}
              </dd>
            </div>
          </dl>

          {ahorroFrenteAlternativa !== null && ahorroFrenteAlternativa > 0 && (
            <p className="rounded-medio bg-acento/10 px-3 py-2 text-sm text-tinta">
              Frente a la siguiente alternativa más barata, el coste estimado es{' '}
              <span className="font-mono font-semibold">{formatEuros(ahorroFrenteAlternativa)}</span>{' '}
              menor durante toda la hipoteca.
            </p>
          )}

          {(importeDistinto || plazoDistinto) && (
            <p className="text-xs leading-relaxed text-tinta-suave">
              Atención: las ofertas no tienen exactamente el mismo{' '}
              {importeDistinto && plazoDistinto ? 'importe ni plazo' : importeDistinto ? 'importe' : 'plazo'}.
              La recomendación es orientativa; iguala ambos datos en el simulador para una comparación directa.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Configuración de pesos
// ---------------------------------------------------------------------------

interface PropsPesos {
  readonly pesos: PesosComparacion;
  readonly onCambio: (p: PesosComparacion) => void;
}

function PanelPesos({ pesos, onCambio }: PropsPesos) {
  function actPeso(campo: keyof PesosComparacion, valor: number) {
    onCambio({ ...pesos, [campo]: valor / 100 });
  }

  const dimensiones: { campo: keyof PesosComparacion; etiqueta: string }[] = [
    { campo: 'costeReal', etiqueta: 'Coste real total' },
    { campo: 'cuota', etiqueta: 'Cuota inicial' },
    { campo: 'desembolsoInicial', etiqueta: 'Desembolso inicial' },
    { campo: 'flexibilidad', etiqueta: 'Flexibilidad' },
    { campo: 'vinculaciones', etiqueta: 'Vinculaciones' },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      {dimensiones.map(({ campo, etiqueta }) => (
        <div key={campo} className="flex flex-col gap-1">
          <label htmlFor={`peso-${campo}`} className="text-xs text-tinta-suave">
            {etiqueta}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`peso-${campo}`}
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(pesos[campo] * 100)}
              onChange={(e) => {
                actPeso(campo, parseInt(e.target.value, 10));
              }}
              className="w-full"
            />
            <span className="w-9 text-right text-xs font-mono text-tinta">
              {Math.round(pesos[campo] * 100)} %
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla de comparación
// ---------------------------------------------------------------------------

interface PropsTabla {
  readonly comparacion: ResultadoComparacion[];
  readonly puntuacionActiva: boolean;
  readonly onEditar: (o: OfertaBancaria) => void;
  readonly onEliminar: (id: string) => void;
}

function TablaComparacion({ comparacion, puntuacionActiva, onEditar, onEliminar }: PropsTabla) {
  const [expandida, setExpandida] = useState<string | null>(null);

  return (
    <Panel rotulo="Hipotecas guardadas" titulo="Comparación detallada">
      <TablaResponsive minWidth="740px">
        <thead>
          <tr className="border-b border-linea text-left text-xs text-tinta-suave">
            <th className="py-2 pr-3 font-medium">Banco / Oferta</th>
            <th className="py-2 pr-3 font-medium">Estado</th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Cuota inicial" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="TAE oficial" unidad="%" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="TAE estimada" unidad="%" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Coste total" unidad="€" />
            </th>
            <th className="py-2 pr-3 font-medium">
              <EncabezadoConUnidad titulo="Desembolso" unidad="€" />
            </th>
            {puntuacionActiva && <th className="py-2 pr-3 font-medium">Puntuación</th>}
            <th className="py-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {comparacion.map((r) => (
            <Fragment key={r.oferta.id}>
              <tr
                className={[
                  'border-b border-linea hover:bg-superficie-2 cursor-pointer',
                  r.esMejorGlobal ? 'bg-acento/5' : '',
                ].join(' ')}
                onClick={() => {
                  setExpandida(expandida === r.oferta.id ? null : r.oferta.id);
                }}
              >
                <td className="py-2.5 pr-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-tinta text-sm">{r.oferta.banco}</span>
                    <span className="text-xs text-tinta-suave">{r.oferta.nombre}</span>
                    {r.esMejorGlobal && (
                      <span className="mt-0.5">
                        <BadgeMejor texto="★ Mejor oferta" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <BadgeEstadoOferta estado={r.oferta.estado} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-sm text-tinta">
                  <div className="flex flex-col gap-0.5">
                    <ValorEurosTabla valor={r.metricas.cuotaInicial} />
                    {r.esLaMenorCuota && <BadgeMejor texto="↓ menor" />}
                  </div>
                </td>
                <td className="py-2.5 pr-3 font-mono text-sm text-tinta-media">
                  <div className="flex flex-col gap-0.5">
                    {r.oferta.taeOficial !== undefined ? (
                      <ValorPorcentajeTabla valor={r.oferta.taeOficial} />
                    ) : (
                      <span className="text-tinta-suave">—</span>
                    )}
                    {r.esLaMenorTaeOficial && <BadgeMejor texto="↓ menor" />}
                  </div>
                </td>
                <td className="py-2.5 pr-3 font-mono text-sm text-tinta-media">
                  <div className="flex flex-col gap-0.5">
                    {r.metricas.taeEstimada > 0 ? (
                      <ValorPorcentajeTabla valor={r.metricas.taeEstimada} />
                    ) : (
                      <span className="text-tinta-suave">—</span>
                    )}
                    {r.esLaMenorTaeEstimada && r.metricas.taeEstimada > 0 && (
                      <BadgeMejor texto="↓ menor" />
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-3 font-mono text-sm text-tinta">
                  <div className="flex flex-col gap-0.5">
                    <ValorEurosTabla valor={r.metricas.costeRealTotal} />
                    {r.esLaMenorCosteReal && <BadgeMejor texto="↓ menor" />}
                  </div>
                </td>
                <td className="py-2.5 pr-3 font-mono text-sm text-tinta-media">
                  <div className="flex flex-col gap-0.5">
                    <ValorEurosTabla valor={r.metricas.desembolsoInicial} />
                    {r.esMenorDesembolso && <BadgeMejor texto="↓ menor" />}
                  </div>
                </td>
                {puntuacionActiva && (
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-linea overflow-hidden">
                        <div
                          className="h-full rounded-full bg-acento"
                          style={{ width: `${Math.round(r.puntuacion)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-tinta">
                        {Math.round(r.puntuacion)}
                      </span>
                    </div>
                  </td>
                )}
                <td className="py-2.5">
                  <div
                    className="flex gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onEditar(r.oferta);
                      }}
                      className="text-xs font-semibold text-acento hover:underline"
                    >
                      Abrir en simulador
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onEliminar(r.oferta.id);
                      }}
                      className="text-xs text-no-viable hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>

              {/* Fila de detalle expandible */}
              {expandida === r.oferta.id && (
                <tr
                  className="border-b border-linea bg-superficie-2"
                >
                  <td colSpan={puntuacionActiva ? 9 : 8} className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                      <div>
                        <span className="text-tinta-suave">Tipo</span>
                        <p className="font-medium text-tinta capitalize">
                          {r.oferta.escenario.tipo}
                        </p>
                      </div>
                      <div>
                        <span className="text-tinta-suave">Importe (€)</span>
                        <p className="font-mono text-tinta">
                          <ValorEurosTabla valor={r.oferta.escenario.importeSolicitado} />
                        </p>
                      </div>
                      <div>
                        <span className="text-tinta-suave">Plazo (años)</span>
                        <p className="font-mono text-tinta">
                          {r.oferta.escenario.plazoAnios}
                          <span className="hidden sm:inline"> años</span>
                        </p>
                      </div>
                      {r.metricas.cuotaPostFija !== null && (
                        <div>
                          <span className="text-tinta-suave">Cuota variable (€)</span>
                          <p className="font-mono text-tinta">
                            <ValorEurosTabla valor={r.metricas.cuotaPostFija} />
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-tinta-suave">Vinculaciones obligatorias</span>
                        <p className="font-mono text-tinta">
                          {r.metricas.numVinculacionesObligatorias}
                        </p>
                      </div>
                      <div>
                        <span className="text-tinta-suave">Flexibilidad</span>
                        <p className="font-mono text-tinta">
                          {Math.round(r.metricas.indiceFlexibilidad)} / 100
                        </p>
                      </div>
                      {r.oferta.notas !== '' && (
                        <div className="col-span-2">
                          <span className="text-tinta-suave">Notas</span>
                          <p className="text-tinta">{r.oferta.notas}</p>
                        </div>
                      )}
                      {/* Desglose de puntuación */}
                      {puntuacionActiva && (
                        <div className="col-span-2 sm:col-span-4">
                          <span className="text-tinta-suave block mb-1">
                            Desglose de puntuación
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                ['costeReal', 'Coste real'],
                                ['cuota', 'Cuota'],
                                ['desembolsoInicial', 'Desembolso'],
                                ['flexibilidad', 'Flexibilidad'],
                                ['vinculaciones', 'Vinculaciones'],
                              ] as [keyof PesosComparacion, string][]
                            ).map(([k, etiq]) => (
                              <span key={k} className="text-xs font-mono text-tinta-media">
                                {etiq}: {Math.round(r.desglosePuntuacion[k])}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </TablaResponsive>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function Ofertas() {
  const { estado, actualizarOfertas, actualizarEscenarioSimulador } = useEstado();
  const navegar = useNavigate();

  const [puntuacionActiva, setPuntuacionActiva] = useState(true);
  const [pesos, setPesos] = useState<PesosComparacion>(PESOS_POR_DEFECTO);
  const [mostrarConfigPesos, setMostrarConfigPesos] = useState(false);

  const comparacion = useMemo(
    () => compararOfertas(estado.ofertas, pesos),
    [estado.ofertas, pesos],
  );

  function abrirNueva() {
    void navegar('/simulador?guardar=1');
  }

  function abrirEditar(oferta: OfertaBancaria) {
    actualizarEscenarioSimulador(simulacionDesdeOferta(oferta));
    void navegar(`/simulador?oferta=${encodeURIComponent(oferta.id)}`);
  }

  function eliminarOferta(id: string) {
    actualizarOfertas(estado.ofertas.filter((o) => o.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="rotulo mb-1">Paso 4</p>
        <h1 className="font-display text-2xl text-tinta">Compara ofertas bancarias</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
          Guarda las hipotecas que te ofrezcan los bancos. Aquí verás cuál te sale mejor según su
          coste total, cuota, desembolso, comisiones y productos vinculados.
        </p>
      </header>

      {/* Cabecera */}
      <Panel rotulo="Comparador" titulo="Tus hipotecas guardadas">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-tinta-media">
            {estado.ofertas.length === 0
              ? 'Guarda las propuestas de los bancos para descubrir cuál te conviene más.'
              : `${estado.ofertas.length} hipoteca${estado.ofertas.length !== 1 ? 's' : ''} guardada${estado.ofertas.length !== 1 ? 's' : ''}.`}
          </p>
          <button
            type="button"
            onClick={abrirNueva}
            className="self-start rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90 sm:self-auto"
          >
            {estado.ofertas.length === 0 ? '+ Guardar primera hipoteca' : '+ Guardar otra hipoteca'}
          </button>
        </div>
      </Panel>

      {estado.ofertas.length > 0 && (
        <>
          <Recomendacion comparacion={comparacion} puntuacionActiva={puntuacionActiva} />

          {/* Controles de puntuación */}
          <Panel rotulo="Cómo se decide" titulo="Personaliza la recomendación">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={puntuacionActiva}
                  onClick={() => {
                    setPuntuacionActiva((v) => !v);
                  }}
                  className={[
                    'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors',
                    puntuacionActiva ? 'bg-acento' : 'bg-linea',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                      puntuacionActiva ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
                <span className="text-sm text-tinta">
                  {puntuacionActiva
                    ? 'Recomendación automática activada'
                    : 'Solo cifras (puntuación oculta)'}
                </span>
                {puntuacionActiva && (
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarConfigPesos((v) => !v);
                    }}
                    className="ml-2 text-xs text-acento hover:underline"
                  >
                    {mostrarConfigPesos ? 'Ocultar pesos' : 'Configurar pesos'}
                  </button>
                )}
              </div>
              {puntuacionActiva && mostrarConfigPesos && (
                <div className="border-t border-linea pt-4">
                  <p className="mb-3 text-xs text-tinta-suave">
                    Ajusta la importancia de cada dimensión. El desglose es siempre visible en cada
                    hipoteca. El coste total es el criterio principal por defecto.
                  </p>
                  <PanelPesos pesos={pesos} onCambio={setPesos} />
                  <button
                    type="button"
                    onClick={() => {
                      setPesos(PESOS_POR_DEFECTO);
                    }}
                    className="mt-3 text-xs text-acento hover:underline"
                  >
                    Restaurar pesos por defecto
                  </button>
                </div>
              )}
            </div>
          </Panel>

          {/* Tabla de comparación */}
          <TablaComparacion
            comparacion={comparacion}
            puntuacionActiva={puntuacionActiva}
            onEditar={abrirEditar}
            onEliminar={eliminarOferta}
          />
        </>
      )}
    </div>
  );
}
