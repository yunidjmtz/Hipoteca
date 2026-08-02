import { Fragment, useMemo, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { useNavigate, useSearchParams } from 'react-router';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { Panel } from '@/components/Panel';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
import { fechaLocalISO } from '@/core/dates';
import { formatEntero, formatEuros } from '@/core/format';
import { addCents, maxCents, subtractCents, sumCents, toCents, ZERO } from '@/core/money';
import { simulacionDesdeOferta } from '@/domain/mortgageOffer';
import {
  compararOfertas,
  PESOS_POR_DEFECTO,
  sonOfertasComparables,
  type PesosComparacion,
  type ResultadoComparacion,
} from '@/finance/offers';
import { calcularTinMes, construirFlujoDeCaja } from '@/finance/mortgage';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import { ANIOS_FIJOS_MIXTO_POR_DEFECTO } from '@/domain/mortgageScenario';
import {
  compararViviendas,
  PESOS_VIVIENDA,
  type ResultadoComparacionVivienda,
} from '@/finance/housingComparison';
import type {
  Cents,
  EscenarioHipoteca,
  EstadoOferta,
  OfertaBancaria,
  PartidaReforma,
  ViviendaGuardada,
} from '@/domain/types';

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

const ETIQUETAS_TIPO_HIPOTECA: Record<EscenarioHipoteca['tipo'], string> = {
  fija: 'Fija',
  variable: 'Variable',
  mixta: 'Mixta',
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
  readonly onConfigurar: () => void;
}

function Recomendacion({ comparacion, puntuacionActiva, onConfigurar }: PropsRecomendacion) {
  const mejor = comparacion[0];

  if (mejor === undefined) return null;

  return (
    <section className="relative overflow-hidden rounded-grande border border-acento/35 bg-superficie shadow-papel">
      <div className="absolute inset-y-0 left-0 w-1 bg-acento" aria-hidden="true" />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo mb-1 text-acento">
              {comparacion.length > 1 ? 'Mejor hipoteca' : 'Análisis provisional'}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-xl leading-tight text-tinta">
                {mejor.oferta.banco}
              </h2>
              {puntuacionActiva && (
                <span className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento">
                  {Math.round(mejor.puntuacion)}/100
                  <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-tinta-media">
              {comparacion.length > 1
                ? 'La recomendación se actualiza con tus prioridades.'
                : 'Añade otra oferta para confirmar la recomendación.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onConfigurar}
              className="rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
            >
              Ajustar
            </button>
            {comparacion.length > 1 && <BadgeMejor texto="Mejor opción" />}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-medio bg-superficie-2 px-3 py-2.5">
            <dt className="text-xs text-tinta-suave">Coste total estimado</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(mejor.metricas.costeRealTotal)}
            </dd>
          </div>
          <div className="rounded-medio bg-superficie-2 px-3 py-2.5">
            <dt className="text-xs text-tinta-suave">Cuota inicial</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(mejor.metricas.cuotaInicial)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
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
    { campo: 'desembolsoInicial', etiqueta: 'Aportación y costes iniciales' },
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

export function TablaComparacion({
  comparacion,
  puntuacionActiva,
  onEditar,
  onEliminar,
}: PropsTabla) {
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
              <EncabezadoConUnidad titulo="Aportación + costes iniciales" unidad="€" />
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
                      Editar oferta
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
                <tr className="border-b border-linea bg-superficie-2">
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
                                ['desembolsoInicial', 'Inicial'],
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

function DetallesAvanzadosHipoteca({ escenario }: { readonly escenario: EscenarioHipoteca }) {
  const flujoInput = flujoInputDesdeEscenario({ ...escenario, sueloTin: 0 });
  const flujoBase = construirFlujoDeCaja(flujoInput);
  const cuotaBase = flujoBase[1]?.cuota ?? ZERO;
  const interesesBase = sumCents(flujoBase.slice(1).map((linea) => linea.intereses));
  const plazos = [...new Set([10, 15, 20, 25, 30, 35, 40, escenario.plazoAnios])]
    .filter((plazo) => plazo <= escenario.plazoAnios)
    .sort((a, b) => a - b);
  const entradasAdicionales = [toCents(5_000), toCents(10_000), toCents(20_000)];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-medio border border-linea p-4">
        <p className="rotulo mb-1">Comparador</p>
        <h3 className="font-display text-lg text-tinta">Plazos alternativos</h3>
        <TablaResponsive minWidth="520px" className="mt-4">
          <thead>
            <tr className="border-b border-linea text-left text-xs text-tinta-suave">
              <th className="py-2 pr-3 font-medium">Plazo</th>
              <th className="py-2 pr-3 font-medium">Cuota</th>
              <th className="py-2 pr-3 font-medium">Diferencia /mes</th>
              <th className="py-2 pr-3 font-medium">Intereses</th>
              <th className="py-2 font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {plazos.map((plazoAnios) => {
              const flujoPlazo = construirFlujoDeCaja({
                ...flujoInput,
                plazoMeses: plazoAnios * 12,
              });
              const cuota = flujoPlazo[1]?.cuota ?? ZERO;
              const intereses = sumCents(flujoPlazo.slice(1).map((linea) => linea.intereses));
              const diferenciaCuota = subtractCents(cuota, cuotaBase);
              const diferenciaIntereses = subtractCents(intereses, interesesBase);

              return (
                <tr
                  key={plazoAnios}
                  className={[
                    'border-b border-linea last:border-b-0',
                    plazoAnios === escenario.plazoAnios ? 'bg-superficie-2 font-medium' : '',
                  ].join(' ')}
                >
                  <td className="py-2 pr-3 text-tinta">
                    {plazoAnios} años
                    {plazoAnios === escenario.plazoAnios && (
                      <span className="ml-1 text-xs text-tinta-suave">(actual)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-cifra text-tinta">
                    <ValorEurosTabla valor={cuota} />
                  </td>
                  <td
                    className={`py-2 pr-3 font-cifra ${diferenciaCuota > 0 ? 'text-no-viable' : 'text-comodo'}`}
                  >
                    {diferenciaCuota >= 0 ? '+' : ''}
                    <ValorEurosTabla valor={diferenciaCuota} />
                  </td>
                  <td className="py-2 pr-3 font-cifra text-tinta">
                    <ValorEurosTabla valor={intereses} />
                  </td>
                  <td
                    className={`py-2 font-cifra ${diferenciaIntereses > 0 ? 'text-no-viable' : 'text-comodo'}`}
                  >
                    {diferenciaIntereses >= 0 ? '+' : ''}
                    <ValorEurosTabla valor={diferenciaIntereses} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TablaResponsive>
        <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
          Compara la misma financiación desde el inicio. En hipotecas variables o mixtas, se asume
          que el Euríbor actual se mantiene.
        </p>
      </section>

      <section className="rounded-medio border border-linea p-4">
        <p className="rotulo mb-1">Comparador</p>
        <h3 className="font-display text-lg text-tinta">Entrada adicional</h3>
        <TablaResponsive minWidth="440px" className="mt-4">
          <thead>
            <tr className="border-b border-linea text-left text-xs text-tinta-suave">
              <th className="py-2 pr-3 font-medium">Entrada adicional</th>
              <th className="py-2 pr-3 font-medium">Nueva cuota</th>
              <th className="py-2 pr-3 font-medium">Ahorro /mes</th>
              <th className="py-2 font-medium">Intereses ahorrados</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-linea bg-superficie-2 font-medium">
              <td className="py-2 pr-3 text-tinta">Entrada actual</td>
              <td className="py-2 pr-3 font-cifra text-tinta">
                <ValorEurosTabla valor={cuotaBase} />
              </td>
              <td className="py-2 pr-3 font-cifra text-tinta-suave">—</td>
              <td className="py-2 font-cifra text-tinta-suave">—</td>
            </tr>
            {entradasAdicionales.map((entrada) => {
              const flujoEntrada = construirFlujoDeCaja({
                ...flujoInput,
                capital: maxCents(ZERO, subtractCents(escenario.importeSolicitado, entrada)),
              });
              const cuota = flujoEntrada[1]?.cuota ?? ZERO;
              const intereses = sumCents(flujoEntrada.slice(1).map((linea) => linea.intereses));

              return (
                <tr key={entrada} className="border-b border-linea last:border-b-0">
                  <td className="py-2 pr-3 font-semibold text-tinta">
                    +<ValorEurosTabla valor={entrada} />
                  </td>
                  <td className="py-2 pr-3 font-cifra text-tinta">
                    <ValorEurosTabla valor={cuota} />
                  </td>
                  <td className="py-2 pr-3 font-cifra text-comodo">
                    -<ValorEurosTabla valor={subtractCents(cuotaBase, cuota)} />
                  </td>
                  <td className="py-2 font-cifra text-comodo">
                    -<ValorEurosTabla valor={subtractCents(interesesBase, intereses)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TablaResponsive>
        <p className="mt-3 text-xs text-tinta-suave">
          Una entrada adicional reduce el capital financiado y los intereses totales.
        </p>
      </section>
    </div>
  );
}

interface PropsTarjetaHipoteca {
  readonly resultado: ResultadoComparacion;
  readonly onEditar: (oferta: OfertaBancaria) => void;
  readonly onEliminar: (id: string) => void;
}

function TarjetaHipoteca({ resultado, onEditar, onEliminar }: PropsTarjetaHipoteca) {
  const [detallesAvanzadosAbiertos, setDetallesAvanzadosAbiertos] = useState(false);
  const { oferta, metricas } = resultado;
  const { escenario } = oferta;
  const flujoInput = flujoInputDesdeEscenario({ ...escenario, sueloTin: 0 });
  const flujo = construirFlujoDeCaja(flujoInput);
  const interesesTotales = sumCents(flujo.slice(1).map((linea) => linea.intereses));
  const aportacion = maxCents(
    ZERO,
    subtractCents(escenario.precioCompra, escenario.importeSolicitado),
  );
  const mesesFijos = Math.min(
    (escenario.mixtaAniosFijos ?? ANIOS_FIJOS_MIXTO_POR_DEFECTO) * 12,
    flujoInput.plazoMeses - 1,
  );
  const tinConVinculaciones = calcularTinMes(1, flujoInput, mesesFijos);

  return (
    <article className="rounded-grande border border-linea bg-superficie p-5 shadow-papel">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo mb-1">Hipoteca</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl leading-snug text-tinta">{oferta.banco}</h2>
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-3 text-xs font-semibold text-acento">
            <button type="button" onClick={() => setDetallesAvanzadosAbiertos(true)}>
              Detalles avanzados
            </button>
            <button type="button" onClick={() => onEditar(oferta)}>
              Editar
            </button>
            <button type="button" className="text-no-viable" onClick={() => onEliminar(oferta.id)}>
              Eliminar
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 whitespace-nowrap">
          <BadgeEstadoOferta estado={oferta.estado} />
          <span className="inline-flex items-center rounded-chico border border-linea bg-superficie-2 px-2 py-0.5 text-xs font-medium text-tinta-media whitespace-nowrap">
            Cuota: {ETIQUETAS_TIPO_HIPOTECA[escenario.tipo]}
          </span>
          <span className="inline-flex items-center rounded-chico border border-linea bg-superficie-2 px-2 py-0.5 text-xs font-medium text-tinta-media whitespace-nowrap">
            {escenario.plazoAnios} años
          </span>
          <span className="inline-flex items-center rounded-chico border border-linea bg-superficie-2 px-2 py-0.5 text-xs font-medium text-tinta-media whitespace-nowrap">
            {metricas.numVinculacionesObligatorias} vinculaciones
          </span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-chico bg-superficie-2 px-3 py-2">
          <dt className="text-xs text-tinta-suave">Coste total estimado</dt>
          <dd className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
            {formatEuros(metricas.costeRealTotal)}
          </dd>
        </div>
        <div className="rounded-chico bg-superficie-2 px-3 py-2">
          <dt className="text-xs text-tinta-suave">Aportación y costes iniciales</dt>
          <dd className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
            {formatEuros(metricas.desembolsoInicial)}
          </dd>
        </div>
      </dl>

      <section className="mt-5 border-t border-linea pt-4">
        <h3 className="text-sm font-semibold text-tinta">Tu hipoteca en resumen</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-tinta-suave">Cada mes pagarás</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(metricas.cuotaInicial)}
              <span className="ml-0.5 text-xs font-medium text-tinta-media">/mes</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">El banco te presta</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(escenario.importeSolicitado)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">Tú aportas al comprar</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(aportacion)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">
              {escenario.tipo === 'fija'
                ? 'Intereses durante toda la hipoteca'
                : 'Intereses estimados'}
            </dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(interesesTotales)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">TAE calculada</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {metricas.taeEstimada === 0 ? '—' : `${(metricas.taeEstimada * 100).toFixed(2)} %`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">TIN inicial</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {(tinConVinculaciones * 100).toFixed(2)} %
            </dd>
          </div>
        </dl>
      </section>

      {oferta.notas !== '' && (
        <section className="mt-5 border-t border-linea pt-4">
          <h3 className="text-sm font-semibold text-tinta">Notas</h3>
          <p className="mt-2 text-sm leading-relaxed text-tinta-media">{oferta.notas}</p>
        </section>
      )}

      {detallesAvanzadosAbiertos && (
        <div className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`titulo-detalles-avanzados-${oferta.id}`}
            className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="rotulo mb-1">Hipoteca</p>
                <h2
                  id={`titulo-detalles-avanzados-${oferta.id}`}
                  className="font-display text-xl text-tinta"
                >
                  Detalles avanzados
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetallesAvanzadosAbiertos(false)}
                aria-label="Cerrar detalles avanzados"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
              >
                ×
              </button>
            </div>
            <DetallesAvanzadosHipoteca escenario={escenario} />
          </div>
        </div>
      )}
    </article>
  );
}

function Hipotecas() {
  const { estado, actualizarOfertas, actualizarEscenarioSimulador } = useEstado();
  const navegar = useNavigate();
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [puntuacionActiva, setPuntuacionActiva] = useState(true);
  const [pesos, setPesos] = useState<PesosComparacion>(PESOS_POR_DEFECTO);
  const [mostrarConfigPesos, setMostrarConfigPesos] = useState(false);

  const comparacion = useMemo(
    () => compararOfertas(estado.ofertas, pesos),
    [estado.ofertas, pesos],
  );
  const ofertasComparables = sonOfertasComparables(estado.ofertas);
  const mostrarPuntuacion = puntuacionActiva && ofertasComparables && comparacion.length > 1;
  const indiceVisible = Math.min(indiceActivo, Math.max(comparacion.length - 1, 0));

  function abrirNueva() {
    void navegar('/ofertas/simulador?guardar=1');
  }

  function abrirEditar(oferta: OfertaBancaria) {
    actualizarEscenarioSimulador(simulacionDesdeOferta(oferta));
    void navegar(`/ofertas/simulador?oferta=${encodeURIComponent(oferta.id)}`);
  }

  function eliminarOferta(id: string) {
    const ofertasRestantes = estado.ofertas.filter((oferta) => oferta.id !== id);
    actualizarOfertas(ofertasRestantes);
    setIndiceActivo((indice) => Math.min(indice, Math.max(ofertasRestantes.length - 1, 0)));
  }

  return (
    <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem+2.75rem+1.25rem)] bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:top-24 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]">
      <button
        type="button"
        onClick={abrirNueva}
        className="shrink-0 self-end rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
      >
        {estado.ofertas.length === 0 ? '+ Añadir primera oferta' : '+ Añadir oferta'}
      </button>

      {comparacion.length === 0 && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <h2 className="font-display text-2xl text-tinta">Compara las hipotecas de los bancos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
            Guarda cada propuesta para conocer su coste total, cuota, desembolso y productos
            vinculados antes de decidir.
          </p>
        </div>
      )}

      {comparacion.length > 0 && (
        <>
          {ofertasComparables ? (
            <Recomendacion
              comparacion={comparacion}
              puntuacionActiva={mostrarPuntuacion}
              onConfigurar={() => setMostrarConfigPesos(true)}
            />
          ) : (
            <section
              role="status"
              className="rounded-grande border border-revisar/40 bg-revisar-tenue px-5 py-4 text-sm leading-relaxed text-tinta"
            >
              Estas ofertas corresponden a precios de vivienda distintos. Se muestran sus cifras,
              pero no se elige una “mejor” hasta que todas comparen la misma compra.
            </section>
          )}

          {comparacion.length > 1 && (
            <nav
              aria-label="Paginación de hipotecas"
              className="flex shrink-0 items-center justify-center gap-3 rounded-grande border border-linea bg-superficie px-3 py-2 shadow-papel"
            >
              <button
                type="button"
                onClick={() => setIndiceActivo((indice) => Math.max(0, indice - 1))}
                disabled={indiceVisible === 0}
                className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Anterior
              </button>
              <p className="min-w-16 text-center font-cifra text-sm tabular-nums text-tinta-media">
                {indiceVisible + 1} de {comparacion.length}
              </p>
              <button
                type="button"
                onClick={() =>
                  setIndiceActivo((indice) => Math.min(comparacion.length - 1, indice + 1))
                }
                disabled={indiceVisible === comparacion.length - 1}
                className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Siguiente
              </button>
            </nav>
          )}

          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto pr-1">
            {comparacion.map((resultado, indice) =>
              indice === indiceVisible ? (
                <TarjetaHipoteca
                  key={resultado.oferta.id}
                  resultado={resultado}
                  onEditar={abrirEditar}
                  onEliminar={eliminarOferta}
                />
              ) : null,
            )}
          </div>
        </>
      )}

      {mostrarConfigPesos && (
        <div className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-configuracion-recomendacion"
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="rotulo mb-1">Recomendación</p>
                <h2
                  id="titulo-configuracion-recomendacion"
                  className="font-display text-xl text-tinta"
                >
                  Ajustar criterios
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMostrarConfigPesos(false)}
                aria-label="Cerrar configuración"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
              >
                ×
              </button>
            </div>
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={puntuacionActiva}
                  onClick={() => setPuntuacionActiva((valor) => !valor)}
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
                  {puntuacionActiva ? 'Recomendación automática activada' : 'Solo cifras'}
                </span>
              </div>
              {puntuacionActiva && (
                <>
                  <p className="text-xs text-tinta-suave">
                    Ajusta la importancia de cada criterio para todas las hipotecas.
                  </p>
                  <PanelPesos pesos={pesos} onCambio={setPesos} />
                  <button
                    type="button"
                    onClick={() => setPesos(PESOS_POR_DEFECTO)}
                    className="self-start text-xs font-semibold text-acento hover:underline"
                  >
                    Restaurar pesos por defecto
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BorradorVivienda {
  readonly nombre: string;
  readonly fecha: string;
  readonly direccion: string;
  readonly precioVenta: Cents;
  readonly superficieM2: number;
  readonly esExterior: boolean;
  readonly tieneTrastero: boolean;
  readonly tieneGaraje: boolean;
  readonly reformas: PartidaReforma[];
  readonly notas: string;
}

const VIVIENDA_VACIA: BorradorVivienda = {
  nombre: '',
  fecha: fechaLocalISO(),
  direccion: '',
  precioVenta: ZERO,
  superficieM2: 0,
  esExterior: false,
  tieneTrastero: false,
  tieneGaraje: false,
  reformas: [],
  notas: '',
};

function totalReformas(reformas: readonly PartidaReforma[]): Cents {
  return sumCents(reformas.map((reforma) => reforma.costeEstimado));
}

function borradorDesdeVivienda(vivienda: ViviendaGuardada): BorradorVivienda {
  return {
    nombre: vivienda.nombre,
    fecha: vivienda.fecha === '' ? fechaLocalISO() : vivienda.fecha,
    direccion: vivienda.direccion,
    precioVenta: vivienda.precioVenta,
    superficieM2: vivienda.superficieM2,
    esExterior: vivienda.esExterior,
    tieneTrastero: vivienda.tieneTrastero,
    tieneGaraje: vivienda.tieneGaraje,
    reformas: vivienda.reformas,
    notas: vivienda.notas,
  };
}

function EditorPartidasReforma({
  reformas,
  onChange,
}: {
  readonly reformas: PartidaReforma[];
  readonly onChange: (reformas: PartidaReforma[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {reformas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se ha preparado ninguna reforma.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reformas.map((reforma) => (
            <div
              key={reforma.id}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem] sm:items-end"
            >
              <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
                Reforma
                <input
                  type="text"
                  value={reforma.concepto}
                  onChange={(e) =>
                    onChange(
                      reformas.map((actual) =>
                        actual.id === reforma.id ? { ...actual, concepto: e.target.value } : actual,
                      ),
                    )
                  }
                  placeholder="Ej. Reforma de cocina"
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                />
              </label>
              <InputMoneda
                id={`reforma-${reforma.id}`}
                etiqueta="Coste aprox."
                valor={reforma.costeEstimado}
                onChange={(costeEstimado) =>
                  onChange(
                    reformas.map((actual) =>
                      actual.id === reforma.id ? { ...actual, costeEstimado } : actual,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormularioVivienda({
  vivienda,
  onGuardar,
  onCancelar,
}: {
  readonly vivienda: ViviendaGuardada | null;
  readonly onGuardar: (borrador: BorradorVivienda) => void;
  readonly onCancelar: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorVivienda>(
    vivienda === null ? VIVIENDA_VACIA : borradorDesdeVivienda(vivienda),
  );
  const [error, setError] = useState('');
  const [modalReformasAbierto, setModalReformasAbierto] = useState(false);
  const [reformasEnEdicion, setReformasEnEdicion] = useState<PartidaReforma[]>(borrador.reformas);

  function guardar() {
    const direccion = borrador.direccion.trim();
    const nombre = borrador.nombre.trim();
    if (nombre === '' || direccion === '' || borrador.precioVenta <= ZERO) {
      setError('Indica el nombre, la dirección y un precio de venta mayor que cero.');
      return;
    }
    onGuardar({ ...borrador, nombre, direccion, notas: borrador.notas.trim() });
  }

  function abrirReformas() {
    setReformasEnEdicion([{ id: crypto.randomUUID(), concepto: '', costeEstimado: ZERO }]);
    setModalReformasAbierto(true);
  }

  return (
    <Panel
      rotulo={vivienda === null ? 'Nueva vivienda' : 'Editar vivienda'}
      titulo="Datos del inmueble"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Nombre del inmueble
          <input
            type="text"
            value={borrador.nombre}
            onChange={(e) => setBorrador((actual) => ({ ...actual, nombre: e.target.value }))}
            placeholder="Ej. Piso Centro"
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Fecha
          <input
            type="date"
            value={borrador.fecha}
            onChange={(e) => setBorrador((actual) => ({ ...actual, fecha: e.target.value }))}
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Dirección o referencia
          <input
            type="text"
            value={borrador.direccion}
            onChange={(e) => setBorrador((actual) => ({ ...actual, direccion: e.target.value }))}
            placeholder="Ej. Calle Mayor, 24 · Zaragoza"
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputMoneda
            id="vivienda-precio-venta"
            etiqueta="Precio de venta"
            valor={borrador.precioVenta}
            onChange={(precioVenta) => setBorrador((actual) => ({ ...actual, precioVenta }))}
          />
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Metros cuadrados
            <InputNumeroEntero
              id="vivienda-superficie"
              valor={borrador.superficieM2}
              minimo={0}
              maximo={10000}
              onChange={(superficieM2) => setBorrador((actual) => ({ ...actual, superficieM2 }))}
              className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
            />
          </label>
        </div>
        <fieldset className="grid grid-cols-1 gap-3 rounded-medio border border-linea p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium text-tinta">Características</legend>
          {(
            [
              ['esExterior', 'Exterior'],
              ['tieneTrastero', 'Trastero'],
              ['tieneGaraje', 'Garaje'],
            ] as const
          ).map(([campo, etiqueta]) => (
            <label key={campo} className="flex items-center gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                checked={borrador[campo]}
                onChange={(e) =>
                  setBorrador((actual) => ({ ...actual, [campo]: e.target.checked }))
                }
                className="h-4 w-4 rounded border-linea text-acento focus:ring-acento"
              />
              {etiqueta}
            </label>
          ))}
        </fieldset>
        <div className="rounded-medio border border-linea p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-tinta">Reformas</p>
            </div>
            <button
              type="button"
              onClick={abrirReformas}
              className="rounded-medio border border-linea px-3 py-1.5 text-xs font-medium text-acento hover:bg-superficie-2"
            >
              + Agregar reforma
            </button>
          </div>
          {borrador.reformas.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {borrador.reformas.map((reforma) => (
                <div
                  key={reforma.id}
                  className="flex items-center justify-between gap-3 rounded-chico bg-superficie-2 px-3 py-2 text-sm"
                >
                  <span className="text-tinta">
                    {reforma.concepto === '' ? 'Partida sin nombre' : reforma.concepto}
                  </span>
                  <span className="font-cifra font-medium tabular-nums text-tinta">
                    {formatEuros(reforma.costeEstimado)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {modalReformasAbierto && (
          <div className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-reformas"
              className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="rotulo mb-1">Reforma</p>
                  <h2 id="titulo-reformas" className="font-display text-xl text-tinta">
                    Añadir reforma
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModalReformasAbierto(false)}
                  aria-label="Cerrar reformas"
                  className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
                >
                  ×
                </button>
              </div>
              <div className="mt-5">
                <EditorPartidasReforma
                  reformas={reformasEnEdicion}
                  onChange={setReformasEnEdicion}
                />
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-linea pt-4">
                <button
                  type="button"
                  onClick={() => setModalReformasAbierto(false)}
                  className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reforma = reformasEnEdicion[0];
                    if (reforma !== undefined) {
                      setBorrador((actual) => ({
                        ...actual,
                        reformas: [...actual.reformas, reforma],
                      }));
                    }
                    setModalReformasAbierto(false);
                  }}
                  className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
                >
                  Guardar reforma
                </button>
              </div>
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Notas
          <textarea
            value={borrador.notas}
            onChange={(e) => setBorrador((actual) => ({ ...actual, notas: e.target.value }))}
            rows={2}
            placeholder="Planta, metros, estado, enlace del anuncio…"
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <p className="rounded-chico bg-acento-tenue px-3 py-2 text-sm text-tinta">
          Coste de vivienda antes de impuestos y otros gastos:{' '}
          <strong className="font-cifra tabular-nums">
            {formatEuros(addCents(borrador.precioVenta, totalReformas(borrador.reformas)))}
          </strong>
        </p>
        {error !== '' && <p className="text-sm text-no-viable">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={guardar}
            className="rounded-medio bg-acento px-5 py-2 text-sm font-medium text-white hover:bg-acento/90"
          >
            {vivienda === null ? 'Guardar vivienda' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-medio border border-linea px-5 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function precioPorM2Formateado(valor: number): string {
  return `${formatEntero(Math.round(valor))} €/m²`;
}

function RecomendacionVivienda({
  viviendas,
  comparacion,
}: {
  readonly viviendas: readonly ViviendaGuardada[];
  readonly comparacion: readonly ResultadoComparacionVivienda[];
}) {
  const [modalCalculoAbierto, setModalCalculoAbierto] = useState(false);
  const mejor = comparacion[0];
  const viviendasSinSuperficie = viviendas.length - comparacion.length;

  if (mejor === undefined) {
    return (
      <section className="rounded-grande border border-ajustado/35 bg-ajustado-tenue p-5">
        <p className="rotulo mb-1 text-ajustado">Comparación pendiente</p>
        <h2 className="font-display text-xl text-tinta">Completa los metros cuadrados</h2>
        <p className="mt-2 text-sm leading-relaxed text-tinta-media">
          Necesitamos la superficie para calcular el coste real por m² y recomendar la compra más
          inteligente.
        </p>
      </section>
    );
  }

  const esComparacionReal = comparacion.length >= 2;
  const porcentajeEconomico = Math.round(
    (mejor.desglose.costePorM2 / PESOS_VIVIENDA.costePorM2) * 100,
  );

  return (
    <>
      <section className="relative overflow-hidden rounded-grande border border-acento/35 bg-superficie shadow-papel">
        <div className="absolute inset-y-0 left-0 w-1 bg-acento" aria-hidden="true" />
        <div className="p-4 pl-5 sm:p-5 sm:pl-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="rotulo mb-1 text-acento">
                {esComparacionReal ? 'Compra más inteligente' : 'Análisis provisional'}
              </p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-xl leading-tight text-tinta">
                  {esComparacionReal
                    ? mejor.vivienda.nombre
                    : `Por ahora, ${mejor.vivienda.nombre}`}
                </h2>
                <span className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento">
                  {Math.round(mejor.puntuacion)}/100
                  <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-tinta-media">{mejor.vivienda.direccion}</p>
            </div>
            <button
              type="button"
              onClick={() => setModalCalculoAbierto(true)}
              className="shrink-0 rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
            >
              Cómo se calcula
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-medio bg-superficie-2 px-3 py-2.5">
              <dt className="text-xs text-tinta-suave">Coste con reformas</dt>
              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                {formatEuros(mejor.costeTotal)}
              </dd>
            </div>
            <div className="rounded-medio bg-superficie-2 px-3 py-2.5">
              <dt className="text-xs text-tinta-suave">Coste por m²</dt>
              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                {precioPorM2Formateado(mejor.costePorM2)}
              </dd>
            </div>
          </dl>

          {!esComparacionReal && (
            <p className="mt-3 text-xs text-ajustado">
              Añade otra vivienda completa para confirmar la recomendación.
            </p>
          )}
          {viviendasSinSuperficie > 0 && (
            <p className="mt-2 text-xs text-tinta-media">
              {viviendasSinSuperficie === 1
                ? 'Hay 1 vivienda fuera de la comparación porque no tiene superficie.'
                : `Hay ${viviendasSinSuperficie} viviendas fuera de la comparación porque no tienen superficie.`}
            </p>
          )}
        </div>
      </section>

      {modalCalculoAbierto && (
        <div className="fixed inset-0 z-50 flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-calculo-vivienda"
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="rotulo mb-1">Valoración de viviendas</p>
                <h2 id="titulo-calculo-vivienda" className="font-display text-xl text-tinta">
                  Cómo se calcula
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalCalculoAbierto(false)}
                aria-label="Cerrar explicación"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-tinta-media">
              Comparamos todas tus viviendas con precio y superficie. Primero sumamos las reformas
              al precio de venta y calculamos el coste real por m².
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-chico border border-linea px-3 py-2">
                <span className="block text-tinta-suave">Coste por m²</span>
                <strong className="font-cifra text-tinta">
                  {Math.round(mejor.desglose.costePorM2)}/{PESOS_VIVIENDA.costePorM2}
                </strong>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <span className="block text-tinta-suave">Exterior</span>
                <strong className="font-cifra text-tinta">
                  {mejor.desglose.exterior}/{PESOS_VIVIENDA.exterior}
                </strong>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <span className="block text-tinta-suave">Garaje</span>
                <strong className="font-cifra text-tinta">
                  {mejor.desglose.garaje}/{PESOS_VIVIENDA.garaje}
                </strong>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <span className="block text-tinta-suave">Trastero</span>
                <strong className="font-cifra text-tinta">
                  {mejor.desglose.trastero}/{PESOS_VIVIENDA.trastero}
                </strong>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-tinta-media">
              El coste por m² representa 80 puntos. Exterior y garaje aportan 8 puntos cada uno, y
              el trastero 4. El valor económico de esta vivienda es del {porcentajeEconomico} %
              frente a la más barata por m².
            </p>

            <div className="mt-5 flex justify-end border-t border-linea pt-4">
              <button
                type="button"
                onClick={() => setModalCalculoAbierto(false)}
                className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Viviendas() {
  const { estado, actualizarViviendas } = useEstado();
  const navegar = useNavigate();
  const [indiceActivo, setIndiceActivo] = useState(0);
  const comparacionViviendas = useMemo(
    () => compararViviendas(estado.viviendas),
    [estado.viviendas],
  );
  const indiceVisible = Math.min(indiceActivo, Math.max(estado.viviendas.length - 1, 0));

  function eliminar(id: string) {
    const viviendasRestantes = estado.viviendas.filter((vivienda) => vivienda.id !== id);
    actualizarViviendas(viviendasRestantes);
    setIndiceActivo((indice) => Math.min(indice, Math.max(viviendasRestantes.length - 1, 0)));
  }

  return (
    <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem+2.75rem+1.25rem)] bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:top-24 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]">
      <button
        type="button"
        onClick={() => void navegar('/ofertas/vivienda')}
        className="shrink-0 self-end rounded-medio bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-acento/90"
      >
        + Añadir vivienda
      </button>

      {estado.viviendas.length > 0 && (
        <RecomendacionVivienda viviendas={estado.viviendas} comparacion={comparacionViviendas} />
      )}

      {estado.viviendas.length === 0 && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <h2 className="font-display text-2xl text-tinta">
            Compara el coste real de cada vivienda
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
            Guarda cada inmueble y su reforma estimada. Así puedes distinguir una vivienda más
            barata que necesita obra de otra lista para entrar a vivir.
          </p>
        </div>
      )}

      {estado.viviendas.length > 0 && (
        <>
          {estado.viviendas.length > 1 && (
            <nav
              aria-label="Paginación de viviendas"
              className="flex shrink-0 items-center justify-center gap-3 rounded-grande border border-linea bg-superficie px-3 py-2 shadow-papel"
            >
              <button
                type="button"
                onClick={() => setIndiceActivo((indice) => Math.max(0, indice - 1))}
                disabled={indiceVisible === 0}
                className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Anterior
              </button>
              <p className="min-w-16 text-center font-cifra text-sm tabular-nums text-tinta-media">
                {indiceVisible + 1} de {estado.viviendas.length}
              </p>
              <button
                type="button"
                onClick={() =>
                  setIndiceActivo((indice) => Math.min(estado.viviendas.length - 1, indice + 1))
                }
                disabled={indiceVisible === estado.viviendas.length - 1}
                className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Siguiente
              </button>
            </nav>
          )}

          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto pr-1">
            {estado.viviendas.map((vivienda, indice) => {
              if (indice !== indiceVisible) return null;
              const costeReforma = totalReformas(vivienda.reformas);
              const costeReal = addCents(vivienda.precioVenta, costeReforma);
              return (
                <article
                  key={vivienda.id}
                  className="rounded-grande border border-linea bg-superficie p-5 shadow-papel"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="rotulo mb-1">Vivienda</p>
                      <h3 className="font-display text-lg leading-snug text-tinta">
                        {vivienda.nombre}
                      </h3>
                      <p className="mt-1 text-sm text-tinta-media">{vivienda.direccion}</p>
                    </div>
                    <div className="flex gap-3 text-xs font-semibold text-acento">
                      <button
                        type="button"
                        onClick={() =>
                          void navegar(
                            `/ofertas/vivienda?vivienda=${encodeURIComponent(vivienda.id)}`,
                          )
                        }
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-no-viable"
                        onClick={() => eliminar(vivienda.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-tinta-suave">Precio de venta</dt>
                      <dd className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
                        {formatEuros(vivienda.precioVenta)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-tinta-suave">Reforma estimada</dt>
                      <dd className="mt-1 font-cifra font-semibold tabular-nums text-tinta">
                        {formatEuros(costeReforma)}
                      </dd>
                    </div>
                    <div className="col-span-2 rounded-chico bg-acento-tenue px-3 py-2">
                      <dt className="text-xs text-tinta-media">
                        Coste de vivienda antes de impuestos
                      </dt>
                      <dd className="mt-1 font-cifra text-lg font-bold tabular-nums text-acento">
                        {formatEuros(costeReal)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-linea pt-3 text-xs">
                    <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-2 py-0.5 font-medium text-tinta-media">
                      {vivienda.superficieM2 > 0
                        ? `${vivienda.superficieM2} m²`
                        : 'Superficie pendiente'}
                    </span>
                    {vivienda.esExterior && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-2 py-0.5 font-medium text-comodo">
                        Exterior
                      </span>
                    )}
                    {vivienda.tieneTrastero && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-2 py-0.5 font-medium text-comodo">
                        Trastero
                      </span>
                    )}
                    {vivienda.tieneGaraje && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-2 py-0.5 font-medium text-comodo">
                        Garaje
                      </span>
                    )}
                  </div>
                  {vivienda.reformas.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-tinta">Reformas</p>
                      <ul className="mt-1 space-y-1 text-sm text-tinta-media">
                        {vivienda.reformas.map((reforma) => (
                          <li key={reforma.id} className="flex justify-between gap-3">
                            <span>
                              {reforma.concepto === '' ? 'Partida sin nombre' : reforma.concepto}
                            </span>
                            <span className="font-cifra tabular-nums">
                              {formatEuros(reforma.costeEstimado)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {vivienda.notas !== '' && (
                    <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                      {vivienda.notas}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function EditorVivienda() {
  const { estado, actualizarViviendas } = useEstado();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const idVivienda = parametros.get('vivienda');
  const vivienda =
    idVivienda === null
      ? null
      : (estado.viviendas.find((candidata) => candidata.id === idVivienda) ?? null);

  function guardar(borrador: BorradorVivienda) {
    const presupuestoReforma = totalReformas(borrador.reformas);
    const reforma = borrador.reformas
      .map((partida) => partida.concepto.trim())
      .filter((concepto) => concepto !== '')
      .join(', ');
    const datosVivienda = { ...borrador, presupuestoReforma, reforma };
    if (vivienda === null) {
      actualizarViviendas([...estado.viviendas, { ...datosVivienda, id: crypto.randomUUID() }]);
    } else {
      actualizarViviendas(
        estado.viviendas.map((actual) =>
          actual.id === vivienda.id ? { ...datosVivienda, id: actual.id } : actual,
        ),
      );
    }
    void navegar('/ofertas');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void navegar('/ofertas')}
          className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta hover:bg-superficie-2"
        >
          Volver a viviendas
        </button>
      </div>
      <FormularioVivienda
        key={vivienda?.id ?? 'nueva'}
        vivienda={vivienda}
        onGuardar={guardar}
        onCancelar={() => void navegar('/ofertas')}
      />
    </div>
  );
}

type TabOfertas = 'viviendas' | 'hipotecas';

export function Ofertas() {
  const [parametros, setParametros] = useSearchParams();
  const tabActiva: TabOfertas = parametros.get('tab') === 'hipotecas' ? 'hipotecas' : 'viviendas';

  function cambiarTab(tab: TabOfertas) {
    setParametros(tab === 'viviendas' ? {} : { tab });
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Ofertas" className="grid w-full grid-cols-2">
        {(['viviendas', 'hipotecas'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tabActiva === tab}
            onClick={() => cambiarTab(tab)}
            className={[
              'w-full border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tabActiva === tab
                ? 'border-acento text-acento'
                : 'border-transparent text-tinta-media hover:text-tinta',
            ].join(' ')}
          >
            {tab === 'viviendas' ? 'Viviendas' : 'Hipotecas'}
          </button>
        ))}
      </div>

      <section role="tabpanel">{tabActiva === 'viviendas' ? <Viviendas /> : <Hipotecas />}</section>
    </div>
  );
}
