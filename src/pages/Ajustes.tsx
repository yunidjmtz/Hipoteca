import { useRef, useState } from 'react';
import { useEstado } from '@/app/EstadoProvider';
import { Panel } from '@/components/Panel';
import { InputPorcentaje } from '@/components/InputPorcentaje';
import { InputMoneda } from '@/components/InputMoneda';
import { InputNumeroEntero } from '@/components/InputNumeroEntero';
import { InfoTooltip } from '@/components/InfoTooltip';
import type { ConfigFiscalCcaa } from '@/domain/types';

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
    importarDatos,
    restablecerDatos,
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

  // ---------------------------------------------------------------------------
  // Exportar datos
  // ---------------------------------------------------------------------------

  function handleExportar() {
    const json = exportarDatos();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hipotecas-datos.json';
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
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
        <div className="flex flex-col gap-5">
          {/* A. Parámetros de hipoteca */}
          <Panel titulo="Parámetros de hipoteca" rotulo="Ajustes">
            <div className="flex flex-col gap-4">
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
                    Es la media de las hipotecas sobre viviendas constituidas e inscritas durante
                    ese mes, no una oferta bancaria actual. Se consulta como máximo una vez cada 24
                    horas.
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
            </div>
          </Panel>

          {/* B. Ratios y plazos */}
          <Panel titulo="Ratios y plazos">
            <div className="flex flex-col gap-4">
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
            </div>
          </Panel>

          {/* C. Rango de exploración */}
          <Panel titulo="Rango de exploración">
            <div className="flex flex-col gap-4">
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
            </div>
          </Panel>

          {/* D. Fiscalidad por CCAA */}
          <Panel titulo="Fiscalidad por CCAA">
            <div className="flex flex-col gap-5">
              {ajustes.fiscal.map((cfg) => (
                <FiscalCcaaEditor
                  key={cfg.ccaa}
                  config={cfg}
                  onCambiar={(nueva) => {
                    const fiscal = ajustes.fiscal.map((f) => (f.ccaa === cfg.ccaa ? nueva : f));
                    actualizarAjustes({ fiscal });
                  }}
                />
              ))}
            </div>
          </Panel>
        </div>
      </Panel>

      {/* E. Datos y privacidad */}
      <Panel titulo="Datos y privacidad">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {/* Exportar */}
            <button
              type="button"
              onClick={handleExportar}
              className="rounded-medio border border-linea bg-superficie px-4 py-2 text-sm text-tinta transition-colors hover:bg-superficie-2 hover:text-tinta"
            >
              Exportar datos (JSON)
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
    </div>
  );
}
