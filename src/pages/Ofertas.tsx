import { Fragment, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEstado } from '@/app/EstadoProvider';
import { useNavigate, useSearchParams } from 'react-router';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import { Panel } from '@/components/Panel';
import {
  EncabezadoConUnidad,
  TablaResponsive,
  ValorEurosTabla,
  ValorPorcentajeTabla,
} from '@/components/TablaResponsive';
import { fechaLocalISO } from '@/core/dates';
import { formatEntero, formatEuros } from '@/core/format';
import {
  addCents,
  maxCents,
  minCents,
  multiplyCents,
  subtractCents,
  sumCents,
  toCents,
  ZERO,
} from '@/core/money';
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
import { calcularCosteVivienda } from '@/finance/housingCosts';
import {
  evaluarEncajePlanVivienda,
  type EstadoEncajePlanVivienda,
} from '@/finance/housingPlanFit';
import { mapImportedDataToExistingForm } from '@/services/propertyImportMapper';
import { textoDeCapturaInmobiliaria } from '@/services/propertyImageOcr';
import { parsePropertyListing } from '@/services/propertyListingParser';
import { detectarFuenteAnuncio, type FuenteAnuncio } from '@/services/propertySourceDetector';
import type {
  Cents,
  EscenarioHipoteca,
  EstadoOferta,
  OfertaBancaria,
  PartidaReforma,
  ViviendaGuardada,
} from '@/domain/types';
import { ESTADO_INICIAL } from '@/storage/defaults';

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
  readonly onVerHipoteca: (id: string) => void;
}

