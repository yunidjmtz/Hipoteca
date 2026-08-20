import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEstado } from '@/app/EstadoProvider';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import { Icono } from '@/components/Icono';
import { Interruptor } from '@/components/Interruptor';
import { Panel } from '@/components/Panel';
import { Amortizacion } from '@/pages/Amortizacion';
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
  actualizarHistorialPrecio,
  mismaFuenteVivienda,
  sincronizarFavoritosCatalogo,
  totalReformas,
  viviendaFavoritaDesdeCatalogo,
} from '@/domain/housingCandidate';
import {
  calcularMetricasOferta,
  compararOfertas,
  PESOS_POR_DEFECTO,
  sonOfertasComparables,
  type ContextoComparacionHipotecas,
  type PesosComparacion,
  type ResultadoComparacion,
} from '@/finance/offers';
import {
  calcularDeudasMensuales,
  calcularIngresoMensualNormalizado,
  calcularOtrosIngresosMensuales,
} from '@/finance/affordability';
import { calcularTinMes, construirFlujoDeCaja } from '@/finance/mortgage';
import { flujoInputDesdeEscenario } from '@/finance/scenario';
import { ANIOS_FIJOS_MIXTO_POR_DEFECTO } from '@/domain/mortgageScenario';
import { compararViviendas, type ResultadoComparacionVivienda } from '@/finance/housingComparison';
import { calcularCosteVivienda } from '@/finance/housingCosts';
import { evaluarEncajePlanVivienda, type EstadoEncajePlanVivienda } from '@/finance/housingPlanFit';
import { importarAnuncioIdealista, normalizarAnuncioImportado } from '@/services/importarAnuncio';
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
import {
  INMOBILIARIA_DEMO,
  VIVIENDAS_CATALOGO_DEMO,
  type InmobiliariaDemo,
  type ViviendaCatalogoDemo,
} from '@/data/inmobiliariaDemo';
import {
  anadirFavoritoCatalogoApi,
  apiHipotecasConfigurada,
  canjearCodigoInmobiliariaApi,
  catalogoApi,
  desvincularInmobiliariaApi,
  guardarCodigoInmobiliariaApi,
  previsualizarCodigoInmobiliariaApi,
  tokenSesionApi,
  ErrorHipotecasApi,
  type InmobiliariaApi,
  type ViviendaCatalogoApi,
} from '@/services/hipotecasApi';

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
  readonly ofertasComparables: boolean;
  readonly puntuacionActiva: boolean;
  readonly onConfigurar: () => void;
  readonly onVerHipoteca: (id: string) => void;
}

