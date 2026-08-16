import { useRef, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import { InputPorcentaje } from '@/components/InputPorcentaje';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import { INMOBILIARIA_DEMO, type InmobiliariaDemo } from '@/data/inmobiliariaDemo';
import type { ConfigFiscalCcaa } from '@/domain/types';
import {
  apiHipotecasConfigurada,
  canjearCodigoInmobiliariaApi,
  guardarCodigoInmobiliariaApi,
  previsualizarCodigoInmobiliariaApi,
  type InmobiliariaApi,
} from '@/services/hipotecasApi';

// ---------------------------------------------------------------------------
// Subcomponente: editor de una entrada fiscal por CCAA
// ---------------------------------------------------------------------------

interface PropsFiscalEditor {
  readonly config: ConfigFiscalCcaa;
  readonly onCambiar: (nueva: ConfigFiscalCcaa) => void;
}

function formatearPeriodoIne(periodo: string | undefined): string | null {
  if (periodo === undefined || !/^\d{4}-\d{2}$/.test(periodo)) return null;
  const [anyoTexto, mesTexto] = periodo.split('-');
  const anyo = Number(anyoTexto);
  const mes = Number(mesTexto);
  if (!Number.isInteger(anyo) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(anyo, mes - 1, 1),
  );
}

function inmobiliariaDesdeApi(inmobiliaria: InmobiliariaApi): InmobiliariaDemo {
  return {
    id: inmobiliaria.id,
    nombre: inmobiliaria.name,
    marca: inmobiliaria.brand,
    codigo: '',
  };
}

function FiscalCcaaEditor({ config, onCambiar }: PropsFiscalEditor) {
  const [textoOverride, setTextoOverride] = useState<string>(
    config.tipoManualOverride !== undefined ? String(config.tipoManualOverride * 100) : '',
  );
  const editadoOverride = useRef(false);

  function handleOverrideFocus() {
    editadoOverride.current = false;
    setTextoOverride('');
  }

  function handleOverrideBlur() {
    if (!editadoOverride.current) {
      setTextoOverride(
        config.tipoManualOverride !== undefined ? String(config.tipoManualOverride * 100) : '',
      );
      return;
    }
    const raw = textoOverride.trim();
    if (raw === '') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tipoManualOverride: _omit, ...sinOverride } = config;
      onCambiar(sinOverride);
    } else {
      const v = parseFloat(raw.replace(',', '.'));
      if (!isNaN(v) && v >= 0 && v <= 30) {
        onCambiar({ ...config, tipoManualOverride: v / 100 });
      } else {
        setTextoOverride(
          config.tipoManualOverride !== undefined ? String(config.tipoManualOverride * 100) : '',
        );
      }
    }
  }

  const inputClass =
    'rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50';

  return (
    <div className="flex flex-col gap-3 rounded-medio border border-linea p-4">
      <h3 className="text-sm font-semibold text-tinta">{config.ccaa}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputPorcentaje
          id={`ajd-${config.ccaa}`}
          etiqueta="AJD compraventa"
          valor={config.ajdCompraventa}
          onChange={(v) => onCambiar({ ...config, ajdCompraventa: v })}
          ayuda="Impuesto de Actos Jurídicos Documentados que grava la escritura de compraventa. Varía por comunidad autónoma y se aplica sobre el precio de compra."
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-center">
            <label htmlFor={`override-${config.ccaa}`} className="text-sm font-medium text-tinta">
              Tipo ITP manual
            </label>
            <InfoTooltip texto="Impuesto de Transmisiones Patrimoniales. Si lo dejas vacío, se calculará automáticamente aplicando los tramos progresivos de tu comunidad autónoma. Rellénalo solo si quieres forzar un tipo fijo." />
          </div>
          <input
            id={`override-${config.ccaa}`}
            type="text"
            inputMode="decimal"
            placeholder={`${(config.itpTramos[0]?.tipo ?? 0.08) * 100} % (vacío = usar tramos)`}
            value={textoOverride}
            onChange={(e) => {
              editadoOverride.current = true;
              setTextoOverride(e.target.value);
            }}
            onFocus={handleOverrideFocus}
            onBlur={handleOverrideBlur}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página de Ajustes
// ---------------------------------------------------------------------------

export function Ajustes() {
  const {
    estado,
    actualizarAjustes,
    actualizarGastos,
    actualizarPreferencias,
    refrescarTinIne,
    estadoConsultaTinIne,
    exportarDatos,
    confirmarCopiaDescargada,
    importarDatos,
    restablecerDatos,
    copiaSeguridadPendiente,
    estadoPersistencia,
    datosRecuperacion,
    descartarRecuperacion,
    actualizarInmobiliariaActivaDemo,
  } = useEstado();
  const { ajustes, gastos, preferencias } = estado;
  const periodoTinIne = formatearPeriodoIne(ajustes.tinReferenciaPeriodo);

  // Mensaje de resultado de la importación
  const [mensajeImport, setMensajeImport] = useState<
    { tipo: 'ok' | 'error'; texto: string } | undefined
  >(undefined);

  // Control del diálogo de confirmación de restablecimiento
  const dialogoRef = useRef<HTMLDialogElement>(null);

  // Input file oculto para importar datos
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [mostrarVinculoInmobiliaria, setMostrarVinculoInmobiliaria] = useState(false);
  const [codigoInmobiliaria, setCodigoInmobiliaria] = useState('');
  const [inmobiliariaPendiente, setInmobiliariaPendiente] = useState<InmobiliariaDemo | null>(
    null,
  );
  const [errorCodigoInmobiliaria, setErrorCodigoInmobiliaria] = useState('');
  const [comprobandoCodigoInmobiliaria, setComprobandoCodigoInmobiliaria] = useState(false);

  // ---------------------------------------------------------------------------
  // Exportar datos
  // ---------------------------------------------------------------------------

  function handleExportar() {
    const json = exportarDatos();
    descargarTexto(json, 'hipotecas-datos.json', 'application/json');
    confirmarCopiaDescargada();
  }

  function descargarTexto(contenido: string, nombre: string, tipo: string) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Importar datos
  // ---------------------------------------------------------------------------

  function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (archivo === undefined) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const texto = ev.target?.result;
      if (typeof texto !== 'string') {
        setMensajeImport({ tipo: 'error', texto: 'No se pudo leer el archivo.' });
        return;
      }
      const exito = importarDatos(texto);
      if (exito) {
        setMensajeImport({ tipo: 'ok', texto: 'Datos importados correctamente.' });
      } else {
        setMensajeImport({
          tipo: 'error',
          texto: 'El archivo no tiene el formato esperado.',
        });
      }
    };
    reader.readAsText(archivo);

    // Limpiamos el input para que el mismo archivo pueda volver a importarse si se desea.
    e.target.value = '';
  }

  // ---------------------------------------------------------------------------
  // Restablecer datos
  // ---------------------------------------------------------------------------

  function abrirConfirmacion() {
    dialogoRef.current?.showModal();
  }

  function confirmarRestablecimiento() {
    restablecerDatos();
    dialogoRef.current?.close();
  }

  function cancelarRestablecimiento() {
    dialogoRef.current?.close();
  }

  function abrirVinculoInmobiliaria() {
    setCodigoInmobiliaria('');
    setInmobiliariaPendiente(null);
    setErrorCodigoInmobiliaria('');
    setMostrarVinculoInmobiliaria(true);
  }

  async function comprobarCodigoInmobiliaria() {
    if (apiHipotecasConfigurada()) {
      setComprobandoCodigoInmobiliaria(true);
      try {
        const { agency } = await previsualizarCodigoInmobiliariaApi(codigoInmobiliaria);
        setInmobiliariaPendiente(inmobiliariaDesdeApi(agency));
        setErrorCodigoInmobiliaria('');
      } catch (error) {
        setInmobiliariaPendiente(null);
        setErrorCodigoInmobiliaria(
          error instanceof Error ? error.message : 'No se pudo comprobar el código.',
        );
      } finally {
        setComprobandoCodigoInmobiliaria(false);
      }
      return;
    }

    if (codigoInmobiliaria.trim().toUpperCase() === INMOBILIARIA_DEMO.codigo) {
      setInmobiliariaPendiente(INMOBILIARIA_DEMO);
      setErrorCodigoInmobiliaria('');
      return;
    }
    setInmobiliariaPendiente(null);
    setErrorCodigoInmobiliaria('No encontramos ese código. Prueba con CASA-7K3P en la demostración.');
  }

  async function confirmarVinculoInmobiliaria() {
    if (inmobiliariaPendiente === null) return;
    setComprobandoCodigoInmobiliaria(true);
    try {
      const inmobiliaria = apiHipotecasConfigurada()
        ? inmobiliariaDesdeApi((await canjearCodigoInmobiliariaApi(codigoInmobiliaria)).agency)
        : inmobiliariaPendiente;
      actualizarInmobiliariaActivaDemo({
        id: inmobiliaria.id,
        nombre: inmobiliaria.nombre,
        marca: inmobiliaria.marca,
      });
      if (apiHipotecasConfigurada()) guardarCodigoInmobiliariaApi(codigoInmobiliaria);
      setMostrarVinculoInmobiliaria(false);
    } catch (error) {
      setErrorCodigoInmobiliaria(
        error instanceof Error ? error.message : 'No se pudo vincular la inmobiliaria.',
      );
      setInmobiliariaPendiente(null);
    } finally {
      setComprobandoCodigoInmobiliaria(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      <Panel titulo="Inmuebles" rotulo="Ajustes">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl text-tinta">Inmobiliaria</h2>
            <p className="mt-1 text-sm leading-relaxed text-tinta-media">
              Vincula el código que te facilite tu agente para ver su catálogo en Inmuebles.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirVinculoInmobiliaria}
            className="shrink-0 rounded-medio bg-acento px-4 py-2.5 text-sm font-medium text-sobre-acento hover:bg-acento/90"
          >
            Vincular inmobiliaria
          </button>
        </div>
      </Panel>

      <Panel titulo="Gastos de compra" rotulo="Ajustes">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4" aria-labelledby="gastos-inmobiliaria">
            <div>
              <h3 id="gastos-inmobiliaria" className="text-sm font-semibold text-tinta">
                Inmobiliaria
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
                Los honorarios son libres y no siempre los paga el comprador. El 3 % más IVA es una
                estimación inicial: ponlo a 0 % si no te corresponde.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputPorcentaje
                id="inmobiliaria-porcentaje"
                etiqueta="Comisión"
                valor={gastos.inmobiliariaPorcentaje}
                onChange={(v) => actualizarGastos({ inmobiliariaPorcentaje: v })}
                ayuda="Se calcula sobre el precio de compra y después se añade el IVA."
              />
              <InputPorcentaje
                id="inmobiliaria-iva"
                etiqueta="IVA de la inmobiliaria"
                valor={gastos.inmobiliariaIva}
                onChange={(v) => actualizarGastos({ inmobiliariaIva: v })}
              />
            </div>
          </section>

          <section
            className="flex flex-col gap-4 border-t border-linea pt-5"
            aria-labelledby="gastos-formalizacion"
          >
            <div>
              <h3 id="gastos-formalizacion" className="text-sm font-semibold text-tinta">
                Notaría y formalización
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-tinta-suave">
                Estimaciones fijas que se incluyen siempre en el desembolso mínimo.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputMoneda
                id="gasto-notaria"
                etiqueta="Notaría de compraventa"
                valor={gastos.notariaCompraventa}
                onChange={(v) => actualizarGastos({ notariaCompraventa: v })}
              />
              <InputMoneda
                id="gasto-registro"
                etiqueta="Registro de la propiedad"
                valor={gastos.registroCompraventa}
                onChange={(v) => actualizarGastos({ registroCompraventa: v })}
              />
              <InputMoneda
                id="gasto-gestoria"
                etiqueta="Gestoría"
                valor={gastos.gestoriaCompraventa}
                onChange={(v) => actualizarGastos({ gestoriaCompraventa: v })}
              />
              <InputMoneda
                id="gasto-tasacion"
                etiqueta="Tasación"
                valor={gastos.tasacion}
                onChange={(v) => actualizarGastos({ tasacion: v })}
              />
              <InputMoneda
                id="gasto-nota-simple"
                etiqueta="Nota simple"
                valor={gastos.notaSimple}
                onChange={(v) => actualizarGastos({ notaSimple: v })}
              />
            </div>
          </section>
        </div>
      </Panel>

      <Panel titulo="Opciones de cálculo avanzadas" rotulo="Ajustes">
        <div className="flex flex-col">
          {/* A. Parámetros de hipoteca */}
          <section className="flex flex-col gap-4">
            <h3 className="font-display text-xl text-tinta">Parámetros de hipoteca</h3>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-tinta">
                Referencia del interés para estimaciones
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => actualizarAjustes({ tinFuente: 'ine' })}
                  className={[
                    'rounded-medio border px-3 py-2 text-sm font-medium',
                    ajustes.tinFuente === 'ine'
                      ? 'border-acento bg-acento/10 text-acento'
                      : 'border-linea text-tinta hover:bg-superficie-2',
                  ].join(' ')}
                >
                  INE automático
                </button>
                <button
                  type="button"
                  onClick={() => actualizarAjustes({ tinFuente: 'manual' })}
                  className={[
                    'rounded-medio border px-3 py-2 text-sm font-medium',
                    ajustes.tinFuente === 'manual'
                      ? 'border-acento bg-acento/10 text-acento'
                      : 'border-linea text-tinta hover:bg-superficie-2',
                  ].join(' ')}
                >
                  Manual
                </button>
              </div>
            </div>

            <InputPorcentaje
              id="tin-por-defecto"
              etiqueta={
                ajustes.tinFuente === 'ine'
                  ? 'Tipo de interés medio inicial de las hipotecas sobre viviendas'
                  : 'Interés anual usado en estimaciones'
              }
              valor={ajustes.tinPorDefecto}
              onChange={(v) => actualizarAjustes({ tinPorDefecto: v })}
              deshabilitado={ajustes.tinFuente === 'ine'}
            />

            {ajustes.tinFuente === 'ine' && (
              <div className="rounded-medio border border-linea bg-superficie-2 px-4 py-3">
                <p className="text-sm text-tinta">
                  Fuente: <span className="font-semibold">INE</span>
                  {periodoTinIne !== null && <> · {periodoTinIne}</>}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-tinta-media">
                  Es la media de las hipotecas sobre viviendas constituidas e inscritas durante ese
                  mes, no una oferta bancaria actual. Se consulta como máximo una vez cada 24 horas.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refrescarTinIne(true)}
                    disabled={estadoConsultaTinIne === 'cargando'}
                    className="rounded-medio border border-linea bg-superficie px-3 py-1.5 text-xs font-medium text-tinta hover:bg-superficie-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    {estadoConsultaTinIne === 'cargando' ? 'Consultando…' : 'Actualizar ahora'}
                  </button>
                  <span
                    role="status"
                    className={[
                      'text-xs',
                      estadoConsultaTinIne === 'error' || estadoConsultaTinIne === 'respaldo'
                        ? 'text-no-viable'
                        : 'text-tinta-suave',
                    ].join(' ')}
                  >
                    {estadoConsultaTinIne === 'actualizado'
                      ? 'Dato actualizado desde el INE.'
                      : estadoConsultaTinIne === 'cache'
                        ? 'Dato recuperado de la caché.'
                        : estadoConsultaTinIne === 'respaldo'
                          ? 'El INE no respondió; se mantiene el último dato guardado.'
                          : estadoConsultaTinIne === 'error'
                            ? 'No se pudo consultar el INE; se mantiene el último dato disponible.'
                            : ''}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="plazo-por-defecto" className="text-sm font-medium text-tinta">
                Plazo en años
              </label>
              <InputNumeroEntero
                id="plazo-por-defecto"
                valor={ajustes.plazoPorDefecto}
                minimo={5}
                maximo={40}
                onChange={(plazoPorDefecto) => actualizarAjustes({ plazoPorDefecto })}
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>

            <InputPorcentaje
              id="ltv-por-defecto"
              etiqueta="Porcentaje que financiaría el banco"
              valor={ajustes.ltvPorDefecto}
              onChange={(v) => actualizarAjustes({ ltvPorDefecto: v })}
            />
          </section>

          {/* B. Ratios y plazos */}
          <section className="mt-5 flex flex-col gap-4 border-t border-linea pt-5">
            <h3 className="font-display text-xl text-tinta">Ratios y plazos</h3>
            <InputPorcentaje
              id="ratio-bancario-max"
              etiqueta="Máximo de ingresos destinado a deudas"
              valor={ajustes.ratioBancarioMaximo}
              onChange={(v) => actualizarAjustes({ ratioBancarioMaximo: v })}
            />

            <InputPorcentaje
              id="ratio-personal-objetivo"
              etiqueta="Objetivo personal para vivienda y deudas"
              valor={ajustes.ratioPersonalObjetivo}
              onChange={(v) => actualizarAjustes({ ratioPersonalObjetivo: v })}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="edad-maxima-vencimiento" className="text-sm font-medium text-tinta">
                Edad máxima al vencimiento
              </label>
              <InputNumeroEntero
                id="edad-maxima-vencimiento"
                valor={ajustes.edadMaximaAlVencimiento}
                minimo={65}
                maximo={85}
                onChange={(edadMaximaAlVencimiento) =>
                  actualizarAjustes({ edadMaximaAlVencimiento })
                }
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="criterio-edad" className="text-sm font-medium text-tinta">
                Criterio de edad
              </label>
              <select
                id="criterio-edad"
                value={ajustes.criterioEdad}
                onChange={(e) =>
                  actualizarAjustes({
                    criterioEdad: e.target.value as 'mayor' | 'menor',
                  })
                }
                className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
              >
                <option value="mayor">Titular de más edad</option>
                <option value="menor">Titular de menos edad</option>
              </select>
            </div>
          </section>

          {/* C. Rango de exploración */}
          <section className="mt-5 flex flex-col gap-4 border-t border-linea pt-5">
            <h3 className="font-display text-xl text-tinta">Rango de exploración</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InputMoneda
                id="precio-min"
                etiqueta="Precio mínimo"
                valor={preferencias.precioMinExplorar}
                onChange={(v) => actualizarPreferencias({ precioMinExplorar: v })}
                ayuda="El precio más bajo que aparecerá en la tabla de escala. Ajústalo a tu rango real para que las filas sean útiles."
              />
              <InputMoneda
                id="precio-max"
                etiqueta="Precio máximo"
                valor={preferencias.precioMaxExplorar}
                onChange={(v) => actualizarPreferencias({ precioMaxExplorar: v })}
                ayuda="El precio más alto de la tabla. Puedes fijarlo por encima de tu límite para ver cuánto necesitarías en cada escenario."
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paso-escala" className="text-sm font-medium text-tinta">
                  Paso de escala
                </label>
                <select
                  id="paso-escala"
                  value={preferencias.pasoEscala}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const paso = val === 5000 ? 5000 : val === 20000 ? 20000 : 10000;
                    actualizarPreferencias({ pasoEscala: paso });
                  }}
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
                >
                  <option value={5000}>5.000 €</option>
                  <option value={10000}>10.000 €</option>
                  <option value={20000}>20.000 €</option>
                </select>
              </div>
            </div>
          </section>

          {/* D. Fiscalidad por CCAA */}
          <section className="mt-5 flex flex-col gap-5 border-t border-linea pt-5">
            <h3 className="font-display text-xl text-tinta">Fiscalidad por CCAA</h3>
            {ajustes.fiscal
              .filter((cfg) => cfg.ccaa !== 'Aragón')
              .map((cfg) => (
                <FiscalCcaaEditor
                  key={cfg.ccaa}
                  config={cfg}
                  onCambiar={(nueva) => {
                    const fiscal = ajustes.fiscal.map((f) => (f.ccaa === cfg.ccaa ? nueva : f));
                    actualizarAjustes({ fiscal });
                  }}
                />
              ))}
          </section>
        </div>
      </Panel>

      {/* E. Datos y privacidad */}
      <Panel titulo="Datos y privacidad">
        <div className="flex flex-col gap-4">
          {estadoPersistencia === 'error' && (
            <p
              role="alert"
              className="rounded-medio border border-no-viable bg-no-viable-tenue px-4 py-3 text-sm text-tinta"
            >
              El navegador no ha podido guardar los últimos cambios. Descarga una copia ahora y
              comprueba que el almacenamiento local no esté bloqueado o lleno.
            </p>
          )}

          {datosRecuperacion !== null && (
            <div className="rounded-medio border border-revisar bg-revisar-tenue px-4 py-3 text-sm text-tinta">
              <p>
                Se encontró un estado anterior que la aplicación no pudo validar. Se ha conservado
                sin sobrescribirlo para que puedas revisarlo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    descargarTexto(
                      datosRecuperacion,
                      'hipotecas-recuperacion.txt',
                      'text/plain;charset=utf-8',
                    )
                  }
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-xs font-medium text-tinta"
                >
                  Descargar datos recuperados
                </button>
                <button
                  type="button"
                  onClick={descartarRecuperacion}
                  className="rounded-medio border border-linea bg-superficie px-3 py-2 text-xs text-tinta-media"
                >
                  Descartar aviso
                </button>
              </div>
            </div>
          )}

          {copiaSeguridadPendiente && (
            <p
              role="status"
              className="rounded-medio border border-revisar bg-revisar-tenue px-4 py-3 text-sm text-tinta"
            >
              Hay cambios posteriores a la última copia externa. Se guardan automáticamente en este
              navegador; descarga el JSON periódicamente para protegerte si borras sus datos o
              cambias de dispositivo.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {/* Exportar */}
            <button
              type="button"
              onClick={handleExportar}
              className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta transition-colors hover:bg-superficie-2 hover:text-tinta"
            >
              Descargar copia de seguridad (JSON)
            </button>

            {/* Importar */}
            <button
              type="button"
              onClick={() => {
                setMensajeImport(undefined);
                inputFileRef.current?.click();
              }}
              className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta transition-colors hover:bg-superficie-2 hover:text-tinta"
            >
              Importar datos
            </button>
            {/* Input file oculto — se activa programáticamente desde el botón */}
            <input
              ref={inputFileRef}
              type="file"
              accept=".json"
              onChange={handleArchivoSeleccionado}
              className="hidden"
              aria-hidden="true"
            />

            {/* Restablecer */}
            <button
              type="button"
              onClick={abrirConfirmacion}
              className="rounded-medio border border-no-viable bg-superficie px-4 py-2 text-sm text-no-viable transition-colors hover:bg-no-viable/10"
            >
              Restablecer datos
            </button>
          </div>

          {/* Mensaje de importación */}
          {mensajeImport !== undefined && (
            <p
              role="status"
              className={`text-sm ${
                mensajeImport.tipo === 'ok' ? 'text-comodo' : 'text-no-viable'
              }`}
            >
              {mensajeImport.texto}
            </p>
          )}
        </div>
      </Panel>

      {/* Diálogo de confirmación de restablecimiento */}
      <dialog
        ref={dialogoRef}
        className="rounded-medio border border-linea bg-superficie p-0 shadow-papel backdrop:bg-tinta/30"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 className="font-display text-xl text-tinta">¿Restablecer todos los datos?</h2>
          <p className="max-w-xs text-sm text-tinta-media">
            Se borrarán tu perfil, simulador, simulaciones, ofertas y metas. Se conservarán los
            ajustes de cálculo, la fiscalidad y los gastos configurados. Esta acción no se puede
            deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={cancelarRestablecimiento}
              className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta transition-colors hover:bg-superficie-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarRestablecimiento}
              className="rounded-medio border border-no-viable bg-no-viable/10 px-4 py-2 text-sm text-no-viable transition-colors hover:bg-no-viable/20"
            >
              Sí, restablecer
            </button>
          </div>
        </div>
      </dialog>

      {mostrarVinculoInmobiliaria && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/30 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-vincular-inmobiliaria"
            className="w-full max-w-md rounded-grande bg-superficie p-5 shadow-elevado"
          >
            <p className="rotulo">Inmuebles</p>
            <h2 id="titulo-vincular-inmobiliaria" className="mt-1 font-display text-xl text-tinta">
              Vincular inmobiliaria
            </h2>
            {inmobiliariaPendiente === null ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-tinta-media">
                  Introduce el código que te ha compartido tu agente.
                </p>
                <label className="mt-5 flex flex-col gap-1 text-sm font-medium text-tinta">
                  Código de invitación
                  <input
                    value={codigoInmobiliaria}
                    onChange={(evento) => setCodigoInmobiliaria(evento.target.value.toUpperCase())}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') void comprobarCodigoInmobiliaria();
                    }}
                    placeholder="CASA-7K3P"
                    autoFocus
                    className="rounded-medio border border-linea bg-superficie px-3 py-2 font-cifra tracking-wide text-tinta uppercase focus:outline-none focus:ring-2 focus:ring-acento/50"
                  />
                </label>
                {errorCodigoInmobiliaria !== '' && (
                  <p role="alert" className="mt-2 text-xs text-no-viable">
                    {errorCodigoInmobiliaria}
                  </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setMostrarVinculoInmobiliaria(false)} className="rounded-medio px-3 py-2 text-sm font-medium text-tinta-media hover:bg-superficie-2">Cancelar</button>
                  <button type="button" onClick={() => void comprobarCodigoInmobiliaria()} disabled={comprobandoCodigoInmobiliaria} className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90">{comprobandoCodigoInmobiliaria ? 'Comprobando…' : 'Continuar'}</button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-tinta-media">Vas a vincularte con:</p>
                <div className="mt-3 flex items-center gap-3 rounded-medio bg-acento-tenue p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-chico bg-acento font-display text-xs font-bold text-sobre-acento">{inmobiliariaPendiente.marca}</span>
                  <p className="font-display text-lg text-tinta">{inmobiliariaPendiente.nombre}</p>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setInmobiliariaPendiente(null)} className="rounded-medio px-3 py-2 text-sm font-medium text-tinta-media hover:bg-superficie-2">Volver</button>
                  <button type="button" onClick={() => void confirmarVinculoInmobiliaria()} disabled={comprobandoCodigoInmobiliaria} className="rounded-medio bg-acento px-4 py-2 text-sm font-medium text-sobre-acento hover:bg-acento/90">{comprobandoCodigoInmobiliaria ? 'Vinculando…' : 'Confirmar vínculo'}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