function Recomendacion({
  comparacion,
  puntuacionActiva,
  onConfigurar,
  onVerHipoteca,
}: PropsRecomendacion) {
  const mejor = comparacion[0];

  if (mejor === undefined) return null;

  return (
    <section className="relative overflow-hidden rounded-grande border border-acento/35 bg-superficie shadow-papel">
      <div className="absolute inset-y-0 left-0 w-1 bg-acento" aria-hidden="true" />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo mb-1 text-acento">
              {comparacion.length > 1 ? 'Hipoteca más inteligente' : 'Análisis provisional'}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-display text-xl leading-tight text-tinta">
                {comparacion.length > 1 ? mejor.oferta.banco : `Por ahora, ${mejor.oferta.banco}`}
              </h2>
              {puntuacionActiva && (
                <span className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento">
                  {Math.round(mejor.puntuacion)}/100
                  <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onVerHipoteca(mejor.oferta.id)}
            className="shrink-0 rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
          >
            Ir a la hipoteca →
          </button>
        </div>

        {comparacion.length === 1 && (
          <p className="mt-3 pr-9 text-xs text-ajustado">
            Añade otra oferta para confirmar la recomendación.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onConfigurar}
        aria-label="Cómo se calcula la valoración"
        className="absolute right-4 bottom-4 flex h-6 w-6 items-center justify-center rounded-full border border-acento/25 bg-acento-tenue text-xs font-bold text-acento transition-colors hover:border-acento/45 hover:bg-acento/15"
      >
        i
      </button>
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rotulo mb-1">Comparador</p>
            <h3 className="font-display text-lg text-tinta">Plazos alternativos</h3>
          </div>
          <InfoTooltip texto="Compara la misma financiación desde el inicio. En hipotecas variables o mixtas, se asume que el Euríbor actual se mantiene." />
        </div>
        <TablaResponsive minWidth="420px" className="mt-4">
          <thead>
            <tr className="border-b border-linea text-left text-xs text-tinta-suave">
              <th className="py-2 pr-3 font-medium">Plazo</th>
              <th className="py-2 pr-3 font-medium">Cuota /mes</th>
              <th className="py-2 pr-3 font-medium">Cambio /mes</th>
              <th className="py-2 font-medium">Intereses totales</th>
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
                  <td className="py-2 font-cifra text-tinta">
                    <ValorEurosTabla valor={intereses} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TablaResponsive>
      </section>

      <section className="rounded-medio border border-linea p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rotulo mb-1">Comparador</p>
            <h3 className="font-display text-lg text-tinta">Entrada adicional</h3>
          </div>
          <InfoTooltip texto="Una entrada adicional reduce el capital financiado y los intereses totales." />
        </div>
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
  const [vinculacionesAbiertas, setVinculacionesAbiertas] = useState(false);
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
    <article id={`hipoteca-${oferta.id}`} tabIndex={-1} className="bg-superficie p-4 sm:p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo mb-1">Hipoteca</p>
            <h2 className="font-display text-lg leading-snug text-tinta">{oferta.banco}</h2>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              className="rounded-medio border border-linea px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
              onClick={() => onEditar(oferta)}
            >
              Editar
            </button>
            <button
              type="button"
              className="rounded-medio border border-linea px-2.5 py-1.5 text-xs font-semibold text-no-viable hover:bg-no-viable-tenue"
              onClick={() => onEliminar(oferta.id)}
            >
              Eliminar
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <BadgeEstadoOferta estado={oferta.estado} />
          <span className="inline-flex items-center whitespace-nowrap rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
            Cuota: {ETIQUETAS_TIPO_HIPOTECA[escenario.tipo]}
          </span>
          <span className="inline-flex items-center whitespace-nowrap rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
            {escenario.plazoAnios} años
          </span>
          <span className="inline-flex items-center whitespace-nowrap rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
            {metricas.numVinculacionesObligatorias} vinculaciones
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium text-tinta-media">
            Aportación y costes iniciales
          </dt>
          <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
            {formatEuros(metricas.desembolsoInicial)}
          </dd>
        </div>
        <div className="min-w-0 rounded-medio border border-acento/25 bg-acento-tenue px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium text-tinta-media">Coste total estimado</dt>
          <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
            {formatEuros(metricas.costeRealTotal)}
          </dd>
        </div>
      </dl>

      <section className="mt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">Cada mes pagarás</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(metricas.cuotaInicial)}
              <span className="ml-0.5 text-xs font-medium text-tinta-media">/mes</span>
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">El banco te presta</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(escenario.importeSolicitado)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">Tú aportas al comprar</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(aportacion)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">
              {escenario.tipo === 'fija'
                ? 'Intereses durante toda la hipoteca'
                : 'Intereses estimados'}
            </dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(interesesTotales)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">TAE calculada</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {metricas.taeEstimada === 0 ? '—' : `${(metricas.taeEstimada * 100).toFixed(2)} %`}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">TIN inicial</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {(tinConVinculaciones * 100).toFixed(2)} %
            </dd>
          </div>
        </dl>
      </section>

      {oferta.notas !== '' && (
        <p className="mt-2 text-sm leading-relaxed text-tinta-media">{oferta.notas}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-linea pt-3">
        <button
          type="button"
          onClick={() => setDetallesAvanzadosAbiertos(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-medio px-3 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue active:scale-[0.98]"
        >
          Ver detalles
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 fill-none stroke-current stroke-2"
          >
            <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setVinculacionesAbiertas(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-medio px-3 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue active:scale-[0.98]"
        >
          Ver vinculaciones
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 fill-none stroke-current stroke-2"
          >
            <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {detallesAvanzadosAbiertos &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-superficie">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`titulo-detalles-avanzados-${oferta.id}`}
              className="flex h-[100dvh] w-full flex-col overflow-hidden bg-superficie"
            >
              <header className="z-10 shrink-0 border-b border-linea bg-superficie px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-sm sm:px-6">
                <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      id={`titulo-detalles-avanzados-${oferta.id}`}
                      className="font-display text-xl leading-tight text-tinta"
                    >
                      Detalles avanzados
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-tinta-media">{oferta.banco}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetallesAvanzadosAbiertos(false)}
                    aria-label="Cerrar detalles avanzados"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-xl text-tinta transition-colors hover:bg-linea"
                  >
                    ×
                  </button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6">
                <div className="mx-auto w-full max-w-3xl">
                  <DetallesAvanzadosHipoteca escenario={escenario} />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {vinculacionesAbiertas &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-superficie">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`titulo-vinculaciones-${oferta.id}`}
              className="flex h-[100dvh] w-full flex-col overflow-hidden bg-superficie"
            >
              <header className="z-10 shrink-0 border-b border-linea bg-superficie px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-sm sm:px-6">
                <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      id={`titulo-vinculaciones-${oferta.id}`}
                      className="font-display text-xl leading-tight text-tinta"
                    >
                      Productos vinculados
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-tinta-media">{oferta.banco}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVinculacionesAbiertas(false)}
                    aria-label="Cerrar productos vinculados"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-xl text-tinta transition-colors hover:bg-linea"
                  >
                    ×
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6">
                <div className="mx-auto w-full max-w-2xl">
                  <p className="mb-4 text-sm leading-relaxed text-tinta-media">
                    Consulta los productos, costes y condiciones asociados a esta hipoteca.
                  </p>

                  {escenario.vinculaciones.length === 0 ? (
                    <div className="rounded-2xl bg-superficie-2 px-4 py-6 text-center">
                      <p className="text-sm font-semibold text-tinta">Sin vinculaciones</p>
                      <p className="mt-1 text-sm text-tinta-media">
                        Esta oferta no tiene productos vinculados registrados.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {escenario.vinculaciones.map((vinculacion) => (
                        <section
                          key={vinculacion.id}
                          className="rounded-2xl border border-linea bg-superficie p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-tinta">{vinculacion.nombre}</h3>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span
                                  className={[
                                    'rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                                    vinculacion.activo
                                      ? 'bg-comodo-tenue text-comodo'
                                      : 'bg-superficie-2 text-tinta-media',
                                  ].join(' ')}
                                >
                                  {vinculacion.activo ? 'Activa' : 'No activa'}
                                </span>
                                <span
                                  className={[
                                    'rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                                    vinculacion.obligatorio
                                      ? 'bg-ajustado-tenue text-ajustado'
                                      : 'bg-superficie-2 text-tinta-media',
                                  ].join(' ')}
                                >
                                  {vinculacion.obligatorio ? 'Obligatoria' : 'Opcional'}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[0.6875rem] font-medium text-tinta-media">
                                Bonificación TIN
                              </p>
                              <p className="font-cifra font-bold tabular-nums text-acento">
                                −{(vinculacion.bonificacionTin * 100).toFixed(2)} %
                              </p>
                            </div>
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <div>
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Coste inicial
                              </dt>
                              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(vinculacion.costeInicial)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Coste anual
                              </dt>
                              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(vinculacion.costeAnual)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Incremento anual
                              </dt>
                              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                                {(vinculacion.incrementoAnual * 100).toFixed(2)} %
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Tiempo exigido
                              </dt>
                              <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                                {vinculacion.aniosExigidos === null
                                  ? 'Sin límite'
                                  : `${vinculacion.aniosExigidos} años`}
                              </dd>
                            </div>
                            {vinculacion.bonificacionMaxima !== undefined && (
                              <div className="col-span-2">
                                <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                  Bonificación máxima
                                </dt>
                                <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
                                  {(vinculacion.bonificacionMaxima * 100).toFixed(2)} %
                                </dd>
                              </div>
                            )}
                          </dl>

                          {vinculacion.observaciones.trim() !== '' && (
                            <div className="mt-4 border-t border-linea pt-3">
                              <p className="text-[0.6875rem] font-medium text-tinta-media">
                                Observaciones
                              </p>
                              <p className="mt-1 text-sm leading-relaxed text-tinta">
                                {vinculacion.observaciones}
                              </p>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}

function Hipotecas() {
  const { estado, actualizarOfertas, actualizarEscenarioSimulador } = useEstado();
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [puntuacionActiva, setPuntuacionActiva] = useState(true);
  const [pesos, setPesos] = useState<PesosComparacion>(PESOS_POR_DEFECTO);
  const [mostrarConfigPesos, setMostrarConfigPesos] = useState(false);
  const [selectorViviendaAbierto, setSelectorViviendaAbierto] = useState(false);
  const primeraViviendaId = estado.viviendas[0]?.id ?? '';
  const viviendaSolicitadaId = parametros.get('vivienda') ?? '';
  const viviendaSeleccionada =
    estado.viviendas.find((vivienda) => vivienda.id === viviendaSolicitadaId) ??
    estado.viviendas[0] ??
    null;
  const viviendaSeleccionadaId = viviendaSeleccionada?.id ?? '';
  const ofertasVivienda = estado.ofertas.filter(
    (oferta) =>
      oferta.viviendaId === viviendaSeleccionadaId ||
      (oferta.viviendaId === undefined && viviendaSeleccionadaId === primeraViviendaId),
  );

  const comparacion = useMemo(
    () => compararOfertas(ofertasVivienda, pesos),
    [ofertasVivienda, pesos],
  );
  const ofertasComparables = sonOfertasComparables(ofertasVivienda);
  const mostrarPuntuacion = puntuacionActiva && ofertasComparables && comparacion.length > 1;
  const indiceVisible = Math.min(indiceActivo, Math.max(comparacion.length - 1, 0));

  function abrirNueva() {
    if (viviendaSeleccionada === null) return;
    const precioCompra = viviendaSeleccionada.precioVenta;
    const ltv = estado.ajustes.ltvPorDefecto;
    actualizarEscenarioSimulador({
      ...ESTADO_INICIAL.escenarioSimulador,
      id: crypto.randomUUID(),
      titulo: 'Nueva hipoteca',
      precioCompra,
      valorTasacion: precioCompra,
      ltv,
      importeSolicitado: multiplyCents(precioCompra, ltv),
      plazoAnios: estado.ajustes.plazoPorDefecto,
      tinFijo: estado.ajustes.tinPorDefecto,
      comisiones: { ...ESTADO_INICIAL.escenarioSimulador.comisiones },
      vinculaciones: [],
      taeOficial: 0,
      euriborFechaValor: '',
      euriborPorPeriodos: [],
    });
    void navegar(
      `/ofertas/simulador?guardar=1&vivienda=${encodeURIComponent(viviendaSeleccionada.id)}`,
    );
  }

  function igualarPrecioCompra() {
    if (viviendaSeleccionada === null) return;
    const precioCompra = viviendaSeleccionada.precioVenta;
    actualizarOfertas(
      estado.ofertas.map((oferta) => {
        const perteneceAVivienda =
          oferta.viviendaId === viviendaSeleccionada.id ||
          (oferta.viviendaId === undefined && viviendaSeleccionada.id === primeraViviendaId);
        if (!perteneceAVivienda) return oferta;
        const baseFinanciable =
          oferta.escenario.valorTasacion > ZERO
            ? minCents(precioCompra, oferta.escenario.valorTasacion)
            : precioCompra;
        return {
          ...oferta,
          escenario: {
            ...oferta.escenario,
            precioCompra,
            importeSolicitado: multiplyCents(baseFinanciable, oferta.escenario.ltv),
          },
        };
      }),
    );
  }

  function abrirEditar(oferta: OfertaBancaria) {
    actualizarEscenarioSimulador(simulacionDesdeOferta(oferta));
    void navegar(
      `/ofertas/simulador?oferta=${encodeURIComponent(oferta.id)}&vivienda=${encodeURIComponent(
        viviendaSeleccionadaId,
      )}`,
    );
  }

  function eliminarOferta(id: string) {
    const ofertasRestantes = estado.ofertas.filter((oferta) => oferta.id !== id);
    actualizarOfertas(ofertasRestantes);
    setIndiceActivo((indice) => Math.min(indice, Math.max(ofertasRestantes.length - 1, 0)));
  }

  function verHipoteca(id: string) {
    const indice = comparacion.findIndex((resultado) => resultado.oferta.id === id);
    if (indice < 0) return;
    setIndiceActivo(indice);
    window.requestAnimationFrame(() => {
      const tarjeta = document.getElementById(`hipoteca-${id}`);
      tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      tarjeta?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem+2.75rem+1.25rem)] bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:top-24 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setSelectorViviendaAbierto(true)}
          disabled={estado.viviendas.length === 0}
          aria-haspopup="dialog"
          aria-expanded={selectorViviendaAbierto}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-linea bg-superficie px-3 py-2 text-left shadow-sm transition active:scale-[0.98] disabled:opacity-50 sm:max-w-xs"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-acento/10 text-acento">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4.5 w-4.5 fill-none stroke-current stroke-2"
            >
              <path d="m3 11 9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta-suave">
              Vivienda
            </span>
            <span className="block truncate text-sm font-medium text-tinta">
              {viviendaSeleccionada?.nombre ?? 'Añade una vivienda'}
            </span>
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 fill-none stroke-tinta-suave stroke-2"
          >
            <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={abrirNueva}
          disabled={viviendaSeleccionada === null}
          className="shrink-0 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ofertasVivienda.length === 0 ? '+ Añadir primera oferta →' : '+ Añadir oferta →'}
        </button>
      </div>

      {selectorViviendaAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') setSelectorViviendaAbierto(false);
          }}
        >
          <button
            type="button"
            aria-label="Cerrar selector de vivienda"
            onClick={() => setSelectorViviendaAbierto(false)}
            className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-selector-vivienda"
            className="relative w-full rounded-t-3xl bg-superficie px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-elevado sm:max-w-sm sm:rounded-3xl sm:p-5"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-linea sm:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <h2 id="titulo-selector-vivienda" className="font-display text-xl text-tinta">
                Elige una vivienda
              </h2>
              <button
                type="button"
                onClick={() => setSelectorViviendaAbierto(false)}
                aria-label="Cerrar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie-2 text-xl text-tinta-media"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {estado.viviendas.map((vivienda) => {
                const seleccionada = vivienda.id === viviendaSeleccionadaId;
                return (
                  <button
                    key={vivienda.id}
                    type="button"
                    onClick={() => {
                      setIndiceActivo(0);
                      setParametros({ tab: 'hipotecas', vivienda: vivienda.id });
                      setSelectorViviendaAbierto(false);
                    }}
                    className={[
                      'flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98]',
                      seleccionada
                        ? 'border-acento bg-acento/8'
                        : 'border-linea bg-superficie hover:bg-superficie-2',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        seleccionada
                          ? 'bg-acento text-sobre-acento'
                          : 'bg-superficie-2 text-tinta-media',
                      ].join(' ')}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-4.5 w-4.5 fill-none stroke-current stroke-2"
                      >
                        <path d="m3 11 9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5.5 9.5V20h13V9.5" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-tinta">
                      {vivienda.nombre}
                    </span>
                    <span
                      aria-hidden="true"
                      className={[
                        'flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                        seleccionada
                          ? 'border-acento bg-acento text-sobre-acento'
                          : 'border-linea text-transparent',
                      ].join(' ')}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viviendaSeleccionada === null ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <h2 className="font-display text-2xl text-tinta">Primero, añade una vivienda</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-tinta-media">
            Cada vivienda tendrá sus propias ofertas hipotecarias.
          </p>
          <button
            type="button"
            onClick={() => void navegar('/ofertas/vivienda')}
            className="mt-4 rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
          >
            Añadir vivienda →
          </button>
        </div>
      ) : (
        comparacion.length === 0 && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
            <h2 className="font-display text-2xl text-tinta">
              Compara las hipotecas de los bancos
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinta-media">
              Guarda cada propuesta para conocer su coste total, cuota, desembolso y productos
              vinculados antes de decidir.
            </p>
          </div>
        )
      )}

      {comparacion.length > 0 && (
        <>
          {ofertasComparables ? (
            <Recomendacion
              comparacion={comparacion}
              puntuacionActiva={mostrarPuntuacion}
              onConfigurar={() => setMostrarConfigPesos(true)}
              onVerHipoteca={verHipoteca}
            />
          ) : (
            <section
              role="status"
              className="rounded-grande border border-revisar/40 bg-revisar-tenue px-5 py-4 text-sm leading-relaxed text-tinta"
            >
              <p>
                Estas ofertas tienen precios de compra distintos. Se muestran sus cifras, pero no se
                elige una “mejor” hasta que todas comparen la misma compra.
              </p>
              <p className="mt-2 text-xs text-tinta-media">
                {ofertasVivienda
                  .map((oferta) => `${oferta.banco}: ${formatEuros(oferta.escenario.precioCompra)}`)
                  .join(' · ')}
              </p>
              <button
                type="button"
                onClick={igualarPrecioCompra}
                className="mt-3 rounded-medio border border-revisar/35 bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta hover:bg-superficie-2"
              >
                Igualar al precio de la vivienda
              </button>
            </section>
          )}

          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-[0_1_auto] flex-col overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
            {comparacion.length > 1 && (
              <nav
                aria-label="Paginación de hipotecas"
                className="flex shrink-0 items-center justify-center gap-3 border-b border-linea bg-superficie px-3 py-2"
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

            <div className="min-h-0 flex-1 overflow-y-auto">
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
  readonly anuncioUrl: string;
  readonly sourcePortal?: 'idealista' | 'fotocasa';
  readonly sourceUrl: string;
  readonly sourceListingId: string;
  readonly rawListingText: string;
  readonly priceHistory: Array<{ price: Cents; date: string }>;
  readonly precioVenta: Cents;
  readonly superficieM2: number;
  readonly habitaciones: number;
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
  anuncioUrl: '',
  sourceUrl: '',
  sourceListingId: '',
  rawListingText: '',
  priceHistory: [],
  precioVenta: ZERO,
  superficieM2: 0,
  habitaciones: 0,
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
    anuncioUrl: vivienda.anuncioUrl,
    ...(vivienda.sourcePortal === undefined ? {} : { sourcePortal: vivienda.sourcePortal }),
    sourceUrl: vivienda.sourceUrl ?? '',
    sourceListingId: vivienda.sourceListingId ?? '',
    rawListingText: vivienda.rawListingText ?? '',
    priceHistory: vivienda.priceHistory ?? [],
    precioVenta: vivienda.precioVenta,
    superficieM2: vivienda.superficieM2,
    habitaciones: vivienda.habitaciones,
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
  const [resultadoImportacion, setResultadoImportacion] = useState('');
  const [errorImportacion, setErrorImportacion] = useState('');
  const [procesandoCaptura, setProcesandoCaptura] = useState(false);
  const [ejemplosAbiertos, setEjemplosAbiertos] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState<Partial<BorradorVivienda> | null>(null);
  const [camposTocados, setCamposTocados] = useState<Set<keyof BorradorVivienda>>(() => new Set());
  const inputCaptura = useRef<HTMLInputElement>(null);
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

  function esCampoVacio(campo: keyof BorradorVivienda, valor: BorradorVivienda[keyof BorradorVivienda]): boolean {
    return valor === undefined || valor === '' || valor === 0 || (valor === false && !camposTocados.has(campo)) || (Array.isArray(valor) && valor.length === 0);
  }

  function camposConConflicto(patch: Partial<BorradorVivienda>): string[] {
    return (Object.keys(patch) as Array<keyof BorradorVivienda>).filter((campo) => {
      const actual = borrador[campo];
      const importado = patch[campo];
      const vacio = esCampoVacio(campo, actual);
      return !vacio && importado !== undefined && actual !== importado;
    });
  }

  function aplicarImportacion(patch: Partial<BorradorVivienda>, reemplazar: boolean) {
    setBorrador((actual) => {
      const resultado = { ...actual };
      for (const [campo, valor] of Object.entries(patch) as Array<[keyof BorradorVivienda, BorradorVivienda[keyof BorradorVivienda]]>) {
        const anterior = actual[campo];
        const vacio = esCampoVacio(campo, anterior);
        if (reemplazar || vacio) Object.assign(resultado, { [campo]: valor });
      }
      return resultado;
    });
    setResultadoImportacion('Datos importados. Revísalos antes de guardar la vivienda.');
  }

  function procesarImportacion(texto: string, fuente: FuenteAnuncio | null) {
    const datos = parsePropertyListing(texto, fuente?.portal);
    const patch = mapImportedDataToExistingForm(datos, texto, fuente) as Partial<BorradorVivienda>;
    if (camposConConflicto(patch).length > 0) setConfirmarReemplazo(patch);
    else aplicarImportacion(patch, false);
  }

  async function importarCaptura(archivo: File | undefined) {
    if (archivo === undefined) return;
    setProcesandoCaptura(true);
    setErrorImportacion('');
    try {
      const texto = await textoDeCapturaInmobiliaria(archivo);
      if (texto === null) setErrorImportacion('No se ha podido leer texto en la captura. Prueba con una imagen más nítida.');
      else procesarImportacion(texto, null);
    } catch {
      setErrorImportacion('No se ha podido ejecutar el OCR local. Prueba con una captura PNG o JPG más nítida.');
    } finally {
      setProcesandoCaptura(false);
    }
  }

  return (
    <Panel
      rotulo={vivienda === null ? 'Nueva vivienda' : 'Editar vivienda'}
      titulo="Datos del inmueble"
    >
      <div className="flex flex-col gap-4">
        <section className="rounded-medio border border-acento/25 bg-acento-tenue p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="rotulo pt-1">Importar datos</p>
            <button
              type="button"
              onClick={() => setEjemplosAbiertos(true)}
              className="rounded-chico border border-acento/35 bg-superficie px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-superficie-2"
            >
              Ver ejemplos
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-tinta-media">Importa capturas de anuncios de Fotocasa o Idealista.</p>
          <button type="button" disabled={procesandoCaptura} onClick={() => { setErrorImportacion(''); setResultadoImportacion(''); inputCaptura.current?.click(); }} className="mt-3 w-full rounded-medio border border-acento/35 bg-superficie px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-wait disabled:opacity-60">{procesandoCaptura ? 'Leyendo captura…' : '📸 Importar captura'}</button>
          <input ref={inputCaptura} type="file" accept="image/*" className="sr-only" onChange={(e) => void importarCaptura(e.target.files?.[0])} />
          <div aria-live="polite">
            {resultadoImportacion !== '' && <p className="mt-2 text-xs font-medium text-comodo">{resultadoImportacion}</p>}
            {errorImportacion !== '' && <p className="mt-2 text-xs font-medium text-no-viable">{errorImportacion}</p>}
          </div>
        </section>
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
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Enlace del anuncio
          <input
            type="url"
            inputMode="url"
            value={borrador.anuncioUrl}
            onChange={(e) => {
              const enlace = e.target.value;
              const fuente = detectarFuenteAnuncio(enlace);
              setBorrador((actual) => ({
                ...actual,
                anuncioUrl: enlace,
                sourceUrl: enlace,
                ...(fuente === null ? {} : { sourcePortal: fuente.portal, sourceListingId: fuente.listingId ?? '' }),
              }));
            }}
            placeholder="https://www.idealista.com/inmueble/..."
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
            Habitaciones
            <InputNumeroEntero
              id="vivienda-habitaciones"
              valor={borrador.habitaciones}
              minimo={0}
              maximo={100}
              onChange={(habitaciones) => setBorrador((actual) => ({ ...actual, habitaciones }))}
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
                onChange={(e) => {
                  setCamposTocados((actual) => new Set(actual).add(campo));
                  setBorrador((actual) => ({ ...actual, [campo]: e.target.checked }));
                }}
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
        {confirmarReemplazo !== null && (
          <div className="fixed inset-0 z-[60] flex items-end bg-tinta/30 p-3 sm:items-center sm:justify-center">
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-reemplazo" className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado">
              <h2 id="titulo-reemplazo" className="font-display text-xl text-tinta">Hay datos ya escritos</h2>
              <p className="mt-2 text-sm text-tinta-media">Se han encontrado datos que reemplazarían información existente.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={() => { aplicarImportacion(confirmarReemplazo, false); setConfirmarReemplazo(null); }} className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento">Completar solo campos vacíos</button>
                <button type="button" onClick={() => { aplicarImportacion(confirmarReemplazo, true); setConfirmarReemplazo(null); }} className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta">Reemplazar con datos importados</button>
                <button type="button" onClick={() => setConfirmarReemplazo(null)} className="px-4 py-2 text-sm text-tinta-media">Cancelar</button>
              </div>
            </div>
          </div>
        )}
        {ejemplosAbiertos && (
          <div className="fixed inset-0 z-[60] bg-superficie">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-ejemplos-importacion"
              className="h-[100dvh] w-full overflow-y-auto bg-superficie p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="rotulo mb-1">Capturas de ejemplo</p>
                  <h2 id="titulo-ejemplos-importacion" className="font-display text-xl text-tinta">
                    Fotocasa e Idealista
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar ejemplos"
                  onClick={() => setEjemplosAbiertos(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-sm text-tinta-media">
                Puedes importar una captura similar desde la galería o haciendo una captura de pantalla.
              </p>
              <div className="mt-4 grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2">
                <figure className="w-full max-w-[18rem] overflow-hidden rounded-medio border border-linea bg-superficie-2">
                  <img
                    src="./ejemplos-importacion/idealista-borroso.png"
                    alt="Ejemplo de captura de Idealista con datos borrosos"
                    className="h-auto w-full scale-[1.015] blur-[3px]"
                  />
                  <figcaption className="px-3 py-2 text-sm font-medium text-tinta">Idealista</figcaption>
                </figure>
                <figure className="w-full max-w-[18rem] overflow-hidden rounded-medio border border-linea bg-superficie-2">
                  <img
                    src="./ejemplos-importacion/fotocasa-borroso.png"
                    alt="Ejemplo de captura de Fotocasa con datos borrosos"
                    className="h-auto w-full scale-[1.015] blur-[3px]"
                  />
                  <figcaption className="px-3 py-2 text-sm font-medium text-tinta">Fotocasa</figcaption>
                </figure>
              </div>
              <div className="mt-5 flex justify-end border-t border-linea pt-4">
                <button
                  type="button"
                  onClick={() => setEjemplosAbiertos(false)}
                  className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
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
                  className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
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
            className="rounded-medio bg-acento px-5 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
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

const CONFIG_ENCAJE_PLAN: Record<
  EstadoEncajePlanVivienda,
  { texto: string; clases: string }
> = {
  en_plan: {
    texto: 'Encaja en tu plan',
    clases: 'border-comodo/35 bg-comodo-tenue text-comodo',
  },
  alcanzable: {
    texto: 'Alcanzable',
    clases: 'border-revisar/35 bg-revisar-tenue text-revisar',
  },
  no_viable: {
    texto: 'No viable',
    clases: 'border-no-viable/35 bg-no-viable-tenue text-no-viable',
  },
  sin_presupuesto: {
    texto: 'Sin presupuesto',
    clases: 'border-linea bg-superficie-2 text-tinta-media',
  },
};

function BadgeEncajePlan({
  estado,
  limitante,
}: {
  readonly estado: EstadoEncajePlanVivienda;
  readonly limitante: 'ingresos' | 'ahorro' | null;
}) {
  const config = CONFIG_ENCAJE_PLAN[estado];
  return (
    <span
      className={`inline-flex rounded-chico border px-1.5 py-0.5 text-[0.6875rem] font-semibold ${config.clases}`}
    >
      {estado === 'no_viable' && limitante === 'ingresos'
        ? 'No viable por ingresos'
        : config.texto}
    </span>
  );
}

function RecomendacionVivienda({
  viviendas,
  comparacion,
  onVerVivienda,
}: {
  readonly viviendas: readonly ViviendaGuardada[];
  readonly comparacion: readonly ResultadoComparacionVivienda[];
  readonly onVerVivienda: (id: string) => void;
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
      <section className="relative shrink-0 overflow-hidden rounded-grande border border-acento/35 bg-superficie shadow-papel">
        <div className="absolute inset-y-0 left-0 w-1 bg-acento" aria-hidden="true" />
        <div className="p-5 pb-7 pl-6 sm:p-6 sm:pb-8 sm:pl-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="rotulo mb-1 text-acento">
                {esComparacionReal ? 'Compra más inteligente' : 'Análisis provisional'}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="font-display text-xl leading-tight text-tinta">
                  {esComparacionReal
                    ? mejor.vivienda.nombre
                    : `Por ahora, ${mejor.vivienda.nombre}`}
                </h2>
                <span className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento">
                  {Math.round(mejor.puntuacion)}/100
                  <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                </span>
                <button
                  type="button"
                  onClick={() => setModalCalculoAbierto(true)}
                  aria-label="Cómo se calcula la valoración"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-acento/25 bg-acento-tenue text-xs font-bold text-acento transition-colors hover:border-acento/45 hover:bg-acento/15"
                >
                  i
                </button>
              </div>
              <p className="mt-1 truncate text-sm text-tinta-media">{mejor.vivienda.direccion}</p>
            </div>
            <button
              type="button"
              onClick={() => onVerVivienda(mejor.vivienda.id)}
              className="shrink-0 rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
            >
              Ir al piso
            </button>
          </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/30 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-calculo-vivienda"
            className="max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado sm:max-h-[90dvh]"
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
                className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
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

  function verVivienda(id: string) {
    const indice = estado.viviendas.findIndex((vivienda) => vivienda.id === id);
    if (indice < 0) return;

    setIndiceActivo(indice);
    window.requestAnimationFrame(() => {
      const tarjeta = document.getElementById(`vivienda-${id}`);
      tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      tarjeta?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem+2.75rem+1.25rem)] bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:top-24 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]">
      <button
        type="button"
        onClick={() => void navegar('/ofertas/vivienda')}
        className="shrink-0 self-end rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
      >
        + Añadir vivienda →
      </button>

      {estado.viviendas.length > 0 && (
        <RecomendacionVivienda
          viviendas={estado.viviendas}
          comparacion={comparacionViviendas}
          onVerVivienda={verVivienda}
        />
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
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-[0_1_auto] flex-col overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
          {estado.viviendas.length > 1 && (
            <nav
              aria-label="Paginación de viviendas"
              className="flex shrink-0 items-center justify-center gap-3 border-b border-linea bg-superficie px-3 py-2"
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            {estado.viviendas.map((vivienda, indice) => {
              if (indice !== indiceVisible) return null;
              const { costeAntesImpuestos, costeTotal } = calcularCosteVivienda(vivienda, estado);
              const encajePlan = evaluarEncajePlanVivienda(vivienda, estado);
              return (
                <article
                  id={`vivienda-${vivienda.id}`}
                  key={vivienda.id}
                  tabIndex={-1}
                  className={`bg-superficie p-4 sm:p-5 ${
                    encajePlan.estado === 'no_viable' ? 'border-l-4 border-no-viable' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="rotulo mb-1">Vivienda</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg leading-snug text-tinta">
                          {vivienda.nombre}
                        </h3>
                        <BadgeEncajePlan
                          estado={encajePlan.estado}
                          limitante={encajePlan.limitante}
                        />
                      </div>
                      <p className="mt-1 text-sm text-tinta-media">{vivienda.direccion}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        className="rounded-medio border border-linea px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
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
                        className="rounded-medio border border-linea px-2.5 py-1.5 text-xs font-semibold text-no-viable hover:bg-no-viable-tenue"
                        onClick={() => eliminar(vivienda.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                      {vivienda.superficieM2 > 0
                        ? `${vivienda.superficieM2} m²`
                        : 'Superficie pendiente'}
                    </span>
                    {vivienda.habitaciones > 0 && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        {vivienda.habitaciones}{' '}
                        {vivienda.habitaciones === 1 ? 'habitación' : 'habitaciones'}
                      </span>
                    )}
                    {vivienda.superficieM2 > 0 && (
                      <span className="inline-flex rounded-chico border border-acento/25 bg-acento-tenue px-1.5 py-0.5 text-[0.6875rem] font-semibold text-acento">
                        {precioPorM2Formateado(costeAntesImpuestos / 100 / vivienda.superficieM2)}
                      </span>
                    )}
                    {vivienda.esExterior && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-1.5 py-0.5 text-[0.6875rem] font-medium text-comodo">
                        Exterior
                      </span>
                    )}
                    {vivienda.tieneTrastero && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-1.5 py-0.5 text-[0.6875rem] font-medium text-comodo">
                        Trastero
                      </span>
                    )}
                    {vivienda.tieneGaraje && (
                      <span className="inline-flex rounded-chico border border-comodo/35 bg-comodo-tenue px-1.5 py-0.5 text-[0.6875rem] font-medium text-comodo">
                        Garaje
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
                      <dt className="text-[0.6875rem] font-medium text-tinta-media">
                        Coste sin impuestos
                      </dt>
                      <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
                        {formatEuros(costeAntesImpuestos)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-medio border border-acento/25 bg-acento-tenue px-3 py-2.5">
                      <dt className="text-[0.6875rem] font-medium text-tinta-media">
                        Coste con impuestos
                      </dt>
                      <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
                        {formatEuros(costeTotal)}
                      </dd>
                    </div>
                  </dl>
                  <div
                    className={`mt-3 rounded-medio px-3 py-2.5 text-sm ${
                      encajePlan.estado === 'no_viable'
                        ? 'bg-no-viable-tenue text-no-viable'
                        : encajePlan.estado === 'sin_presupuesto'
                          ? 'bg-superficie-2 text-tinta-media'
                          : 'bg-superficie-2 text-tinta'
                    }`}
                  >
                    <p className="font-medium">
                      {encajePlan.estado === 'en_plan'
                        ? `Precio dentro de tu presupuesto: ${formatEuros(encajePlan.presupuestoPlanificado)}.`
                        : encajePlan.estado === 'alcanzable'
                          ? `Supera tu presupuesto en ${formatEuros(encajePlan.diferenciaPresupuesto)}, pero es alcanzable.`
                          : encajePlan.estado === 'no_viable'
                            ? encajePlan.limitante === 'ingresos'
                              ? 'No viable por ingresos: el banco no cubriría la financiación necesaria.'
                              : 'No viable con tu plan actual.'
                            : 'Añade un precio objetivo para comprobar si encaja en tu plan.'}
                    </p>
                    {encajePlan.limitante === 'ingresos' &&
                    encajePlan.evaluacion !== null &&
                    encajePlan.prestamoMaximoPorIngresos !== null ? (
                      <p className="mt-0.5 text-xs opacity-90">
                        Financiación necesaria: {formatEuros(encajePlan.evaluacion.importeFinanciado)} ·
                        Máximo estimado por ingresos:{' '}
                        {formatEuros(encajePlan.prestamoMaximoPorIngresos)}.
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs opacity-90">{encajePlan.motivo}</p>
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
                  {vivienda.anuncioUrl !== '' && (
                    <a
                      href={vivienda.anuncioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-semibold text-acento hover:underline"
                    >
                      Ver anuncio original ↗
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EditorVivienda() {
  const { estado, actualizarViviendas } = useEstado();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const [pendienteDuplicado, setPendienteDuplicado] = useState<BorradorVivienda | null>(null);
  const idVivienda = parametros.get('vivienda');
  const vivienda =
    idVivienda === null
      ? null
      : (estado.viviendas.find((candidata) => candidata.id === idVivienda) ?? null);

  function datosParaGuardar(borrador: BorradorVivienda, anterior?: ViviendaGuardada) {
    const presupuestoReforma = totalReformas(borrador.reformas);
    const reforma = borrador.reformas
      .map((partida) => partida.concepto.trim())
      .filter((concepto) => concepto !== '')
      .join(', ');
    const priceHistory =
      anterior !== undefined && anterior.precioVenta !== borrador.precioVenta
        ? [...(anterior.priceHistory ?? []), { price: anterior.precioVenta, date: anterior.fecha }, { price: borrador.precioVenta, date: fechaLocalISO() }]
        : borrador.priceHistory;
    return { ...borrador, priceHistory, presupuestoReforma, reforma };
  }

  function guardar(borrador: BorradorVivienda) {
    const duplicada = estado.viviendas.find((candidata) => {
      if (candidata.id === vivienda?.id) return false;
      return borrador.sourcePortal !== undefined && borrador.sourceListingId !== ''
        ? candidata.sourcePortal === borrador.sourcePortal && candidata.sourceListingId === borrador.sourceListingId
        : borrador.sourceUrl !== '' && candidata.sourceUrl === borrador.sourceUrl;
    });
    if (duplicada !== undefined) {
      setPendienteDuplicado(borrador);
      return;
    }
    const datosVivienda = datosParaGuardar(borrador, vivienda ?? undefined);
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

  function actualizarDuplicada() {
    if (pendienteDuplicado === null) return;
    const duplicada = estado.viviendas.find((candidata) =>
      pendienteDuplicado.sourcePortal !== undefined && pendienteDuplicado.sourceListingId !== ''
        ? candidata.sourcePortal === pendienteDuplicado.sourcePortal && candidata.sourceListingId === pendienteDuplicado.sourceListingId
        : candidata.sourceUrl === pendienteDuplicado.sourceUrl,
    );
    if (duplicada === undefined) return;
    const datos = datosParaGuardar(pendienteDuplicado, duplicada);
    actualizarViviendas(estado.viviendas.map((actual) => actual.id === duplicada.id ? { ...datos, id: actual.id } : actual));
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
          ← Volver a viviendas
        </button>
      </div>
      <FormularioVivienda
        key={vivienda?.id ?? 'nueva'}
        vivienda={vivienda}
        onGuardar={guardar}
        onCancelar={() => void navegar('/ofertas')}
      />
      {pendienteDuplicado !== null && (
        <div className="fixed inset-0 z-[70] flex items-end bg-tinta/30 p-3 sm:items-center sm:justify-center">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-duplicado" className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado">
            <h2 id="titulo-duplicado" className="font-display text-xl text-tinta">Esta vivienda ya está guardada</h2>
            <p className="mt-2 text-sm text-tinta-media">Puedes revisar la existente, actualizarla con estos datos o cancelar.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={actualizarDuplicada} className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento">Actualizar</button>
              <button type="button" onClick={() => void navegar(`/ofertas/vivienda?vivienda=${encodeURIComponent(estado.viviendas.find((candidata) => candidata.sourceUrl === pendienteDuplicado.sourceUrl)?.id ?? '')}`)} className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta">Ver vivienda</button>
              <button type="button" onClick={() => setPendienteDuplicado(null)} className="px-4 py-2 text-sm text-tinta-media">Cancelar</button>
            </div>
          </div>
        </div>
      )}
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