function Recomendacion({
  comparacion,
  ofertasComparables,
  puntuacionActiva,
  onConfigurar,
  onVerHipoteca,
}: PropsRecomendacion) {
  const mejor = comparacion.find((resultado) => resultado.esMejorGlobal) ?? comparacion[0];

  if (mejor === undefined) return null;

  const hayCandidataApta = comparacion.some((resultado) => resultado.esMejorGlobal);
  const tieneFiltroDeIngresos = mejor.metricas.ratioBancarioTensionado !== null;
  const segundaApta = comparacion.find(
    (resultado) => resultado.esAptaParaRecomendacion && resultado.oferta.id !== mejor.oferta.id,
  );
  const decisionAjustada =
    hayCandidataApta && segundaApta !== undefined && mejor.puntuacion - segundaApta.puntuacion < 3;

  return (
    <section
      className={`relative shrink-0 overflow-hidden rounded-grande border bg-superficie shadow-papel ${
        hayCandidataApta ? 'border-acento/35' : 'border-no-viable/35'
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${hayCandidataApta ? 'bg-acento' : 'bg-no-viable'}`}
        aria-hidden="true"
      />
      <div className="px-3 py-4 sm:px-4 sm:py-5">
        <div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className={`rotulo ${hayCandidataApta ? 'text-acento' : 'text-no-viable'}`}>
                {!ofertasComparables
                  ? 'Comparación no válida'
                  : !hayCandidataApta
                    ? 'Ninguna supera el filtro de seguridad'
                    : comparacion.length === 1
                      ? 'Análisis provisional'
                      : decisionAjustada
                        ? 'Decisión muy ajustada'
                        : tieneFiltroDeIngresos
                          ? 'Hipoteca con mejor encaje'
                          : 'Mejor por condiciones registradas'}
              </p>
              {puntuacionActiva && hayCandidataApta && (
                <button
                  type="button"
                  onClick={onConfigurar}
                  aria-label="Cómo se calcula la valoración"
                  className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento transition-colors hover:bg-acento/15"
                >
                  {Math.round(mejor.puntuacion)}/100
                  <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                </button>
              )}
            </div>
            <h2 className="mt-1 min-w-0 truncate font-display text-xl leading-tight text-tinta">
              {!hayCandidataApta
                ? ofertasComparables
                  ? 'Revisa ingresos, ahorro o condiciones'
                  : 'Iguala el precio de compra'
                : comparacion.length > 1
                  ? mejor.oferta.banco
                  : `Por ahora, ${mejor.oferta.banco}`}
            </h2>
            {!ofertasComparables && (
              <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                Las propuestas deben referirse al mismo precio de compra antes de elegir una
                hipoteca con mejor encaje.
              </p>
            )}
            {ofertasComparables && !hayCandidataApta && (
              <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                Las ofertas están rechazadas, superan el límite de esfuerzo o exigen más efectivo
                del disponible. Se muestra la mejor puntuada solo para revisar sus condiciones.
              </p>
            )}
            {decisionAjustada && segundaApta !== undefined && (
              <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                La diferencia con {segundaApta.oferta.banco} es inferior a 3 puntos; trátalas como
                alternativas equivalentes y contrasta la FEIN.
              </p>
            )}
            {hayCandidataApta && !tieneFiltroDeIngresos && (
              <p className="mt-2 text-sm leading-relaxed text-ajustado">
                Falta el filtro de ingresos: esta es la mejor por coste y condiciones, no una
                confirmación de que la cuota sea asumible para ti.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onVerHipoteca(mejor.oferta.id)}
            className="mt-3 rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
          >
            Ir a la hipoteca →
          </button>
        </div>
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
    { campo: 'resiliencia', etiqueta: 'Resistencia a subidas' },
    { campo: 'flexibilidad', etiqueta: 'Flexibilidad' },
    { campo: 'vinculaciones', etiqueta: 'Vinculaciones' },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                                ['resiliencia', 'Resistencia'],
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
  const [amortizacionAbierta, setAmortizacionAbierta] = useState(false);
  const { oferta, metricas } = resultado;
  const { escenario } = oferta;
  const flujoInput = flujoInputDesdeEscenario({ ...escenario, sueloTin: 0 });
  const flujo = construirFlujoDeCaja(flujoInput);
  const interesesTotales = sumCents(flujo.slice(1).map((linea) => linea.intereses));
  const aportacion = maxCents(
    ZERO,
    subtractCents(escenario.precioCompra, escenario.importeSolicitado),
  );
  const gastosIniciales = subtractCents(metricas.desembolsoInicial, aportacion);
  const mesesFijos = Math.min(
    (escenario.mixtaAniosFijos ?? ANIOS_FIJOS_MIXTO_POR_DEFECTO) * 12,
    flujoInput.plazoMeses - 1,
  );
  const tinConVinculaciones = calcularTinMes(1, flujoInput, mesesFijos);

  return (
    <article
      id={`hipoteca-${oferta.id}`}
      tabIndex={-1}
      className="relative mt-5 rounded-grande border border-linea bg-superficie px-3 py-4 shadow-papel sm:px-4 sm:py-5"
    >
      <span
        className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-acento/30 bg-acento-tenue text-acento shadow-papel"
        aria-hidden="true"
      >
        <Icono nombre="hipoteca" tamano={21} />
      </span>
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
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 text-sm">
        <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium text-tinta-media">Cuota</dt>
          <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
            {formatEuros(metricas.cuotaInicial)}
            <span className="ml-0.5 text-xs font-medium text-tinta-media">/mes</span>
          </dd>
        </div>
        <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium text-tinta-media">TAE</dt>
          <dd className="mt-0.5 font-cifra text-sm font-bold tabular-nums text-tinta sm:text-base">
            {metricas.taeEstimada === 0 ? '—' : `${(metricas.taeEstimada * 100).toFixed(2)} %`}
          </dd>
        </div>
        <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium text-tinta-media">Plazo</dt>
          <dd className="mt-0.5 font-cifra text-sm font-bold tabular-nums text-tinta sm:text-base">
            {escenario.plazoAnios} años
          </dd>
        </div>
        <div aria-hidden="true" className="col-span-3 border-t border-linea" />
        <div className="col-span-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
            <dt className="text-[0.6875rem] font-medium text-tinta-media">Entrada</dt>
            <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
              {formatEuros(aportacion)}
            </dd>
            <p className="mt-0.5 text-[0.6875rem] text-tinta-media">
              Gastos iniciales: {formatEuros(gastosIniciales)}
            </p>
          </div>
          <div className="min-w-0 rounded-medio border border-acento/25 bg-acento-tenue px-3 py-2.5">
            <dt className="text-[0.6875rem] font-medium text-tinta-media">Coste total estimado</dt>
            <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
              {formatEuros(metricas.costeRealTotal)}
            </dd>
          </div>
        </div>
      </dl>

      <section className="mt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">El banco te presta</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(escenario.importeSolicitado)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-medium text-tinta-media">Intereses totales</dt>
            <dd className="mt-0.5 font-cifra font-semibold tabular-nums text-tinta">
              {formatEuros(interesesTotales)}
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
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 fill-none stroke-current stroke-2"
          >
            <path d="M3 16.5V3.5M3 16.5h14" strokeLinecap="round" />
            <path d="m5.5 13 3.5-3.5 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.5 7h3.5v3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Estrategias
        </button>
        <button
          type="button"
          onClick={() => setVinculacionesAbiertas(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-medio px-3 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue active:scale-[0.98]"
        >
          Vinculaciones
          <span className="inline-flex items-center rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-tinta-media">
            {metricas.numVinculacionesObligatorias}
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 fill-none stroke-current stroke-2"
          >
            <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-1 flex justify-center">
        <button
          type="button"
          onClick={() => setAmortizacionAbierta(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-medio px-4 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue active:scale-[0.98]"
        >
          <Icono nombre="amortizacion" tamano={17} />
          Ver amortización
        </button>
      </div>

      {amortizacionAbierta &&
        createPortal(
          <div className="fixed inset-0 z-[60] bg-superficie">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`titulo-amortizacion-${oferta.id}`}
              className="flex h-[100dvh] w-full flex-col overflow-hidden bg-superficie"
            >
              <header className="z-10 shrink-0 border-b border-linea bg-superficie px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-sm sm:px-6">
                <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      id={`titulo-amortizacion-${oferta.id}`}
                      className="font-display text-xl leading-tight text-tinta"
                    >
                      Amortizar hipoteca
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-tinta-media">{oferta.banco}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmortizacionAbierta(false)}
                    aria-label="Cerrar amortización"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-xl text-tinta transition-colors hover:bg-linea"
                  >
                    ×
                  </button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-3">
                <div className="mx-auto w-full max-w-3xl">
                  <Amortizacion ofertaInicial={oferta} integrada />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

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

export function Hipoteca() {
  const { estado, actualizarOfertas, actualizarEscenarioSimulador } = useEstado();
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const [analisisAbierto, setAnalisisAbierto] = useState(false);
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
  const contextoComparacion = useMemo<ContextoComparacionHipotecas | undefined>(() => {
    const ingresoMensual = addCents(
      calcularIngresoMensualNormalizado(estado.perfil.titulares),
      calcularOtrosIngresosMensuales(estado.perfil),
    );
    const gastosCompraNoFinanciados =
      viviendaSeleccionada === null
        ? undefined
        : calcularCosteVivienda(viviendaSeleccionada, estado).gastosCompra.total;
    return {
      ingresoMensual,
      otrasDeudasMensuales: calcularDeudasMensuales(estado.perfil.deudas),
      ratioBancarioMaximo: estado.ajustes.ratioBancarioMaximo,
      ahorrosDisponibles: estado.perfil.ahorrosActuales,
      ...(gastosCompraNoFinanciados !== undefined ? { gastosCompraNoFinanciados } : {}),
    };
  }, [estado, viviendaSeleccionada]);

  const comparacion = useMemo(
    () => compararOfertas(ofertasVivienda, pesos, contextoComparacion),
    [contextoComparacion, ofertasVivienda, pesos],
  );
  const ofertasComparables = sonOfertasComparables(ofertasVivienda);
  const mostrarPuntuacion = puntuacionActiva && ofertasComparables && comparacion.length > 1;

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
      `/hipoteca/simulador?guardar=1&vivienda=${encodeURIComponent(viviendaSeleccionada.id)}`,
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
      `/hipoteca/simulador?oferta=${encodeURIComponent(oferta.id)}&vivienda=${encodeURIComponent(
        viviendaSeleccionadaId,
      )}`,
    );
  }

  function eliminarOferta(id: string) {
    const ofertasRestantes = estado.ofertas.filter((oferta) => oferta.id !== id);
    actualizarOfertas(ofertasRestantes);
  }

  function verHipoteca(id: string) {
    window.requestAnimationFrame(() => {
      const tarjeta = document.getElementById(`hipoteca-${id}`);
      tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      tarjeta?.focus({ preventScroll: true });
    });
  }

  function verHipotecaDesdeAnalisis(id: string) {
    setAnalisisAbierto(false);
    window.requestAnimationFrame(() => verHipoteca(id));
  }

  return (
    <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem)] bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:top-24 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]">
      <div className="flex shrink-0 flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={() => setSelectorViviendaAbierto(true)}
          disabled={estado.viviendas.length === 0}
          aria-haspopup="dialog"
          aria-expanded={selectorViviendaAbierto}
          className="flex min-w-0 w-full items-center gap-2.5 rounded-xl border border-linea bg-superficie px-3 py-2 text-left shadow-sm transition active:scale-[0.98] disabled:opacity-50"
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
            {viviendaSeleccionada !== null && (
              <span className="block font-cifra text-sm font-semibold tabular-nums text-acento">
                {formatEuros(viviendaSeleccionada.precioVenta)}
              </span>
            )}
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 fill-none stroke-tinta-suave stroke-2"
          >
            <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center justify-between">
          {comparacion.length > 0 ? (
            <button
              type="button"
              onClick={() => setAnalisisAbierto(true)}
              className="analizar-recorrido inline-flex items-center gap-2 rounded-medio border border-linea bg-superficie px-4 py-2 text-sm font-medium text-acento hover:bg-acento-tenue"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <circle cx="8.5" cy="8.5" r="4.75" />
                <path d="m12 12 4.5 4.5" strokeLinecap="round" />
                <path d="M8.5 6.25v4.5M6.25 8.5h4.5" strokeLinecap="round" />
              </svg>
              Analizar
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={abrirNueva}
            disabled={viviendaSeleccionada === null}
            className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Añadir hipoteca
          </button>
        </div>
      </div>

      {selectorViviendaAbierto && (
        <div
          className="fixed inset-0 z-50 bg-superficie"
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') setSelectorViviendaAbierto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-selector-vivienda"
            className="flex h-full w-full flex-col overflow-y-auto bg-superficie px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8"
          >
            <div className="mx-auto flex w-full max-w-2xl flex-col">
              <div className="mb-5 flex items-center justify-between">
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
              <div className="flex flex-col gap-3">
                {estado.viviendas.map((vivienda) => {
                  const seleccionada = vivienda.id === viviendaSeleccionadaId;
                  return (
                    <button
                      key={vivienda.id}
                      type="button"
                      onClick={() => {
                        setParametros({ vivienda: vivienda.id });
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-tinta">
                          {vivienda.nombre}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-tinta-media">
                          {vivienda.direccion}
                        </span>
                        <span className="mt-1 block font-cifra text-sm font-semibold tabular-nums text-acento">
                          {formatEuros(vivienda.precioVenta)}
                        </span>
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
            Añadir inmueble →
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
          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 pb-1">
              {!ofertasComparables && (
                <section
                  role="status"
                  className="rounded-grande border border-revisar/40 bg-revisar-tenue px-5 py-4 text-sm leading-relaxed text-tinta"
                >
                  <p>
                    Estas ofertas tienen precios de compra distintos. Se muestran sus cifras, pero
                    no se elige una “mejor” hasta que todas comparen la misma compra.
                  </p>
                  <p className="mt-2 text-xs text-tinta-media">
                    {ofertasVivienda
                      .map(
                        (oferta) =>
                          `${oferta.banco}: ${formatEuros(oferta.escenario.precioCompra)}`,
                      )
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
              {comparacion.map((resultado) => (
                <TarjetaHipoteca
                  key={resultado.oferta.id}
                  resultado={resultado}
                  onEditar={abrirEditar}
                  onEliminar={eliminarOferta}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {analisisAbierto &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-analisis-hipotecas"
              className="max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado sm:max-h-[90dvh]"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="rotulo mb-1">Tus hipotecas</p>
                  <h2 id="titulo-analisis-hipotecas" className="font-display text-xl text-tinta">
                    Análisis de hipotecas
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setAnalisisAbierto(false)}
                  aria-label="Cerrar análisis"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
                >
                  ×
                </button>
              </div>
              <Recomendacion
                comparacion={comparacion}
                ofertasComparables={ofertasComparables}
                puntuacionActiva={mostrarPuntuacion}
                onConfigurar={() => setMostrarConfigPesos(true)}
                onVerHipoteca={verHipotecaDesdeAnalisis}
              />
              <section className="mt-4 border-t border-linea pt-4">
                <h3 className="text-sm font-semibold text-tinta">Por qué esta valoración</h3>
                <p className="mt-1 text-sm leading-relaxed text-tinta-media">
                  Comparamos el coste real, la cuota inicial, la aportación y costes iniciales, la
                  flexibilidad, las vinculaciones y la resistencia de la cuota a una subida de 2
                  puntos con pérdida de bonificaciones.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-tinta-suave">
                  Una oferta rechazada, sin ahorro suficiente o que supera tu límite de esfuerzo en
                  el escenario adverso nunca puede ser la recomendada, aunque puntúe bien.
                </p>
                {comparacion[0] !== undefined && (
                  <div className="mt-3 rounded-medio bg-superficie-2 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-tinta-media">Cuota en escenario adverso</span>
                      <strong className="font-cifra tabular-nums text-tinta">
                        {formatEuros(comparacion[0].metricas.cuotaTensionada)}/mes
                      </strong>
                    </div>
                    {comparacion[0].metricas.ratioBancarioTensionado !== null && (
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-tinta-media">Esfuerzo con deudas</span>
                        <strong className="font-cifra tabular-nums text-tinta">
                          {(comparacion[0].metricas.ratioBancarioTensionado * 100).toFixed(1)} %
                        </strong>
                      </div>
                    )}
                  </div>
                )}
                {comparacion[0]?.metricas.ratioBancarioTensionado === null && (
                  <p className="mt-3 text-xs leading-relaxed text-ajustado">
                    Añade tus ingresos en Perfil para aplicar el filtro de esfuerzo a la
                    recomendación.
                  </p>
                )}
                {comparacion[0]?.metricas.efectivoTotalNecesario !== null &&
                  comparacion[0]?.metricas.efectivoTotalNecesario !== undefined && (
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-tinta-media">Efectivo total necesario</span>
                      <strong className="font-cifra tabular-nums text-tinta">
                        {formatEuros(comparacion[0].metricas.efectivoTotalNecesario)}
                      </strong>
                    </div>
                  )}
              </section>
            </div>
          </div>,
          document.body,
        )}

      {mostrarConfigPesos &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end bg-tinta/30 p-4 sm:items-center sm:justify-center">
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
                      Ajusta la importancia de cada criterio. Los pesos se normalizan
                      proporcionalmente, por lo que la valoración siempre queda entre 0 y 100.
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
          </div>,
          document.body,
        )}
    </div>
  );
}

interface BorradorVivienda {
  readonly nombre: string;
  readonly fecha: string;
  readonly direccion: string;
  readonly anuncioUrl: string;
  readonly telefono: string;
  readonly sourcePortal?: 'idealista' | 'fotocasa';
  readonly sourceUrl: string;
  readonly sourceListingId: string;
  readonly rawListingText: string;
  readonly priceHistory: Array<{ price: Cents; date: string }>;
  readonly precioVenta: Cents;
  readonly superficieM2: number;
  readonly habitaciones: number;
  readonly banos: number;
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
  telefono: '',
  sourceUrl: '',
  sourceListingId: '',
  rawListingText: '',
  priceHistory: [],
  precioVenta: ZERO,
  superficieM2: 0,
  habitaciones: 0,
  banos: 0,
  esExterior: false,
  tieneTrastero: false,
  tieneGaraje: false,
  reformas: [],
  notas: '',
};

function borradorDesdeVivienda(vivienda: ViviendaGuardada): BorradorVivienda {
  return {
    nombre: vivienda.nombre,
    fecha: vivienda.fecha === '' ? fechaLocalISO() : vivienda.fecha,
    direccion: vivienda.direccion,
    anuncioUrl: vivienda.anuncioUrl,
    telefono: vivienda.telefono ?? '',
    ...(vivienda.sourcePortal === undefined ? {} : { sourcePortal: vivienda.sourcePortal }),
    sourceUrl: vivienda.sourceUrl ?? '',
    sourceListingId: vivienda.sourceListingId ?? '',
    rawListingText: vivienda.rawListingText ?? '',
    priceHistory: vivienda.priceHistory ?? [],
    precioVenta: vivienda.precioVenta,
    superficieM2: vivienda.superficieM2,
    habitaciones: vivienda.habitaciones,
    banos: vivienda.banos ?? 0,
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
  const [procesandoEnlace, setProcesandoEnlace] = useState(false);
  const [ejemplosAbiertos, setEjemplosAbiertos] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState<Partial<BorradorVivienda> | null>(
    null,
  );
  const [camposTocados, setCamposTocados] = useState<Set<keyof BorradorVivienda>>(() =>
    vivienda === null
      ? new Set()
      : new Set(['esExterior', 'tieneTrastero', 'tieneGaraje'] as const),
  );
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

  function esCampoVacio(
    campo: keyof BorradorVivienda,
    valor: BorradorVivienda[keyof BorradorVivienda],
  ): boolean {
    return (
      valor === undefined ||
      valor === '' ||
      valor === 0 ||
      (valor === false && !camposTocados.has(campo)) ||
      (Array.isArray(valor) && valor.length === 0)
    );
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
      for (const [campo, valor] of Object.entries(patch) as Array<
        [keyof BorradorVivienda, BorradorVivienda[keyof BorradorVivienda]]
      >) {
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

  async function importarEnlaceIdealista() {
    setProcesandoEnlace(true);
    setErrorImportacion('');
    setResultadoImportacion('');
    try {
      const datos = await importarAnuncioIdealista(borrador.anuncioUrl);
      const fuente = detectarFuenteAnuncio(datos.url);
      const patch = mapImportedDataToExistingForm(
        normalizarAnuncioImportado(datos),
        '',
        fuente,
      ) as Partial<BorradorVivienda>;
      if (camposConConflicto(patch).length > 0) setConfirmarReemplazo(patch);
      else aplicarImportacion(patch, false);
    } catch (errorImportacionEnlace) {
      setErrorImportacion(
        errorImportacionEnlace instanceof Error
          ? errorImportacionEnlace.message
          : 'No se pudo importar el anuncio de Idealista.',
      );
    } finally {
      setProcesandoEnlace(false);
    }
  }

  async function importarCaptura(archivo: File | undefined) {
    if (archivo === undefined) return;
    setProcesandoCaptura(true);
    setErrorImportacion('');
    try {
      const texto = await textoDeCapturaInmobiliaria(archivo);
      if (texto === null)
        setErrorImportacion(
          'No se ha podido leer texto en la captura. Prueba con una imagen más nítida.',
        );
      else procesarImportacion(texto, null);
    } catch {
      setErrorImportacion(
        'No se ha podido ejecutar el OCR local. Prueba con una captura PNG o JPG más nítida.',
      );
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
          <p className="mt-1 text-xs leading-relaxed text-tinta-media">
            Importa capturas de anuncios de Fotocasa o Idealista.
          </p>
          <button
            type="button"
            disabled={procesandoCaptura || procesandoEnlace}
            onClick={() => {
              setErrorImportacion('');
              setResultadoImportacion('');
              inputCaptura.current?.click();
            }}
            className="mt-3 w-full rounded-medio border border-acento/35 bg-superficie px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-wait disabled:opacity-60"
          >
            {procesandoCaptura ? 'Leyendo captura…' : '📸 Importar captura'}
          </button>
          <input
            ref={inputCaptura}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void importarCaptura(e.target.files?.[0])}
          />
          <div aria-live="polite">
            {resultadoImportacion !== '' && (
              <p className="mt-2 text-xs font-medium text-comodo">{resultadoImportacion}</p>
            )}
            {errorImportacion !== '' && (
              <p className="mt-2 text-xs font-medium text-no-viable">{errorImportacion}</p>
            )}
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
              setBorrador((actual) => {
                const sinPortalAnterior = { ...actual };
                delete sinPortalAnterior.sourcePortal;
                return {
                  ...sinPortalAnterior,
                  anuncioUrl: enlace,
                  sourceUrl: fuente?.url ?? enlace,
                  sourceListingId: fuente?.listingId ?? '',
                  ...(fuente === null ? {} : { sourcePortal: fuente.portal }),
                };
              });
            }}
            placeholder="https://www.idealista.com/inmueble/..."
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <button
          type="button"
          disabled={procesandoEnlace || procesandoCaptura}
          onClick={() => void importarEnlaceIdealista()}
          className="-mt-2 rounded-medio border border-acento/35 bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-superficie-2 disabled:cursor-wait disabled:opacity-60"
        >
          {procesandoEnlace ? 'Importando anuncio…' : 'Importar datos del enlace de Idealista'}
        </button>
        <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
          Teléfono de contacto
          <input
            type="tel"
            inputMode="tel"
            value={borrador.telefono}
            onChange={(e) => setBorrador((actual) => ({ ...actual, telefono: e.target.value }))}
            placeholder="Ej. 600 123 456"
            className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
          />
        </label>
        <div className="grid grid-cols-1 gap-4">
          <InputMoneda
            id="vivienda-precio-venta"
            etiqueta="Precio de venta"
            valor={borrador.precioVenta}
            onChange={(precioVenta) => setBorrador((actual) => ({ ...actual, precioVenta }))}
          />
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
              Superficie m²
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
            <label className="flex flex-col gap-1 text-sm font-medium text-tinta">
              Baños
              <InputNumeroEntero
                id="vivienda-banos"
                valor={borrador.banos}
                minimo={0}
                maximo={100}
                onChange={(banos) => setBorrador((actual) => ({ ...actual, banos }))}
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm font-normal text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </label>
          </div>
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
            <label
              key={campo}
              className="flex cursor-pointer items-center gap-2.5 text-sm text-tinta"
            >
              <Interruptor
                activado={borrador[campo]}
                alCambiar={(e) => {
                  setCamposTocados((actual) => new Set(actual).add(campo));
                  setBorrador((actual) => ({ ...actual, [campo]: e.target.checked }));
                }}
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
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="truncate text-tinta">
                      {reforma.concepto === '' ? 'Partida sin nombre' : reforma.concepto}
                    </span>
                    <span className="font-cifra font-medium tabular-nums text-tinta">
                      {formatEuros(reforma.costeEstimado)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setBorrador((actual) => ({
                        ...actual,
                        reformas: actual.reformas.filter(
                          (actualReforma) => actualReforma.id !== reforma.id,
                        ),
                      }))
                    }
                    aria-label={`Eliminar reforma ${reforma.concepto === '' ? 'sin nombre' : reforma.concepto}`}
                    className="shrink-0 rounded-chico border border-no-viable px-2 py-1 text-xs font-medium text-no-viable hover:bg-no-viable/10"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {confirmarReemplazo !== null && (
          <div className="fixed inset-0 z-[60] flex items-end bg-tinta/30 p-3 sm:items-center sm:justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-reemplazo"
              className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado"
            >
              <h2 id="titulo-reemplazo" className="font-display text-xl text-tinta">
                Hay datos ya escritos
              </h2>
              <p className="mt-2 text-sm text-tinta-media">
                Se han encontrado datos que reemplazarían información existente.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    aplicarImportacion(confirmarReemplazo, false);
                    setConfirmarReemplazo(null);
                  }}
                  className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento"
                >
                  Completar solo campos vacíos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    aplicarImportacion(confirmarReemplazo, true);
                    setConfirmarReemplazo(null);
                  }}
                  className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta"
                >
                  Reemplazar con datos importados
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarReemplazo(null)}
                  className="px-4 py-2 text-sm text-tinta-media"
                >
                  Cancelar
                </button>
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
                Puedes importar una captura similar desde la galería o haciendo una captura de
                pantalla.
              </p>
              <div className="mt-4 grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2">
                <figure className="w-full max-w-[18rem] overflow-hidden rounded-medio border border-linea bg-superficie-2">
                  <img
                    src="./ejemplos-importacion/idealista-borroso.png"
                    alt="Ejemplo de captura de Idealista con datos borrosos"
                    className="h-auto w-full scale-[1.015] blur-[3px]"
                  />
                  <figcaption className="px-3 py-2 text-sm font-medium text-tinta">
                    Idealista
                  </figcaption>
                </figure>
                <figure className="w-full max-w-[18rem] overflow-hidden rounded-medio border border-linea bg-superficie-2">
                  <img
                    src="./ejemplos-importacion/fotocasa-borroso.png"
                    alt="Ejemplo de captura de Fotocasa con datos borrosos"
                    className="h-auto w-full scale-[1.015] blur-[3px]"
                  />
                  <figcaption className="px-3 py-2 text-sm font-medium text-tinta">
                    Fotocasa
                  </figcaption>
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
        <div className="rounded-chico bg-acento-tenue px-3 py-2 text-center text-sm text-tinta">
          <p className="font-medium">Coste de la vivienda (Precio + reformas)</p>
          <p className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-tinta">
            {formatEuros(addCents(borrador.precioVenta, totalReformas(borrador.reformas)))}
          </p>
        </div>
        {error !== '' && <p className="text-sm text-no-viable">{error}</p>}
        <div className="flex flex-wrap justify-center gap-3">
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

const CONFIG_ENCAJE_PLAN: Record<EstadoEncajePlanVivienda, { texto: string; clases: string }> = {
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
      className={`inline-flex rounded-chico border px-2 py-1 text-xs font-bold ${config.clases}`}
    >
      {estado === 'no_viable' && limitante === 'ingresos' ? 'No viable por ingresos' : config.texto}
    </span>
  );
}

function describirDiferenciaMonetaria(actual: Cents, referencia: Cents): string {
  if (actual === referencia) return 'El mismo importe';

  const diferencia =
    actual < referencia ? subtractCents(referencia, actual) : subtractCents(actual, referencia);
  return `${formatEuros(diferencia)} ${actual < referencia ? 'menos' : 'más'}`;
}

function describirDiferenciaPorM2(actual: number, referencia: number): string {
  if (Math.round(actual) === Math.round(referencia)) return 'El mismo coste por m²';

  return `${formatEntero(Math.abs(Math.round(actual - referencia)))} €/m² ${
    actual < referencia ? 'menos' : 'más'
  }`;
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
  const mejor = comparacion[0];
  const viviendasSinSuperficie = viviendas.length - comparacion.length;

  if (mejor === undefined) {
    return (
      <section className="rounded-grande border border-ajustado/35 bg-ajustado-tenue px-3 py-5 sm:px-4">
        <p className="rotulo mb-1 text-ajustado">Comparación pendiente</p>
        <h2 className="font-display text-xl text-tinta">Completa los metros cuadrados</h2>
        <p className="mt-2 text-sm leading-relaxed text-tinta-media">
          Necesitamos la superficie para calcular el coste completo por m². Sin ese dato no hay una
          comparación fiable.
        </p>
      </section>
    );
  }

  const esComparacionReal = comparacion.length >= 2;
  const hayCompraRecomendable = mejor.esRecomendable;
  const segundaRecomendable = comparacion.find(
    (resultado) => resultado.esRecomendable && resultado.vivienda.id !== mejor.vivienda.id,
  );
  const decisionAjustada =
    esComparacionReal &&
    segundaRecomendable !== undefined &&
    mejor.puntuacion - segundaRecomendable.puntuacion < 3;
  const faltaPresupuesto = mejor.encajePlan?.estado === 'sin_presupuesto';
  const evaluacion = mejor.encajePlan?.evaluacion ?? null;
  const alternativa = comparacion.find((resultado) => resultado.vivienda.id !== mejor.vivienda.id);

  return (
    <>
      <section
        className={`relative shrink-0 overflow-hidden rounded-grande border bg-superficie shadow-papel ${
          hayCompraRecomendable ? 'border-acento/35' : 'border-no-viable/35'
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-1 ${hayCompraRecomendable ? 'bg-acento' : 'bg-no-viable'}`}
          aria-hidden="true"
        />
        <div className="px-3 py-4 sm:px-4 sm:py-5">
          <div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className={`rotulo ${hayCompraRecomendable ? 'text-acento' : 'text-no-viable'}`}>
                  {!hayCompraRecomendable
                    ? 'Ninguna compra pasa el filtro financiero'
                    : faltaPresupuesto
                      ? 'Mejor valor provisional'
                      : !esComparacionReal
                        ? 'Análisis provisional'
                        : decisionAjustada
                          ? 'Decisión muy ajustada'
                          : 'Compra con mejor encaje'}
                </p>
                {esComparacionReal && hayCompraRecomendable && (
                  <span className="inline-flex rounded-chico bg-acento-tenue px-2 py-0.5 font-cifra text-sm font-bold tabular-nums text-acento">
                    {Math.round(mejor.puntuacion)}/100
                    <span className="ml-1 font-texto text-xs font-medium">valoración</span>
                  </span>
                )}
              </div>
              <div className="mt-1 min-w-0">
                <h2 className="min-w-0 truncate font-display text-lg leading-tight text-tinta">
                  {!hayCompraRecomendable
                    ? 'Revisa presupuesto, ingresos o ahorro'
                    : esComparacionReal
                      ? mejor.vivienda.nombre
                      : `Por ahora, ${mejor.vivienda.nombre}`}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onVerVivienda(mejor.vivienda.id)}
              className="mt-3 rounded-medio border border-linea px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
            >
              Ir al piso
            </button>
          </div>

          {!esComparacionReal && (
            <p className="mt-3 text-xs text-ajustado">
              Añade otra vivienda completa para confirmar la recomendación.
            </p>
          )}
          {!hayCompraRecomendable && (
            <p className="mt-3 text-sm leading-relaxed text-tinta-media">
              No señalamos una ganadora cuando todas son inviables, incumplen tus necesidades o ya
              no están disponibles. La primera se conserva solo como referencia comparativa.
            </p>
          )}
          {faltaPresupuesto && (
            <p className="mt-3 text-sm leading-relaxed text-ajustado">
              La cuota y el ahorro se han comprobado, pero falta tu precio objetivo; completa Mi
              plan para confirmar el veredicto.
            </p>
          )}
          {decisionAjustada && segundaRecomendable !== undefined && (
            <p className="mt-3 text-sm leading-relaxed text-tinta-media">
              La diferencia con {segundaRecomendable.vivienda.nombre} es inferior a 3 puntos. No hay
              una ganadora clara con los datos disponibles.
            </p>
          )}
          {viviendasSinSuperficie > 0 && (
            <p className="mt-2 text-xs text-tinta-media">
              {viviendasSinSuperficie === 1
                ? 'Hay 1 vivienda fuera de la comparación porque no tiene superficie.'
                : `Hay ${viviendasSinSuperficie} viviendas fuera de la comparación porque no tienen superficie.`}
            </p>
          )}
          <section className="mt-4 border-t border-linea pt-4">
            <h3 className="text-sm font-semibold text-tinta">Por qué esta valoración</h3>
            <p className="mt-1 text-sm leading-relaxed text-tinta-media">
              El coste completo por m² incluye precio, reforma, impuestos y gastos de compra. Se
              combina con el encaje de cuota y ahorro y con tus necesidades declaradas.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-tinta-suave">
              Una vivienda retirada, financieramente inviable o que incumple una necesidad mínima
              queda fuera de la recomendación, aunque sea la más barata.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-chico border border-linea px-3 py-2">
                <dt className="text-tinta-suave">Coste completo</dt>
                <dd className="mt-0.5 font-cifra text-sm font-bold text-tinta">
                  {formatEuros(mejor.costeTotal)}
                </dd>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <dt className="text-tinta-suave">Coste completo por m²</dt>
                <dd className="mt-0.5 font-cifra text-sm font-bold text-tinta">
                  {formatEntero(Math.round(mejor.costePorM2))} €/m²
                </dd>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <dt className="text-tinta-suave">Cuota estimada</dt>
                <dd className="mt-0.5 font-cifra text-sm font-bold text-tinta">
                  {evaluacion === null ? '—' : `${formatEuros(evaluacion.cuota)}/mes`}
                </dd>
              </div>
              <div className="rounded-chico border border-linea px-3 py-2">
                <dt className="text-tinta-suave">Efectivo recomendado</dt>
                <dd className="mt-0.5 font-cifra text-sm font-bold text-tinta">
                  {evaluacion === null ? '—' : formatEuros(evaluacion.dineroRecomendado)}
                </dd>
              </div>
            </dl>
            {alternativa !== undefined && (
              <div className="mt-3 rounded-medio border border-linea bg-superficie-2 px-3 py-3">
                <p className="text-xs font-semibold text-tinta">
                  Diferencia frente a {alternativa.vivienda.nombre}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-tinta-media sm:grid-cols-2">
                  <p>
                    Coste completo:{' '}
                    <strong className="font-cifra text-tinta">
                      {describirDiferenciaMonetaria(mejor.costeTotal, alternativa.costeTotal)}
                    </strong>
                  </p>
                  <p>
                    Coste por m²:{' '}
                    <strong className="font-cifra text-tinta">
                      {describirDiferenciaPorM2(mejor.costePorM2, alternativa.costePorM2)}
                    </strong>
                  </p>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
              {mejor.criteriosNecesidadesTotales > 0
                ? `Cumple ${mejor.criteriosNecesidadesCumplidos} de ${mejor.criteriosNecesidadesTotales} requisitos mínimos.`
                : 'No has definido requisitos mínimos.'}
            </p>
            {mejor.encajePlan !== null && (
              <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                {mejor.encajePlan.motivo}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
              Este veredicto no valora ubicación, estado estructural, cargas registrales, ruido ni
              calidad de la reforma: compruébalos antes de decidir.
            </p>
          </section>
        </div>
      </section>
    </>
  );
}

function Viviendas({ conPestanas = false }: { readonly conPestanas?: boolean }) {
  const { estado, actualizarEscenarioSimulador, actualizarViviendas } = useEstado();
  const navegar = useNavigate();
  const [analisisAbierto, setAnalisisAbierto] = useState(false);
  const [detalleAhorroViviendaId, setDetalleAhorroViviendaId] = useState<string | null>(null);
  const [detallePrecioViviendaId, setDetallePrecioViviendaId] = useState<string | null>(null);
  const [detalleBancoViviendaId, setDetalleBancoViviendaId] = useState<string | null>(null);
  const [viviendasExpandidas, setViviendasExpandidas] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const primeraViviendaId = estado.viviendas[0]?.id;
  const comparacionViviendas = useMemo(() => compararViviendas(estado.viviendas, estado), [estado]);

  function eliminar(id: string) {
    const viviendasRestantes = estado.viviendas.filter((vivienda) => vivienda.id !== id);
    actualizarViviendas(viviendasRestantes);
  }

  function verVivienda(id: string) {
    const indice = estado.viviendas.findIndex((vivienda) => vivienda.id === id);
    if (indice < 0) return;

    window.requestAnimationFrame(() => {
      const tarjeta = document.getElementById(`vivienda-${id}`);
      tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      tarjeta?.focus({ preventScroll: true });
    });
  }

  function verViviendaDesdeAnalisis(id: string) {
    setAnalisisAbierto(false);
    window.requestAnimationFrame(() => verVivienda(id));
  }

  return (
    <div
      className={[
        'fixed inset-x-4 bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-4 lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]',
        conPestanas
          ? 'top-[calc(3.75rem+1.5rem+3.25rem)] lg:top-36'
          : 'top-[calc(3.75rem+1.5rem)] lg:top-24',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center justify-between">
        {estado.viviendas.length > 0 && (
          <button
            type="button"
            onClick={() => setAnalisisAbierto(true)}
            className="analizar-recorrido inline-flex items-center gap-2 rounded-medio border border-linea bg-superficie px-4 py-2 text-sm font-medium text-acento hover:bg-acento-tenue"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="h-4 w-4 fill-none stroke-current stroke-2"
            >
              <circle cx="8.5" cy="8.5" r="4.75" />
              <path d="m12 12 4.5 4.5" strokeLinecap="round" />
              <path d="M8.5 6.25v4.5M6.25 8.5h4.5" strokeLinecap="round" />
            </svg>
            Analizar
          </button>
        )}
        <button
          type="button"
          onClick={() => void navegar('/ofertas/vivienda')}
          className="ml-auto rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
        >
          + Añadir inmueble
        </button>
      </div>

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
        <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 pb-1">
            {estado.viviendas.map((vivienda) => {
              const {
                costeReforma,
                gastosCompra,
                costeTotal: precioTotal,
              } = calcularCosteVivienda(vivienda, estado);
              const notariaRegistroTasacion = sumCents([
                estado.gastos.notariaCompraventa,
                estado.gastos.registroCompraventa,
                estado.gastos.tasacion,
              ]);
              const otrosGastosCompra = maxCents(
                ZERO,
                subtractCents(
                  gastosCompra.total,
                  sumCents([
                    costeReforma,
                    gastosCompra.impuestos,
                    notariaRegistroTasacion,
                    gastosCompra.inmobiliaria,
                  ]),
                ),
              );
              const encajePlan = evaluarEncajePlanVivienda(vivienda, estado);
              const hipotecasVivienda = estado.ofertas.filter(
                (oferta) =>
                  oferta.viviendaId === vivienda.id ||
                  (oferta.viviendaId === undefined && vivienda.id === primeraViviendaId),
              );
              const hipotecasAplicables = hipotecasVivienda.filter(
                (oferta) =>
                  oferta.estado !== 'rechazada' &&
                  oferta.escenario.precioCompra === vivienda.precioVenta,
              );
              let entradaMinima: Cents | null = null;
              let mejorCuotaMensual: Cents | null = null;
              let menorPagoBanco: Cents | null = null;
              let menorCosteReal: Cents | null = null;
              let costesInicialesHipoteca = ZERO;
              let desgloseMejorBanco: {
                capital: Cents;
                intereses: Cents;
                comisionApertura: Cents;
                total: Cents;
              } | null = null;
              for (const hipoteca of hipotecasAplicables) {
                const entrada = maxCents(
                  ZERO,
                  subtractCents(
                    hipoteca.escenario.precioCompra,
                    hipoteca.escenario.importeSolicitado,
                  ),
                );
                const metricasHipoteca = calcularMetricasOferta(hipoteca);
                const cuota = metricasHipoteca.cuotaInicial;
                const flujoHipoteca = construirFlujoDeCaja(
                  flujoInputDesdeEscenario(hipoteca.escenario),
                );
                const capital = sumCents(flujoHipoteca.slice(1).map((linea) => linea.principal));
                const intereses = sumCents(flujoHipoteca.slice(1).map((linea) => linea.intereses));
                const comisionApertura = flujoHipoteca[0]?.comisiones ?? ZERO;
                const pagoBanco = addCents(
                  sumCents(flujoHipoteca.slice(1).map((linea) => linea.cuota)),
                  comisionApertura,
                );
                if (menorCosteReal === null || metricasHipoteca.costeRealTotal < menorCosteReal) {
                  entradaMinima = entrada;
                  mejorCuotaMensual = cuota;
                  menorPagoBanco = pagoBanco;
                  menorCosteReal = metricasHipoteca.costeRealTotal;
                  costesInicialesHipoteca = maxCents(
                    ZERO,
                    subtractCents(metricasHipoteca.desembolsoInicial, entrada),
                  );
                  desgloseMejorBanco = { capital, intereses, comisionApertura, total: pagoBanco };
                }
              }
              const entradaEstimada = maxCents(
                ZERO,
                subtractCents(
                  vivienda.precioVenta,
                  multiplyCents(vivienda.precioVenta, estado.ajustes.ltvPorDefecto),
                ),
              );
              const escenarioAproximado: EscenarioHipoteca = {
                ...ESTADO_INICIAL.escenarioSimulador,
                id: `aproximada-${vivienda.id}`,
                titulo: 'Simulación aproximada',
                precioCompra: vivienda.precioVenta,
                valorTasacion: vivienda.precioVenta,
                ltv: estado.ajustes.ltvPorDefecto,
                importeSolicitado: multiplyCents(
                  vivienda.precioVenta,
                  estado.ajustes.ltvPorDefecto,
                ),
                plazoAnios: estado.ajustes.plazoPorDefecto,
                tinFijo: estado.ajustes.tinPorDefecto,
              };
              const flujoAproximado = construirFlujoDeCaja(
                flujoInputDesdeEscenario(escenarioAproximado),
              );
              const cuotaAproximada = flujoAproximado[1]?.cuota ?? ZERO;
              const totalAproximado = addCents(
                sumCents(flujoAproximado.slice(1).map((linea) => linea.cuota)),
                flujoAproximado[0]?.comisiones ?? ZERO,
              );
              const entradaNecesaria = entradaMinima ?? entradaEstimada;
              const totalNecesario = sumCents([
                entradaNecesaria,
                costesInicialesHipoteca,
                gastosCompra.total,
              ]);
              const faltaPorReunir = maxCents(
                ZERO,
                subtractCents(totalNecesario, estado.perfil.ahorrosActuales),
              );
              const porcentajeAhorros =
                totalNecesario <= ZERO
                  ? 0
                  : Math.min(
                      100,
                      Math.round((estado.perfil.ahorrosActuales / totalNecesario) * 100),
                    );
              return (
                <article
                  id={`vivienda-${vivienda.id}`}
                  key={vivienda.id}
                  tabIndex={-1}
                  className={`relative mt-5 rounded-grande border border-linea bg-superficie px-3 py-4 shadow-papel sm:px-4 sm:py-5 ${
                    encajePlan.estado === 'no_viable' ? 'border-l-4 border-no-viable' : ''
                  }`}
                >
                  <span
                    className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-acento/30 bg-acento-tenue text-acento shadow-papel"
                    aria-hidden="true"
                  >
                    <Icono nombre="casa" tamano={21} />
                  </span>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <BadgeEncajePlan
                        estado={encajePlan.estado}
                        limitante={encajePlan.limitante}
                      />
                      <div className="flex gap-1.5">
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
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-display text-lg leading-snug text-tinta">
                          {vivienda.nombre}
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-tinta-media">{vivienda.direccion}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {vivienda.origenInmobiliaria !== undefined && (
                      <span className="inline-flex rounded-chico border border-acento/25 bg-acento-tenue px-1.5 py-0.5 text-[0.6875rem] font-semibold text-acento">
                        Ofrecida por {vivienda.origenInmobiliaria}
                      </span>
                    )}
                    {vivienda.yaNoDisponible === true && (
                      <span className="inline-flex rounded-chico border border-revisar/35 bg-revisar-tenue px-1.5 py-0.5 text-[0.6875rem] font-semibold text-revisar">
                        Ya no disponible
                      </span>
                    )}
                    <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                      {vivienda.superficieM2 > 0
                        ? `${vivienda.superficieM2} m²`
                        : 'Superficie pendiente'}
                    </span>
                    {vivienda.habitaciones > 0 && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        {vivienda.habitaciones} habit.
                      </span>
                    )}
                    {(vivienda.banos ?? 0) > 0 && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        {vivienda.banos} baños
                      </span>
                    )}
                    {vivienda.esExterior && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        Exterior
                      </span>
                    )}
                    {vivienda.tieneTrastero && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        Trastero
                      </span>
                    )}
                    {vivienda.tieneGaraje && (
                      <span className="inline-flex rounded-chico border border-linea bg-superficie-2 px-1.5 py-0.5 text-[0.6875rem] font-medium text-tinta-media">
                        Garaje
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-medio border border-linea bg-superficie-2 text-sm">
                    <div className="min-w-0 px-3 py-2.5">
                      <dt className="text-[0.6875rem] font-medium text-tinta-media">Precio</dt>
                      <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
                        {formatEuros(vivienda.precioVenta)}
                      </dd>
                    </div>
                    <div className="min-w-0 border-l border-linea px-3 py-2.5">
                      <dt className="text-[0.6875rem] font-medium text-tinta-media">Precio/m²</dt>
                      <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
                        {vivienda.superficieM2 > 0
                          ? precioPorM2Formateado(
                              vivienda.precioVenta / 100 / vivienda.superficieM2,
                            )
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <section className="mt-3 rounded-medio border border-linea bg-superficie-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-tinta-media">Precio total</p>
                      <button
                        type="button"
                        onClick={() => setDetallePrecioViviendaId(vivienda.id)}
                        className="rounded-chico border border-linea bg-superficie px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-acento-tenue"
                      >
                        Ver detalles
                      </button>
                    </div>
                    <p className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-tinta sm:text-xl">
                      {formatEuros(precioTotal)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-tinta-media">
                      Precio, reforma, impuestos y todos los gastos de compra configurados.
                    </p>
                  </section>
                  {!viviendasExpandidas.has(vivienda.id) && (
                    <>
                      {vivienda.telefono !== undefined && vivienda.telefono !== '' && (
                        <a
                          href={`tel:${vivienda.telefono.replace(/[^+\d]/g, '')}`}
                          className="mt-3 inline-flex w-full justify-center rounded-medio bg-acento px-3 py-2 text-sm font-semibold text-sobre-acento hover:bg-acento/90"
                        >
                          Llamar {vivienda.telefono}
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setViviendasExpandidas((actual) => {
                            const siguiente = new Set(actual);
                            if (siguiente.has(vivienda.id)) siguiente.delete(vivienda.id);
                            else siguiente.add(vivienda.id);
                            return siguiente;
                          })
                        }
                        aria-expanded={viviendasExpandidas.has(vivienda.id)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-medio px-3 py-2.5 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue"
                      >
                        {viviendasExpandidas.has(vivienda.id)
                          ? 'Ver menos detalles'
                          : 'Ver más detalles'}
                        <span aria-hidden="true">
                          {viviendasExpandidas.has(vivienda.id) ? '↑' : '↓'}
                        </span>
                      </button>
                    </>
                  )}
                  {viviendasExpandidas.has(vivienda.id) && (
                    <>
                      {hipotecasAplicables.length === 0 ? (
                        <section className="mt-3 overflow-hidden rounded-medio border border-ajustado/35 bg-ajustado-tenue">
                          <div className="px-3 py-2">
                            <p className="rotulo text-ajustado">Simulación aproximada</p>
                          </div>
                          <dl className="grid grid-cols-2 border-t border-ajustado/20 bg-superficie text-sm">
                            <div className="min-w-0 px-3 py-2.5">
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Entrada aproximada
                              </dt>
                              <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
                                {formatEuros(entradaEstimada)}
                              </dd>
                            </div>
                            <div className="min-w-0 border-l border-linea px-3 py-2.5">
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Cuota aproximada
                              </dt>
                              <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-ajustado sm:text-lg">
                                {formatEuros(cuotaAproximada)}
                                <span className="ml-0.5 text-xs font-medium text-tinta-media">
                                  /mes
                                </span>
                              </dd>
                            </div>
                          </dl>
                          <div className="border-t border-ajustado/20 bg-ajustado-tenue px-3 py-3">
                            <p className="text-xs font-medium text-tinta-media">Total aproximado</p>
                            <p className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-acento sm:text-xl">
                              {formatEuros(totalAproximado)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              actualizarEscenarioSimulador(escenarioAproximado);
                              void navegar(
                                `/hipoteca/simulador?guardar=1&vivienda=${encodeURIComponent(vivienda.id)}`,
                              );
                            }}
                            className="w-full border-t border-ajustado/20 bg-superficie px-3 py-2.5 text-sm font-semibold text-ajustado hover:bg-ajustado-tenue"
                          >
                            Registrar hipoteca real →
                          </button>
                        </section>
                      ) : (
                        <section className="mt-3 overflow-hidden rounded-medio border border-acento/25 bg-acento-tenue">
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <p className="rotulo text-acento">Mejor Hipoteca</p>
                            <span className="text-xs font-medium text-tinta-media">
                              {hipotecasAplicables.length === 0
                                ? 'Pendiente'
                                : `${hipotecasAplicables.length} ${hipotecasAplicables.length === 1 ? 'oferta' : 'ofertas'}`}
                            </span>
                          </div>
                          <dl className="grid grid-cols-2 border-t border-acento/20 bg-superficie text-sm">
                            <div className="min-w-0 px-3 py-2.5">
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Entrada
                              </dt>
                              <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
                                {entradaMinima === null ? '—' : formatEuros(entradaMinima)}
                              </dd>
                            </div>
                            <div className="min-w-0 border-l border-linea px-3 py-2.5">
                              <dt className="text-[0.6875rem] font-medium text-tinta-media">
                                Cuota mensual
                              </dt>
                              <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
                                {mejorCuotaMensual === null ? '—' : formatEuros(mejorCuotaMensual)}
                                {mejorCuotaMensual !== null && (
                                  <span className="ml-0.5 text-xs font-medium text-tinta-media">
                                    /mes
                                  </span>
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="border-t border-acento/20 bg-acento-tenue px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-medium text-tinta-media">
                                Total pagado al banco
                              </p>
                              <button
                                type="button"
                                onClick={() => setDetalleBancoViviendaId(vivienda.id)}
                                disabled={desgloseMejorBanco === null}
                                className="rounded-chico border border-acento/30 bg-superficie px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-superficie-2 disabled:cursor-default disabled:opacity-50"
                              >
                                Ver detalles
                              </button>
                            </div>
                            <p className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-acento sm:text-xl">
                              {menorPagoBanco === null ? '—' : formatEuros(menorPagoBanco)}
                            </p>
                            <p className="mt-0.5 text-xs text-tinta-media">
                              Cuotas, intereses y comisión de apertura.
                            </p>
                          </div>
                        </section>
                      )}
                      <section className="mt-3 rounded-medio border border-linea bg-superficie-2 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="rotulo text-acento">Lo que te falta</p>
                          <button
                            type="button"
                            onClick={() => setDetalleAhorroViviendaId(vivienda.id)}
                            className="rounded-chico border border-acento/30 bg-superficie px-2.5 py-1.5 text-xs font-semibold text-acento hover:bg-superficie-2"
                          >
                            Ver detalles
                          </button>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-3">
                          <p className="text-xs font-medium text-tinta-media">Total necesario</p>
                          <p className="font-cifra text-sm font-bold tabular-nums text-tinta">
                            {formatEuros(totalNecesario)}
                          </p>
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Ahorros reunidos para este inmueble"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={porcentajeAhorros}
                          className="mt-2 h-3 overflow-hidden rounded-full bg-linea"
                        >
                          <div
                            className="flex h-full items-center justify-center rounded-full bg-acento text-[0.625rem] font-bold leading-none text-sobre-acento"
                            style={{ width: `${porcentajeAhorros}%` }}
                          >
                            {porcentajeAhorros >= 18 ? `${porcentajeAhorros} %` : ''}
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <dt className="text-xs font-medium text-tinta-media">Tienes</dt>
                            <dd className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-acento">
                              {formatEuros(estado.perfil.ahorrosActuales)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-tinta-media">Te falta</dt>
                            <dd className="mt-0.5 font-cifra text-lg font-bold tabular-nums text-no-viable">
                              {formatEuros(faltaPorReunir)}
                            </dd>
                          </div>
                        </dl>
                      </section>
                      {vivienda.reformas.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-tinta">Reformas</p>
                          <ul className="mt-1 space-y-1 text-sm text-tinta-media">
                            {vivienda.reformas.map((reforma) => (
                              <li key={reforma.id} className="flex justify-between gap-3">
                                <span>
                                  {reforma.concepto === ''
                                    ? 'Partida sin nombre'
                                    : reforma.concepto}
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
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          {vivienda.anuncioUrl !== '' && (
                            <a
                              href={vivienda.anuncioUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex text-sm font-semibold text-acento hover:underline"
                            >
                              Ver anuncio original ↗
                            </a>
                          )}
                        </div>
                      </div>
                      {vivienda.telefono !== undefined && vivienda.telefono !== '' && (
                        <a
                          href={`tel:${vivienda.telefono.replace(/[^+\d]/g, '')}`}
                          className="mt-3 inline-flex w-full justify-center rounded-medio bg-acento px-3 py-2 text-sm font-semibold text-sobre-acento hover:bg-acento/90"
                        >
                          Llamar {vivienda.telefono}
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setViviendasExpandidas((actual) => {
                            const siguiente = new Set(actual);
                            siguiente.delete(vivienda.id);
                            return siguiente;
                          })
                        }
                        aria-expanded="true"
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-medio px-3 py-2.5 text-sm font-semibold text-acento transition-colors hover:bg-acento-tenue"
                      >
                        Ver menos detalles <span aria-hidden="true">↑</span>
                      </button>
                    </>
                  )}
                  {detalleBancoViviendaId === vivienda.id && desgloseMejorBanco !== null && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 py-4">
                      <button
                        type="button"
                        aria-label="Cerrar desglose del pago al banco"
                        onClick={() => setDetalleBancoViviendaId(null)}
                        className="absolute inset-0"
                      />
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`titulo-detalle-banco-${vivienda.id}`}
                        className="relative w-full max-w-sm rounded-grande bg-superficie p-5 shadow-elevado"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="rotulo text-acento">Mejor hipoteca</p>
                            <h2
                              id={`titulo-detalle-banco-${vivienda.id}`}
                              className="mt-1 font-display text-xl text-tinta"
                            >
                              Total pagado al banco
                            </h2>
                          </div>
                          <button
                            type="button"
                            aria-label="Cerrar"
                            onClick={() => setDetalleBancoViviendaId(null)}
                            className="rounded-chico px-2 py-1 text-xl leading-none text-tinta-media hover:bg-superficie-2"
                          >
                            ×
                          </button>
                        </div>
                        <dl className="mt-4 divide-y divide-linea rounded-medio border border-linea px-3 text-sm">
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Capital prestado</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(desgloseMejorBanco.capital)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Intereses</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(desgloseMejorBanco.intereses)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Comisión de apertura</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(desgloseMejorBanco.comisionApertura)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-4 rounded-medio bg-acento-tenue px-3 py-3 text-center">
                          <p className="rotulo text-acento">Total pagado al banco</p>
                          <p className="mt-1 font-cifra text-xl font-bold tabular-nums text-acento">
                            {formatEuros(desgloseMejorBanco.total)}
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                  {detallePrecioViviendaId === vivienda.id && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 py-4">
                      <button
                        type="button"
                        aria-label="Cerrar desglose del precio total"
                        onClick={() => setDetallePrecioViviendaId(null)}
                        className="absolute inset-0"
                      />
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`titulo-detalle-precio-${vivienda.id}`}
                        className="relative w-full max-w-sm rounded-grande bg-superficie p-5 shadow-elevado"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="rotulo text-acento">Desglose real</p>
                            <h2
                              id={`titulo-detalle-precio-${vivienda.id}`}
                              className="mt-1 font-display text-xl text-tinta"
                            >
                              Precio total
                            </h2>
                          </div>
                          <button
                            type="button"
                            aria-label="Cerrar"
                            onClick={() => setDetallePrecioViviendaId(null)}
                            className="rounded-chico px-2 py-1 text-xl leading-none text-tinta-media hover:bg-superficie-2"
                          >
                            ×
                          </button>
                        </div>
                        <dl className="mt-4 divide-y divide-linea rounded-medio border border-linea px-3 text-sm">
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Precio</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(vivienda.precioVenta)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Reformas</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(costeReforma)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Impuestos</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(gastosCompra.impuestos)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Notaría</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(estado.gastos.notariaCompraventa)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Registro</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(estado.gastos.registroCompraventa)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Tasación</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(estado.gastos.tasacion)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Inmobiliaria</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(gastosCompra.inmobiliaria)}
                            </dd>
                          </div>
                          {otrosGastosCompra > ZERO && (
                            <div className="flex items-center justify-between gap-3 py-2.5">
                              <dt className="text-tinta-media">Gestoría y otros gastos</dt>
                              <dd className="font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(otrosGastosCompra)}
                              </dd>
                            </div>
                          )}
                        </dl>
                        <div className="mt-4 rounded-medio bg-acento-tenue px-3 py-3 text-center">
                          <p className="rotulo text-acento">Precio total</p>
                          <p className="mt-1 font-cifra text-xl font-bold tabular-nums text-acento">
                            {formatEuros(precioTotal)}
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                  {detalleAhorroViviendaId === vivienda.id && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 py-4">
                      <button
                        type="button"
                        aria-label="Cerrar detalles del dinero a reunir"
                        onClick={() => setDetalleAhorroViviendaId(null)}
                        className="absolute inset-0"
                      />
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`titulo-detalle-ahorro-${vivienda.id}`}
                        className="relative w-full max-w-sm rounded-grande bg-superficie p-5 shadow-elevado"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="rotulo text-acento">Lo que te falta</p>
                            <h2
                              id={`titulo-detalle-ahorro-${vivienda.id}`}
                              className="mt-1 font-display text-xl text-tinta"
                            >
                              {vivienda.nombre}
                            </h2>
                          </div>
                          <button
                            type="button"
                            aria-label="Cerrar"
                            onClick={() => setDetalleAhorroViviendaId(null)}
                            className="rounded-chico px-2 py-1 text-xl leading-none text-tinta-media hover:bg-superficie-2"
                          >
                            ×
                          </button>
                        </div>
                        <dl className="mt-4 divide-y divide-linea rounded-medio border border-linea px-3 text-sm">
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Entrada</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(entradaNecesaria)}
                            </dd>
                          </div>
                          {costesInicialesHipoteca > ZERO && (
                            <div className="flex items-center justify-between gap-3 py-2.5">
                              <dt className="text-tinta-media">
                                Comisión y vinculaciones iniciales
                              </dt>
                              <dd className="font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(costesInicialesHipoteca)}
                              </dd>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Impuestos</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(gastosCompra.impuestos)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Notaría, registro y tasación</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(notariaRegistroTasacion)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <dt className="text-tinta-media">Inmobiliaria</dt>
                            <dd className="font-cifra font-semibold tabular-nums text-tinta">
                              {formatEuros(gastosCompra.inmobiliaria)}
                            </dd>
                          </div>
                          {costeReforma > ZERO && (
                            <div className="flex items-center justify-between gap-3 py-2.5">
                              <dt className="text-tinta-media">Reforma</dt>
                              <dd className="font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(costeReforma)}
                              </dd>
                            </div>
                          )}
                          {otrosGastosCompra > ZERO && (
                            <div className="flex items-center justify-between gap-3 py-2.5">
                              <dt className="text-tinta-media">Gestoría y otros gastos</dt>
                              <dd className="font-cifra font-semibold tabular-nums text-tinta">
                                {formatEuros(otrosGastosCompra)}
                              </dd>
                            </div>
                          )}
                        </dl>
                        <div className="mt-4 rounded-medio bg-acento-tenue px-3 py-3 text-center">
                          <p className="rotulo text-acento">Total</p>
                          <p className="mt-1 font-cifra text-sm font-semibold tabular-nums text-tinta-media">
                            {formatEuros(totalNecesario)} −{' '}
                            {formatEuros(estado.perfil.ahorrosActuales)}
                          </p>
                          <p className="mt-1 font-cifra text-xl font-bold tabular-nums text-acento">
                            = {formatEuros(faltaPorReunir)}
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {analisisAbierto &&
        createPortal(
          <div className="fixed inset-x-0 top-[3.75rem] bottom-0 z-[60] flex items-center justify-center bg-tinta/30 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:inset-0 lg:p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-analisis-viviendas"
              className="max-h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom))] w-full max-w-xl overflow-y-auto rounded-grande bg-superficie p-5 shadow-elevado lg:max-h-[90dvh]"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="rotulo mb-1">Tus inmuebles</p>
                  <h2 id="titulo-analisis-viviendas" className="font-display text-xl text-tinta">
                    Análisis de viviendas
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setAnalisisAbierto(false)}
                  aria-label="Cerrar análisis"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medio border border-linea text-lg text-tinta-media hover:bg-superficie-2"
                >
                  ×
                </button>
              </div>
              <RecomendacionVivienda
                viviendas={estado.viviendas}
                comparacion={comparacionViviendas}
                onVerVivienda={verViviendaDesdeAnalisis}
              />
              <div className="mt-4 border-t border-linea pt-4">
                <button
                  type="button"
                  onClick={() => setAnalisisAbierto(false)}
                  className="min-h-toque w-full rounded-medio border border-linea bg-superficie px-4 py-2 text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2"
                >
                  Cerrar análisis
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

type PestanaOfertas = 'inmobiliaria' | 'favoritos';

function inmobiliariaDesdeApi(inmobiliaria: InmobiliariaApi, codigo: string): InmobiliariaDemo {
  return {
    id: inmobiliaria.id,
    nombre: inmobiliaria.name,
    marca: inmobiliaria.brand,
    codigo,
  };
}

function viviendaCatalogoDesdeApi(vivienda: ViviendaCatalogoApi): ViviendaCatalogoDemo {
  return {
    id: vivienda.id,
    nombre: vivienda.title,
    precioVenta: vivienda.price_cents as Cents,
    zona: vivienda.zone,
    superficieM2: vivienda.area_m2,
    habitaciones: vivienda.bedrooms,
    banos: vivienda.bathrooms,
    imagenUrl: vivienda.main_image_url,
    anuncioUrl: vivienda.listing_url,
    descripcion: vivienda.description,
    tieneGaraje: false,
    tieneTrastero: false,
  };
}

function MiInmobiliaria({ conPestanas }: { readonly conPestanas: boolean }) {
  const { estado, actualizarInmobiliariaActivaDemo, actualizarViviendas } = useEstado();
  const usandoApi = apiHipotecasConfigurada();
  const [mostrarCodigo, setMostrarCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [inmobiliariaPendiente, setInmobiliariaPendiente] = useState<InmobiliariaDemo | null>(null);
  const [errorCodigo, setErrorCodigo] = useState('');
  const [comprobandoCodigo, setComprobandoCodigo] = useState(false);
  const [catalogoRemoto, setCatalogoRemoto] = useState<readonly ViviendaCatalogoDemo[]>([]);
  const [inmobiliariaRemota, setInmobiliariaRemota] = useState<InmobiliariaDemo | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState('');
  const [indiceCatalogoActivo, setIndiceCatalogoActivo] = useState(0);
  const inmobiliaria = usandoApi
    ? (inmobiliariaRemota ?? undefined)
    : estado.inmobiliariaActivaDemo;
  const catalogo = usandoApi ? catalogoRemoto : VIVIENDAS_CATALOGO_DEMO;

  useEffect(() => {
    if (!usandoApi || tokenSesionApi() === null) return;

    let cancelado = false;
    void catalogoApi()
      .then(({ agency, properties }) => {
        if (cancelado) return;
        const siguienteInmobiliaria = agency === null ? null : inmobiliariaDesdeApi(agency, '');
        const siguienteCatalogo = properties.map(viviendaCatalogoDesdeApi);
        setInmobiliariaRemota(siguienteInmobiliaria);
        setCatalogoRemoto(siguienteCatalogo);
        setErrorCatalogo('');
        if (siguienteInmobiliaria === null) guardarCodigoInmobiliariaApi(null);
        else {
          actualizarViviendas((actuales) =>
            sincronizarFavoritosCatalogo(
              actuales,
              siguienteCatalogo,
              siguienteInmobiliaria,
              fechaLocalISO(),
            ),
          );
        }
        actualizarInmobiliariaActivaDemo(
          siguienteInmobiliaria === null
            ? null
            : {
                id: siguienteInmobiliaria.id,
                nombre: siguienteInmobiliaria.nombre,
                marca: siguienteInmobiliaria.marca,
              },
        );
      })
      .catch((error: unknown) => {
        if (cancelado) return;
        setErrorCatalogo(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.');
      });
    return () => {
      cancelado = true;
    };
  }, [actualizarInmobiliariaActivaDemo, actualizarViviendas, usandoApi]);

  function abrirCodigo() {
    setCodigo('');
    setErrorCodigo('');
    setInmobiliariaPendiente(null);
    setMostrarCodigo(true);
  }

  async function comprobarCodigo() {
    if (usandoApi) {
      setComprobandoCodigo(true);
      try {
        const { agency } = await previsualizarCodigoInmobiliariaApi(codigo);
        setErrorCodigo('');
        setInmobiliariaPendiente(inmobiliariaDesdeApi(agency, codigo));
      } catch (error) {
        setInmobiliariaPendiente(null);
        setErrorCodigo(error instanceof Error ? error.message : 'No se pudo comprobar el código.');
      } finally {
        setComprobandoCodigo(false);
      }
      return;
    }
    if (codigo.trim().toUpperCase() === INMOBILIARIA_DEMO.codigo) {
      setErrorCodigo('');
      setInmobiliariaPendiente(INMOBILIARIA_DEMO);
      return;
    }
    setInmobiliariaPendiente(null);
    setErrorCodigo(
      'No encontramos ese código. Prueba con CASA-7K3P para recorrer la demostración.',
    );
  }

  async function vincularInmobiliaria() {
    if (inmobiliariaPendiente === null) return;
    if (usandoApi) {
      setComprobandoCodigo(true);
      try {
        const codigoNormalizado = codigo.trim().toUpperCase();
        const { agency } = await canjearCodigoInmobiliariaApi(codigoNormalizado);
        const vinculada = inmobiliariaDesdeApi(agency, codigoNormalizado);
        guardarCodigoInmobiliariaApi(null);
        setInmobiliariaRemota(vinculada);
        actualizarInmobiliariaActivaDemo({
          id: vinculada.id,
          nombre: vinculada.nombre,
          marca: vinculada.marca,
        });
        setIndiceCatalogoActivo(0);
        setMostrarCodigo(false);
        try {
          const catalogoActualizado = await catalogoApi();
          const viviendasCatalogo = catalogoActualizado.properties.map(viviendaCatalogoDesdeApi);
          setCatalogoRemoto(viviendasCatalogo);
          actualizarViviendas((actuales) =>
            sincronizarFavoritosCatalogo(actuales, viviendasCatalogo, vinculada, fechaLocalISO()),
          );
          setErrorCatalogo('');
        } catch (error) {
          setCatalogoRemoto([]);
          setErrorCatalogo(
            error instanceof Error ? error.message : 'No se pudo cargar el catálogo.',
          );
        }
      } catch (error) {
        setErrorCodigo(
          error instanceof Error ? error.message : 'No se pudo vincular la inmobiliaria.',
        );
      } finally {
        setComprobandoCodigo(false);
      }
      return;
    }
    actualizarInmobiliariaActivaDemo({
      id: inmobiliariaPendiente.id,
      nombre: inmobiliariaPendiente.nombre,
      marca: inmobiliariaPendiente.marca,
    });
    setIndiceCatalogoActivo(0);
    setMostrarCodigo(false);
  }

  async function anadirAFavoritos(idCatalogo: string) {
    const vivienda = catalogo.find((candidata) => candidata.id === idCatalogo);
    if (vivienda === undefined || inmobiliaria === undefined) return;
    if (estado.viviendas.some((guardada) => guardada.catalogoViviendaId === vivienda.id)) return;

    try {
      if (usandoApi) {
        try {
          await anadirFavoritoCatalogoApi(vivienda.id);
        } catch (error) {
          // El favorito remoto puede sobrevivir a una eliminación o a otra
          // instalación. Un 409 permite reconstruir la copia local.
          if (!(error instanceof ErrorHipotecasApi) || error.status !== 409) throw error;
        }
      }
      const favorita = viviendaFavoritaDesdeCatalogo(vivienda, inmobiliaria, fechaLocalISO());
      actualizarViviendas((actuales) =>
        actuales.some((guardada) => guardada.catalogoViviendaId === vivienda.id)
          ? actuales
          : [...actuales, favorita],
      );
      setErrorCatalogo('');
    } catch (error) {
      setErrorCatalogo(
        error instanceof Error ? error.message : 'No se pudo añadir la vivienda a favoritos.',
      );
    }
  }

  async function desvincularInmobiliaria() {
    try {
      if (usandoApi) await desvincularInmobiliariaApi();
      guardarCodigoInmobiliariaApi(null);
      setInmobiliariaRemota(null);
      setCatalogoRemoto([]);
      actualizarInmobiliariaActivaDemo(null);
      setErrorCatalogo('');
    } catch (error) {
      setErrorCatalogo(
        error instanceof Error ? error.message : 'No se pudo desvincular la inmobiliaria.',
      );
    }
  }

  const indiceCatalogoVisible = Math.min(indiceCatalogoActivo, Math.max(catalogo.length - 1, 0));

  return (
    <div
      className={[
        'fixed inset-x-4 bottom-[calc(3.75rem+1rem+env(safe-area-inset-bottom))] overflow-y-auto lg:right-10 lg:bottom-8 lg:left-[calc(17rem+2.5rem)]',
        mostrarCodigo ? 'z-30' : 'z-10',
        conPestanas
          ? 'top-[calc(3.75rem+1.5rem+3.25rem)] lg:top-36'
          : 'top-[calc(3.75rem+1.5rem)] lg:top-24',
      ].join(' ')}
    >
      {inmobiliaria === undefined ? (
        <section className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-grande bg-acento-tenue font-display text-lg font-bold text-acento">
            SOL
          </span>
          <p className="rotulo mt-5">Catálogo de confianza</p>
          <h2 className="mt-1 font-display text-2xl text-tinta">
            Aún no tienes una inmobiliaria vinculada
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-tinta-media">
            Introduce el código que te haya facilitado tu agente para ver las viviendas publicadas y
            guardarlas en tus favoritos.
          </p>
          <button
            type="button"
            onClick={abrirCodigo}
            className="mt-6 rounded-medio bg-acento px-4 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90"
          >
            + Añadir inmobiliaria
          </button>
          {!usandoApi && (
            <p className="mt-3 text-xs text-tinta-suave">Demostración: usa el código CASA-7K3P.</p>
          )}
        </section>
      ) : (
        <div className="mx-auto max-w-5xl pb-6">
          <header className="flex flex-col justify-between gap-4 rounded-grande border border-linea bg-superficie px-3 py-4 shadow-papel sm:flex-row sm:items-center sm:px-4 sm:py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-medio bg-acento font-display text-sm font-bold text-sobre-acento">
                {inmobiliaria.marca}
              </span>
              <div>
                <p className="rotulo">Mi inmobiliaria</p>
                <h2 className="font-display text-xl text-tinta">{inmobiliaria.nombre}</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={abrirCodigo}
                className="rounded-medio border border-linea px-3 py-2 text-xs font-semibold text-acento hover:bg-acento-tenue"
              >
                Cambiar inmobiliaria
              </button>
              <button
                type="button"
                onClick={() => void desvincularInmobiliaria()}
                className="rounded-medio border border-linea px-3 py-2 text-xs font-semibold text-tinta-media hover:bg-superficie-2"
              >
                Desvincular
              </button>
            </div>
          </header>

          {errorCatalogo !== '' && (
            <p
              role="alert"
              className="mt-4 rounded-medio bg-no-viable-tenue p-3 text-sm text-no-viable"
            >
              {errorCatalogo}
            </p>
          )}
          {catalogo.length > 0 && (
            <div className="mx-auto mt-5 flex min-h-0 w-full max-w-3xl flex-[0_1_auto] flex-col overflow-hidden rounded-grande border border-linea bg-superficie shadow-papel">
              {catalogo.length > 1 && (
                <nav
                  aria-label="Paginación de viviendas de inmobiliaria"
                  className="flex shrink-0 items-center justify-center gap-3 border-b border-linea bg-superficie px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setIndiceCatalogoActivo((indice) => Math.max(0, indice - 1))}
                    disabled={indiceCatalogoVisible === 0}
                    className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Anterior
                  </button>
                  <p className="min-w-16 text-center font-cifra text-sm tabular-nums text-tinta-media">
                    {indiceCatalogoVisible + 1} de {catalogo.length}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setIndiceCatalogoActivo((indice) => Math.min(catalogo.length - 1, indice + 1))
                    }
                    disabled={indiceCatalogoVisible === catalogo.length - 1}
                    className="rounded-medio border border-linea px-3 py-2 text-sm font-medium text-tinta hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Siguiente
                  </button>
                </nav>
              )}
              {catalogo.map((vivienda, indice) => {
                if (indice !== indiceCatalogoVisible) return null;
                const enFavoritos = estado.viviendas.some(
                  (guardada) => guardada.catalogoViviendaId === vivienda.id,
                );
                return (
                  <article key={vivienda.id} className="flex overflow-hidden bg-superficie">
                    <div className="flex min-h-full w-full flex-col">
                      <div className="relative h-32 bg-superficie-2">
                        <img
                          src={vivienda.imagenUrl}
                          alt={vivienda.nombre}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-3 left-3 rounded-chico bg-tinta/80 px-2 py-1 text-xs font-medium text-sobre-acento backdrop-blur-sm">
                          {vivienda.zona}
                        </span>
                        {enFavoritos && (
                          <span className="absolute right-3 top-3 rounded-chico bg-comodo px-2 py-1 text-xs font-semibold text-sobre-acento shadow-papel">
                            ✓ En favoritos
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col px-3 py-4 sm:px-4">
                        <p className="rotulo">Vivienda</p>
                        <h3 className="mt-1 truncate font-display text-lg leading-snug text-tinta">
                          {vivienda.nombre}
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-chico border border-linea bg-superficie-2 px-2 py-1 text-xs font-medium text-tinta-media">
                            {vivienda.superficieM2} m²
                          </span>
                          <span className="rounded-chico border border-linea bg-superficie-2 px-2 py-1 text-xs font-medium text-tinta-media">
                            {vivienda.habitaciones} hab.
                          </span>
                          <span className="rounded-chico border border-linea bg-superficie-2 px-2 py-1 text-xs font-medium text-tinta-media">
                            {vivienda.banos} baños
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="min-w-0 rounded-medio border border-acento/25 bg-acento-tenue px-3 py-2.5">
                            <dt className="text-[0.6875rem] font-medium text-tinta-media">
                              Precio
                            </dt>
                            <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-acento sm:text-lg">
                              {formatEuros(vivienda.precioVenta)}
                            </dd>
                          </div>
                          <div className="min-w-0 rounded-medio bg-superficie-2 px-3 py-2.5">
                            <dt className="text-[0.6875rem] font-medium text-tinta-media">
                              Precio por m²
                            </dt>
                            <dd className="mt-0.5 font-cifra text-base font-bold tabular-nums text-tinta sm:text-lg">
                              {vivienda.superficieM2 > 0
                                ? precioPorM2Formateado(
                                    vivienda.precioVenta / 100 / vivienda.superficieM2,
                                  )
                                : '—'}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-tinta-media">
                          {vivienda.descripcion}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 border-t border-linea px-4 py-3">
                        <a
                          href={vivienda.anuncioUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-medio border border-linea px-3 py-2 text-xs font-semibold text-acento hover:bg-acento-tenue"
                        >
                          Ver ficha completa ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => void anadirAFavoritos(vivienda.id)}
                          disabled={enFavoritos}
                          className="rounded-medio bg-acento px-3 py-2 text-xs font-semibold text-sobre-acento hover:bg-acento/90 disabled:cursor-default disabled:bg-comodo disabled:text-sobre-acento"
                        >
                          {enFavoritos ? '✓ En favoritos' : '+ Añadir a favoritos'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {catalogo.length === 0 && !errorCatalogo && (
            <p className="rounded-medio border border-dashed border-linea px-3 py-5 text-center text-sm text-tinta-media sm:px-4">
              Esta inmobiliaria todavía no tiene viviendas publicadas.
            </p>
          )}
        </div>
      )}

      {mostrarCodigo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/30 px-4 py-4 pb-[calc(3.75rem+1.5rem+env(safe-area-inset-bottom))] sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-vincular-inmobiliaria"
            className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <p className="rotulo">Mi inmobiliaria</p>
            <h2 id="titulo-vincular-inmobiliaria" className="mt-1 font-display text-xl text-tinta">
              Añadir inmobiliaria
            </h2>
            {inmobiliariaPendiente === null ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                  Introduce el código que te ha compartido tu agente.
                </p>
                <label
                  htmlFor="codigo-inmobiliaria"
                  className="mt-5 flex flex-col gap-1 text-sm font-medium text-tinta"
                >
                  Código de invitación
                  <input
                    id="codigo-inmobiliaria"
                    value={codigo}
                    onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') void comprobarCodigo();
                    }}
                    placeholder="CASA-7K3P"
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 font-cifra tracking-wide text-tinta uppercase focus:outline-none focus:ring-2 focus:ring-acento/50"
                  />
                </label>
                {errorCodigo !== '' && (
                  <p role="alert" className="mt-2 text-xs text-no-viable">
                    {errorCodigo}
                  </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMostrarCodigo(false)}
                    className="rounded-medio px-3 py-2 text-sm font-medium text-tinta-media hover:bg-superficie-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void comprobarCodigo()}
                    disabled={comprobandoCodigo}
                    className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
                  >
                    {comprobandoCodigo ? 'Comprobando…' : 'Continuar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-tinta-media">Vas a vincularte con:</p>
                <div className="mt-3 flex items-center gap-3 rounded-medio bg-acento-tenue p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-chico bg-acento font-display text-xs font-bold text-sobre-acento">
                    {inmobiliariaPendiente.marca}
                  </span>
                  <p className="font-display text-lg text-tinta">{inmobiliariaPendiente.nombre}</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-tinta-suave">
                  Tus favoritos personales se conservarán si más adelante cambias o desvinculas esta
                  inmobiliaria.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setInmobiliariaPendiente(null)}
                    className="rounded-medio px-3 py-2 text-sm font-medium text-tinta-media hover:bg-superficie-2"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => void vincularInmobiliaria()}
                    disabled={comprobandoCodigo}
                    className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90"
                  >
                    {comprobandoCodigo ? 'Vinculando…' : 'Confirmar vínculo'}
                  </button>
                </div>
              </>
            )}
          </section>
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
    const reformas = borrador.reformas.map((partida) => ({
      ...partida,
      concepto: partida.concepto.trim(),
    }));
    const presupuestoReforma = totalReformas(reformas);
    const reforma = reformas
      .map((partida) => partida.concepto.trim())
      .filter((concepto) => concepto !== '')
      .join(', ');
    const priceHistory =
      anterior !== undefined
        ? actualizarHistorialPrecio(
            anterior.priceHistory ?? [],
            anterior.precioVenta,
            anterior.fecha,
            borrador.precioVenta,
            fechaLocalISO(),
          )
        : actualizarHistorialPrecio(
            borrador.priceHistory,
            ZERO,
            '',
            borrador.precioVenta,
            borrador.fecha === '' ? fechaLocalISO() : borrador.fecha,
          );
    const datos = {
      ...(anterior ?? {}),
      ...borrador,
      anuncioUrl: borrador.anuncioUrl.trim(),
      telefono: borrador.telefono.trim(),
      sourceUrl: borrador.sourceUrl.trim(),
      sourceListingId: borrador.sourceListingId.trim(),
      reformas,
      priceHistory,
      presupuestoReforma,
      reforma,
    };
    if (borrador.sourcePortal === undefined) delete datos.sourcePortal;
    return datos;
  }

  function guardar(borrador: BorradorVivienda) {
    const duplicada = estado.viviendas.find((candidata) => {
      if (candidata.id === vivienda?.id) return false;
      return mismaFuenteVivienda(candidata, borrador);
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
      mismaFuenteVivienda(candidata, pendienteDuplicado),
    );
    if (duplicada === undefined) return;
    const datos = datosParaGuardar(pendienteDuplicado, duplicada);
    actualizarViviendas(
      estado.viviendas.map((actual) =>
        actual.id === duplicada.id ? { ...datos, id: actual.id } : actual,
      ),
    );
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-duplicado"
            className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <h2 id="titulo-duplicado" className="font-display text-xl text-tinta">
              Esta vivienda ya está guardada
            </h2>
            <p className="mt-2 text-sm text-tinta-media">
              Puedes revisar la existente, actualizarla con estos datos o cancelar.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={actualizarDuplicada}
                className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento"
              >
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  const duplicada = estado.viviendas.find((candidata) =>
                    mismaFuenteVivienda(candidata, pendienteDuplicado),
                  );
                  if (duplicada !== undefined) {
                    void navegar(`/ofertas/vivienda?vivienda=${encodeURIComponent(duplicada.id)}`);
                  }
                }}
                className="rounded-medio border border-linea px-4 py-2 text-sm font-medium text-tinta"
              >
                Ver vivienda
              </button>
              <button
                type="button"
                onClick={() => setPendienteDuplicado(null)}
                className="px-4 py-2 text-sm text-tinta-media"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Ofertas() {
  const { estado } = useEstado();
  const [parametros] = useSearchParams();
  const tieneInmobiliaria = estado.inmobiliariaActivaDemo !== undefined;
  const [pestanaActiva, setPestanaActiva] = useState<PestanaOfertas>(
    tieneInmobiliaria ? 'inmobiliaria' : 'favoritos',
  );

  if (parametros.get('tab') === 'hipotecas') {
    const destino = new URLSearchParams(parametros);
    destino.delete('tab');
    const busqueda = destino.toString();
    return <Navigate to={`/hipoteca${busqueda === '' ? '' : `?${busqueda}`}`} replace />;
  }

  return (
    <>
      {tieneInmobiliaria && (
        <div className="fixed inset-x-4 top-[calc(3.75rem+1.5rem)] z-20 lg:top-24 lg:right-10 lg:left-[calc(17rem+2.5rem)]">
          <div
            role="tablist"
            aria-label="Inmuebles"
            className="grid max-w-md grid-cols-2 rounded-medio border border-linea bg-superficie p-1 shadow-papel"
          >
            {(
              [
                ['inmobiliaria', 'Mi inmobiliaria'],
                ['favoritos', 'Mis favoritos'],
              ] as const
            ).map(([pestana, etiqueta]) => (
              <button
                key={pestana}
                type="button"
                role="tab"
                aria-selected={pestanaActiva === pestana}
                onClick={() => setPestanaActiva(pestana)}
                className={[
                  'rounded-chico px-3 py-2 text-sm font-medium transition-colors',
                  pestanaActiva === pestana
                    ? 'bg-acento text-sobre-acento'
                    : 'text-tinta-media hover:bg-superficie-2 hover:text-tinta',
                ].join(' ')}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}
      <section role="tabpanel">
        {tieneInmobiliaria && pestanaActiva === 'inmobiliaria' ? (
          <MiInmobiliaria conPestanas />
        ) : (
          <Viviendas conPestanas={tieneInmobiliaria} />
        )}
      </section>
    </>
  );
}
