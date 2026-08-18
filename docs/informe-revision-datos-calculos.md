# Informe de revisión de datos, cálculos y reglas de negocio

## Estado

Revisión iniciada el 16 de agosto de 2026. Este documento se actualizará por bloques conforme avance el plan definido en `docs/plan-revision-datos-calculos.md`.

## Resumen de resultados

| Bloque                   | Estado     | Resultado provisional                                                                                 |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| Línea base automatizada  | Completado | Lint, TypeScript y 353 pruebas correctas; cobertura de ramas 90,73 %. E2E aún requiere actualización. |
| Modelo y persistencia    | Completado | Ocho defectos corregidos y verificados; queda ampliar el modelo de condiciones fiscales personales.   |
| Motor financiero         | Completado | Nueve defectos de cálculo corregidos y nuevas pruebas de límites, fechas, ranking y proyecciones.     |
| Integración por apartado | Completado | Resumen, Capacidad, Escala, Meta, Inmuebles, Hipoteca y Amortización reconciliados.                   |
| Importación remota       | Completado | Contrato, límites, procedencia, ausencia de datos y mapeo local corregidos y cubiertos.                 |
| API, Supabase y RLS      | Completado | Siete defectos corregidos localmente; SQL/RLS y sesión anónima pendientes de aplicar en producción.    |

## Hallazgos

### DAT-001 — La versión actual de migración no coincide con el estado inicial

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Evidencia:** `ESTADO_INICIAL.schemaVersion` vale 13 en `src/storage/defaults.ts`, pero `SCHEMA_ACTUAL` vale 12 en `src/storage/store.ts`. Tanto `cargarEstado` como `importarJSON` solo migran cuando `schemaVersion < SCHEMA_ACTUAL`.
- **Resultado:** un estado de versión 12 se valida y se devuelve conservando la versión 12; no ejecuta la migración 13.
- **Riesgo:** el estado permanece marcado con una versión anterior. Si durante ese periodo se rellenan campos nuevos y más adelante se corrige la constante, la migración 13 actual asigna `telefono: ''` a todas las viviendas y puede sobrescribir teléfonos incorporados mientras el estado seguía marcado como versión 12.
- **Cobertura ausente:** las pruebas cubren versiones 3, 5, 6 y 10, pero no una entrada de versión 12.
- **Corrección propuesta:** usar una única constante de versión actual, migrar 12 → 13 sin sobrescribir un teléfono ya existente y añadir pruebas de carga e importación para la versión inmediatamente anterior.
- **Corrección aplicada:** `SCHEMA_ACTUAL` toma su valor de `ESTADO_INICIAL`, la migración conserva teléfonos existentes y una prueba específica confirma 12 → 13.

### DAT-002 — Se aceptan versiones futuras y se pueden perder sus campos

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Evidencia:** `zEstadoPersistido` admite cualquier entero como `schemaVersion`. El flujo solo migra versiones menores y no rechaza versiones superiores. Los objetos Zod eliminan por defecto los campos desconocidos; se confirmó con la versión instalada que un campo extra desaparece al analizar el objeto.
- **Resultado:** un JSON con `schemaVersion` superior a la soportada puede aceptarse si conserva los campos conocidos. Sus campos nuevos se eliminan y el número de versión futuro se conserva.
- **Riesgo:** `EstadoProvider` persiste automáticamente el estado cargado, por lo que puede sobrescribir el original con una representación incompleta.
- **Corrección propuesta:** rechazar versiones superiores a la soportada antes de transformar el objeto, conservar el JSON original como recuperación y mostrar un resultado de importación incompatible.
- **Corrección aplicada:** carga e importación rechazan la versión futura antes de Zod; la carga conserva el JSON bruto como recuperación.

### DAT-003 — Las condiciones fiscales personales no están modeladas por completo

- **Prioridad:** P1.
- **Estado:** riesgo de sobreestimación mitigado; ampliación del modelo pendiente.
- **Evidencia:** la configuración de Aragón incluye reducciones por discapacidad, violencia de género y familia numerosa. `construirContexto` fija siempre `discapacidadPorcentaje: 0`, `victimaViolenciaGenero: false` y `familiaNumerosa: false`, y el perfil persistido no contiene campos que permitan cambiarlos.
- **Contraste oficial:** los artículos 121-4 y 122-10 permiten bonificaciones personales, pero en una compra pro indiviso deben prorratearse según la participación de quienes cumplen. Los artículos 121-5 y 122-3 exigen, para familia numerosa, renta, vivienda habitual, venta o primera vivienda y aumento de superficie.
- **Resultado previo:** bastaba con que el titular de menor edad fuera joven para aplicar la bonificación completa a toda la compra. La regla AJD de familia numerosa solo comprobaba el indicador de familia numerosa e ignoraba el resto de requisitos.
- **Corrección aplicada:** la bonificación automática por edad solo se aplica si todos los titulares cumplen, evitando sobreestimar el ahorro cuando no se conoce el reparto. La regla incompleta de familia numerosa se retiró del cálculo automático.
- **Pendiente:** incorporar porcentajes de titularidad y condiciones personales acreditadas para calcular prorrateos y beneficios de familia numerosa sin aproximaciones.

### DAT-004 — La validación de fechas comprueba el formato, no la fecha real

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Evidencia:** `zFechaIso` solo aplica la expresión `YYYY-MM-DD`; valores como `2026-99-99` cumplen el formato. Otros campos de fecha usan simplemente `z.string()`.
- **Resultado:** una copia importada puede contener meses o días inexistentes. Las funciones de calendario separan y convierten esas partes, pudiendo normalizarlas hacia años o meses distintos sin avisar.
- **Riesgo:** fechas erróneas en cuotas, vencimientos, ofertas, viviendas e historiales de precio.
- **Corrección propuesta:** crear un validador ISO de fecha real y aplicarlo de manera uniforme a todos los campos de dominio que declaran fechas.
- **Corrección aplicada:** las fechas de perfil, cuotas, simulaciones, ofertas, viviendas, historial de precios y metas validan días reales; una prueba rechaza `2026-02-30`.

### DAT-005 — No existe validación relacional para configuraciones críticas

- **Prioridad:** P2, elevable a P1 si se permite importar configuración editada externamente como flujo soportado.
- **Estado:** corregido y verificado.
- **Evidencia:** el esquema acepta listas fiscales vacías, tramos desordenados y umbrales de viabilidad en cualquier orden mientras cada porcentaje esté entre 0 y 1.
- **Resultado:** una configuración formalmente válida puede producir impuesto cero, tramos incorrectos o clasificaciones de viabilidad contradictorias.
- **Corrección propuesta:** validar que exista una configuración fiscal utilizable, que los tramos estén ordenados y cerrados correctamente y que `ratioComodo <= ratioAjustado <= ratioViable`.
- **Corrección aplicada:** se exige al menos una configuración fiscal, tramos crecientes con cierre ilimitado, comunidades únicas, rango de exploración coherente y orden de umbrales.

### DAT-006 — Los identificadores duplicados se aceptan en colecciones persistidas

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Evidencia:** los identificadores solo se validan como cadenas y no se comprueba unicidad en titulares asociados, deudas, gastos, ingresos, viviendas, ofertas, vinculaciones, reformas o metas.
- **Resultado:** una copia importada con identificadores repetidos puede hacer que una edición o eliminación afecte a más de un elemento.
- **Corrección propuesta:** validar identificadores no vacíos y únicos dentro de cada colección, o regenerarlos de forma controlada durante la importación.
- **Corrección aplicada:** el esquema exige identificadores no vacíos y únicos en las colecciones editables, incluidas vinculaciones y reformas.

### DAT-007 — La importación y exportación JSON carecen de pruebas unitarias directas

- **Prioridad:** P2, carencia de prueba.
- **Estado:** corregido y verificado.
- **Evidencia:** `tests/storage/store.test.ts` no ejercita `exportarJSON` ni `importarJSON`. El recorrido E2E de exportar, restablecer e importar falla actualmente antes de alcanzar la comprobación principal.
- **Riesgo:** no existe una prueba fiable de ida y vuelta que asegure conservación exacta del estado actual y de estados migrados.
- **Corrección propuesta:** añadir pruebas de round trip, JSON inválido, versión anterior, versión futura y conservación exacta de importes en céntimos.
- **Corrección aplicada:** existe una prueba de ida y vuelta completa junto con casos de versión anterior, versión futura y JSON inválido.

### DAT-008 — El tercer titular todavía no tiene cobertura específica

- **Prioridad:** P2, carencia de prueba.
- **Estado:** cubierto; el cambio local no se atribuye a la auditoría.
- **Evidencia:** el tipo, el esquema y la pantalla admiten ahora hasta tres titulares, pero las pruebas encontradas solo construyen escenarios explícitos con uno o dos.
- **Riesgo:** una regresión podría afectar a la suma de ingresos, el criterio de edad o la persistencia del tercer titular sin ser detectada.
- **Corrección propuesta:** añadir casos con tres titulares para normalización de ingresos, criterio de edad, guardado, exportación e importación.
- **Corrección aplicada:** se añadieron casos de suma normalizada y round trip persistido con tres titulares.

### DAT-009 — El último cambio puede perderse al cerrar durante el debounce

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Evidencia:** cada actualización programa una escritura 500 ms más tarde. No existe un guardado inmediato en `pagehide`, `beforeunload` o cambio de visibilidad. El estado `guardando` está definido, pero nunca se asigna al programar la escritura.
- **Resultado:** cerrar, recargar o abandonar la aplicación dentro de esa ventana puede cancelar el temporizador antes de escribir el último estado.
- **Riesgo:** pérdida silenciosa de la última edición, agravada porque el estado funcional permanece como `guardado` mientras la escritura está pendiente.
- **Cobertura ausente:** no hay pruebas directas del debounce, de su cancelación o del cierre con una escritura pendiente.
- **Corrección propuesta:** marcar el estado como pendiente antes de programar, disponer de un vaciado síncrono y seguro al ocultar o abandonar la página y cubrirlo con temporizadores simulados.
- **Corrección aplicada:** el estado pasa a `guardando` al editar, el último valor pendiente se fuerza en `pagehide` o al ocultar la página y una prueba con temporizadores confirma que solo se escribe una vez.

### CAL-001 — El redondeo monetario negativo no era simétrico

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Resultado previo:** un valor de `-100,5` céntimos se redondeaba a `-100`, mientras `100,5` se redondeaba a `101`.
- **Corrección aplicada:** el redondeo half-up se realiza alejándose de cero en ambos signos; `toCents` usa esa misma regla centralizada.

### CAL-002 — La búsqueda de precio máximo omitía el extremo de rangos no alineados

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** en un rango estrecho o cuyo máximo no coincidía con pasos de 1.000 euros, el extremo superior podía no evaluarse y el precio máximo devuelto quedaba por debajo del real.
- **Corrección aplicada:** el barrido siempre evalúa el máximo exacto, conserva el último punto realmente comprobado y rechaza rangos invertidos.

### CAL-003 — Ofertas rechazadas o inviables distorsionaban el ranking válido

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** una oferta rechazada muy barata podía fijar los mínimos de normalización y reducir artificialmente la puntuación de las candidatas válidas.
- **Corrección aplicada:** las referencias de coste, cuota y desembolso se calculan con ofertas aptas; si ninguna lo es, se conserva una comparación meramente informativa.

### CAL-004 — Una vivienda retirada podía fijar la referencia de coste por metro cuadrado

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Resultado previo:** una vivienda ya no disponible y excepcionalmente barata rebajaba la puntuación económica de todas las viviendas comprables.
- **Corrección aplicada:** la referencia se obtiene de viviendas disponibles; solo se usan retiradas cuando no existe ninguna disponible.

### CAL-005 — La cancelación total usaba la comisión de amortización parcial

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** una amortización que cancelaba todo el capital aplicaba siempre `amortizacionParcial`, aunque la oferta tuviera un porcentaje distinto para cancelación total.
- **Corrección aplicada:** el motor acepta ambas comisiones y aplica la total cuando el pago extraordinario cancela el saldo completo.

### CAL-006 — El punto de equilibrio de vinculaciones no representaba el flujo de caja

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Resultado previo:** el mes de equilibrio comparaba coste del producto con intereses contables ahorrados, aunque la salida mensual real cambia por la diferencia entre cuotas.
- **Corrección aplicada:** el equilibrio acumula la diferencia de cuotas menos el coste del producto. El beneficio de toda la vida conserva la comparación de intereses totales, que reconcilia escenarios con el mismo capital y plazo.

### CAL-007 — Los ingresos extraordinarios se incorporaban un corte mensual tarde

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** un ingreso con fecha 1 de marzo aparecía en el ahorro de abril; un ingreso anterior al inicio también podía reaparecer como futuro.
- **Corrección aplicada:** cada corte suma solo eventos con `fechaAnterior < fechaEvento <= fechaCorte`. Hay pruebas para fechas exactas, eventos entre cortes y eventos ya cobrados.

### CAL-008 — El crecimiento de la vivienda se aplicaba también a gastos fijos

- **Prioridad:** P2.
- **Estado:** corregido y verificado.
- **Resultado previo:** el crecimiento anual configurado multiplicaba todo el efectivo requerido, incluidas notaría, mudanza y otras partidas fijas.
- **Corrección aplicada:** Mi plan y el encaje de viviendas proyectan primero el precio futuro y recalculan para cada mes la entrada, los impuestos por tramos y los gastos aplicables.

### DAT-010 — La caché del TIN del INE admitía datos corruptos

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** una caché con tipo negativo, mes inexistente o fecha de consulta inválida podía devolverse como respaldo si la red fallaba.
- **Corrección aplicada:** se validan rango del tipo, periodo mensual real y fecha ISO parseable; las observaciones remotas con fecha mal formada también se rechazan de forma controlada.
- **Contraste oficial:** la serie usada es `HPT64408`, “Viviendas. Tipo de interés medio. Total Nacional. Base nueva. Mensual. Total”; el dato publicado para mayo de 2026 es 2,98 %.

### INT-001 — Los apartados de capacidad usaban rangos de búsqueda distintos

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** Capacidad detenía la búsqueda en 2.000.000 euros, mientras Resumen y Escala llegaban hasta 10.000.000. Un mismo perfil podía mostrar precios máximos diferentes según el apartado.
- **Corrección aplicada:** Resumen, Capacidad y Escala comparten `RANGO_BUSQUEDA_CAPACIDAD`. También se corrigió la descripción del límite cómodo para no afirmar que incluye el ahorro cuando ese criterio mide el esfuerzo mensual.
- **Verificación:** lint, TypeScript y las 353 pruebas pasan después de centralizar el rango.

### INT-002 — Editar una vivienda podía borrar su procedencia y corromper el historial de precios

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** `datosParaGuardar` reconstruía el objeto solo desde el borrador editable. Al editar un favorito desaparecían `origenInmobiliaria`, `catalogoViviendaId` y `yaNoDisponible`, de modo que dejaba de reconocerse como favorito y podía añadirse otra vez. Cada cambio de precio añadía de nuevo el precio anterior aunque ya fuera el último del historial; además, una vivienda antigua sin fecha podía generar una entrada de historial con fecha vacía, no válida para el esquema.
- **Corrección aplicada:** las ediciones conservan los metadatos no editables, normalizan textos y reformas, inicializan el historial desde el primer guardado y solo añaden un precio cuando cambia. La fecha del cambio sirve de respaldo si el registro anterior no tenía fecha.
- **Cobertura:** pruebas directas de inicialización, no duplicación y respaldo de fecha; la detección de duplicados comparte ahora una única regla por catálogo, portal e identificador o URL.

### INT-003 — El flujo de inmobiliaria de Inmuebles no ejecutaba las operaciones remotas

- **Prioridad:** P1.
- **Estado:** corregido en el flujo actual; la auditoría completa del contrato HTTP queda para el bloque API/RLS.
- **Resultado previo:** esta pantalla previsualizaba el código, pero no llamaba al canje atómico; añadir un favorito solo creaba la copia local; desvincular no llamaba a la API y además borraba los favoritos locales, pese a que el diálogo prometía conservarlos.
- **Corrección aplicada:** el vínculo se canjea antes de cargar el catálogo, el favorito se registra de forma remota y la desvinculación usa su ruta protegida. Los favoritos locales se conservan al desvincular. Un `409` remoto permite reconstruir una copia local que hubiera sido eliminada o que proceda de otra instalación.
- **Pendiente del bloque API:** el contrato todavía no ofrece lectura ni eliminación explícita de favoritos remotos, por lo que falta comprobar sincronización completa entre dispositivos.

### INT-004 — Los favoritos no reflejaban cambios de precio ni retiradas del catálogo

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** una vivienda se copiaba una sola vez. Las cargas posteriores del catálogo no actualizaban el precio ni marcaban la retirada, por lo que coste, encaje y recomendación podían seguir usando una cifra obsoleta.
- **Corrección aplicada:** cada carga satisfactoria del catálogo reconcilia los favoritos de la inmobiliaria: registra el cambio de precio sin duplicados, recupera una ficha republicada y marca `yaNoDisponible` cuando deja de publicarse. Las retiradas siguen visibles como referencia, pero ya no pueden resultar recomendadas.

### INT-005 — El encaje futuro comprobaba el ahorro proyectado con una cuota del presente

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** `evaluarEncajePlanVivienda` recalculaba el efectivo necesario desde el precio futuro, pero solo validaba el ratio bancario con el precio actual. Una vivienda podía mostrarse como alcanzable dentro de varios años aunque el crecimiento configurado elevase entonces la financiación y la cuota por encima del límite.
- **Corrección aplicada:** cada corte mensual recalcula precio, entrada, impuestos, gastos, financiación y cuota; el primer mes alcanzable debe cumplir simultáneamente ahorro recomendado y ratio bancario. Una prueba parte de una cuota viable hoy y confirma que el crecimiento futuro cambia el limitante a ingresos.

### INT-006 — La importación OCR podía confundir gastos o superficie útil con los datos principales

- **Prioridad:** P1 para el precio y P2 para la superficie.
- **Estado:** corregido y verificado.
- **Resultado previo:** el primer importe seguido de euros se tomaba como precio de venta. Si una captura mostraba antes la comunidad o el precio por metro cuadrado, podía guardarse una vivienda de 200.000 euros como si costara 120 o 2.500 euros. La primera superficie se trataba como construida aunque estuviera rotulada como útil y después apareciera la construida.
- **Corrección aplicada:** se excluyen importes de comunidad, IBI, honorarios, reserva, tasación, mensualidades y precio por metro cuadrado, además de pequeños gastos aislados. La superficie marcada como construida tiene prioridad y la útil se conserva separada.
- **Cobertura:** casos con comunidad, precio por metro cuadrado y ambas superficies en el mismo texto.

### INT-007 — Las cifras de una vivienda podían combinar ofertas incompatibles o rechazadas

- **Prioridad:** P1.
- **Estado:** corregido y verificado al auditar Hipoteca.
- **Resultado previo:** la tarjeta obtenía la entrada mínima, la menor cuota y el menor pago al banco de ofertas distintas, incluidas rechazadas o calculadas para otro precio de compra. El total de efectivo omitía comisión de apertura y costes iniciales de vinculaciones.
- **Corrección aplicada:** solo se consideran ofertas no rechazadas cuyo precio coincide con la vivienda actual; una única oferta de menor coste real aporta entrada, cuota y pago al banco. El efectivo total suma también comisión y vinculaciones iniciales y el desglose las muestra de forma explícita.

### INT-008 — Los datos fiscales y recurrentes no se pueden configurar por vivienda

- **Prioridad:** P1.
- **Estado:** pendiente de ampliación del modelo.
- **Evidencia:** `calcularCosteVivienda` y `evaluarEncajePlanVivienda` aplican a todas las candidatas el mismo `estadoVivienda`, condición VPO, valor de referencia fiscal y costes recurrentes guardados en preferencias. El contrato del catálogo remoto tampoco distingue exterior, garaje o trastero; la copia local debe usar valores conservadores hasta que la persona los revise.
- **Riesgo:** comparar vivienda nueva y usada, valores fiscales distintos o cuotas de comunidad e IBI diferentes puede producir impuestos, coste mensual y recomendación incorrectos aunque cada fórmula aislada sea correcta.
- **Corrección propuesta:** incorporar anulaciones por vivienda para fiscalidad y costes recurrentes y representar los atributos del catálogo como verdadero, falso o desconocido, sin convertir ausencia de información en una negativa definitiva.

### INT-009 — El Simulador no reproducía todas las condiciones de la oferta guardada

- **Prioridad:** P1 para el suelo y la TAE; P2 para los comparadores y la edición de vinculaciones.
- **Estado:** corregido y verificado.
- **Resultado previo:** `flujoInputDesdeEscenario` recibía siempre `sueloTin: 0`, por lo que una oferta variable o mixta guardada con suelo mostraba en el Simulador una cuota y unos intereses distintos de los usados por Ofertas y Amortización. Vaciar la TAE oficial guardaba `0`, y esa cifra podía marcarse como la menor TAE frente a ofertas con una TAE real. La pantalla tampoco permitía editar el coste inicial ni el crecimiento anual de una vinculación, aunque ambos entran en el coste real y la TAE.
- **Corrección aplicada:** el flujo usa el escenario completo y expone el suelo TIN; una TAE oficial solo se persiste y compara cuando es finita y positiva, también para datos antiguos. Los productos vinculados permiten introducir coste inicial y subida anual. Los comparadores muestran todos los plazos estándar hasta 40 años y limitan la entrada adicional al capital pendiente para no generar filas duplicadas o importes imposibles.
- **Cobertura:** conversión simulación/oferta sin TAE, ranking que ignora el cero heredado y pruebas ya existentes del efecto del suelo, vinculaciones y flujos.

### CAL-009 — El ahorro neto por amortizar omitía productos vinculados que dejan de pagarse

- **Prioridad:** P1.
- **Estado:** corregido y verificado.
- **Resultado previo:** al reducir el plazo o cancelar la hipoteca, el flujo dejaba de generar costes vinculados, pero `ahorroNeto` solo sumaba intereses evitados y restaba la comisión. El resultado podía infravalorar materialmente el ahorro de terminar antes.
- **Corrección aplicada:** el resultado reconcilia los costes vinculados del flujo original y del amortizado; el ahorro neto es ahora intereses evitados más vinculaciones evitadas menos comisión. Los costes iniciales ya pagados no se vuelven a incluir.
- **Cobertura:** una prueba con un producto de coste anual confirma el ahorro vinculado, la diferencia entre ambos flujos y la identidad completa del ahorro neto.

### INT-010 — El cuadro anual de amortización no sumaba todos los pagos mostrados

- **Prioridad:** P1 para el total anual; P2 para los mensajes de estado y comisión.
- **Estado:** corregido y verificado.
- **Resultado previo:** “Pagas en total” sumaba cuota, amortización extraordinaria y comisión, pero omitía `costesVinculados`. El aviso solo citaba la comisión parcial incluso si el pago cancelaba toda la deuda y el motor aplicaba la comisión total. Una oferta pendiente o rechazada también se describía como una hipoteca que la persona ya estaba pagando.
- **Corrección aplicada:** el resumen anual puro incluye vinculaciones y las desglosa; la primera cuota avisa del coste vinculado adicional. La interfaz distingue comisión parcial y total, reserva “Ahora pagas” para ofertas firmadas y muestra por separado los productos evitados en el resultado de amortización.
- **Cobertura:** pruebas del resumen anual con cuota, pago extra, vinculación y comisión, sin mezclar el desembolso inicial; pruebas específicas de comisión total y ahorro vinculado.

### INT-011 — La importación remota no llegaba al formulario y convertía ausencia en “no”

- **Prioridad:** P1.
- **Estado:** corregido, desplegado y verificado en producción.
- **Resultado previo:** `importarAnuncioIdealista` y la función Netlify no tenían ningún consumidor en la interfaz. Firecrawl recibía la instrucción de devolver `false` cuando garaje o trastero no aparecieran, y el servidor convertía cualquier booleano ausente o mal formado en `false`.
- **Riesgo:** la aplicación anunciaba importación remota, pero solo ofrecía OCR; si se conectaba el servicio, podía guardar como negativas características que simplemente no constaban.
- **Corrección aplicada:** el botón de enlace usa el servicio y el mapeo común. Los booleanos son opcionales en extracción, transporte y normalización; el mapeo solo modifica un interruptor cuando existe evidencia explícita y no borra el texto OCR con una importación estructurada.
- **Cobertura:** URL canónica, credenciales y puertos rechazados, parámetros eliminados, falsos explícitos conservados y booleanos ausentes omitidos.

### API-001 — El contrato de importación confiaba en respuestas ilimitadas y sin procedencia

- **Prioridad:** P1.
- **Estado:** corregido, desplegado y verificado en producción.
- **Resultado previo:** cliente y función aceptaban cuerpos sin límite; la función ignoraba `success`, `metadata.sourceURL` y el estado del documento de origen. Una respuesta HTTP 200 podía atribuir datos de otro anuncio o aceptar valores fuera de las cotas de la interfaz.
- **Corrección aplicada:** límites de URL, petición, proveedor y respuesta; `Content-Type`, método y `Allow`; timeout distinguible; cotas de precio, superficie, habitaciones y textos; `success`, identificador de anuncio, URL de origen y estado remoto comprobados. Firecrawl recibe esquema sin campos obligatorios y la instrucción de no inferir ni completar ausencias; se desactiva caché para no importar precios obsoletos.
- **Contraste oficial:** `/v2/scrape` con formato JSON es síncrono y devuelve `success`, `data.json` y metadatos de origen; `storeInCache: false` evita almacenar la página y `maxAge: 0` fuerza lectura actual.

### API-002 — El cliente Hipotecas API no validaba respuestas ni renovaba la sesión

- **Prioridad:** P1.
- **Estado:** corregido, desplegado y verificado en producción.
- **Resultado previo:** cualquier JSON 2xx se convertía por aserción a la interfaz TypeScript; JSON inválido, respuestas HTML, cuerpos excesivos y fallos de red escapaban con errores no uniformes. Solo se persistía el access token aunque el contrato devolvía refresh token.
- **Corrección aplicada:** validación Zod de todas las respuestas, límites y tipo de contenido, timeout, estado HTTP en `ErrorHipotecasApi`, persistencia y rotación de refresh token y un único reintento tras 401. Las respuestas incompletas se rechazan en vez de completar campos.
- **Cobertura:** respuesta válida, 2xx incompleto, no JSON, tamaño declarado excesivo, 204, creación de sesión anónima y renovación con repetición de la solicitud.

### API-003 — El flujo “sin cuenta” llamaba a rutas que exigían JWT

- **Prioridad:** P1 funcional.
- **Estado:** cerrado en producción el 18 de agosto de 2026.
- **Resultado previo:** previsualizar el código era público, pero confirmar llamaba a `/agency-links/redeem`, favoritos y desvinculación sin que el cliente hubiera creado sesión. La Edge Function respondía 401. El catálogo por código mantenía el código activo como credencial reutilizable y no reconciliaba correctamente consumo y acceso posterior.
- **Corrección aplicada:** cada instalación crea bajo demanda una sesión anónima de Supabase, canjea con su JWT y carga después el catálogo protegido por RLS. El código deja de ser la credencial persistente y se elimina la lectura pública del catálogo por query string.
- **Cierre en producción:** **Allow anonymous sign-ins** está activo y `rate_limit_anonymous_users` queda explícitamente en 30 altas por hora e IP. La Edge y el frontend están desplegados. El E2E real validó sesión anónima, contrato de correo `null`, preview, canje, reintento idempotente, catálogo, favorito, refresh y desvinculación. CAPTCHA/Turnstile y una tarea de limpieza periódica siguen recomendados como endurecimiento adicional.

### RLS-001 — Un cliente podía vincular cualquier inmobiliaria y abrir un borrador por UUID

- **Prioridad:** P1 de seguridad.
- **Estado:** cerrado en producción el 18 de agosto de 2026.
- **Evidencia reproducida en transacción revertida:** una identidad autenticada insertó directamente un vínculo a una inmobiliaria arbitraria; después, sin vínculo, insertó como favorito el UUID de un borrador ajeno. `can_read_agency_property` convirtió ese favorito en permiso de lectura. Resultado previo: `arbitrary_link_inserted = 1` y `draft_read_after_favorite = 1`.
- **Corrección aplicada:** el vínculo solo admite `SELECT` y `DELETE`; el `INSERT/UPDATE` queda reservado a `redeem_agency_invitation_code`. Un favorito de catálogo solo se inserta si la vivienda está publicada, la agencia está activa y existe vínculo del mismo usuario. Se retiraron privilegios de tabla innecesarios a `anon` y `authenticated`.
- **Verificación:** las políticas antiguas ya no existen, las nuevas políticas y privilegios mínimos están activos y el E2E devuelve 404 al intentar guardar otra vivienda después de desvincularse.

### RLS-002 — Los agentes podían alterar códigos sin función atómica ni auditoría

- **Prioridad:** P1 de integridad.
- **Estado:** cerrado en producción el 18 de agosto de 2026.
- **Resultado previo:** la política `agents manage their codes` concedía `ALL`; un agente insertó directamente un código con `max_uses = 999999`, sin límite ni entrada de auditoría.
- **Corrección aplicada:** solo lectura directa; generación y revocación mediante funciones `SECURITY DEFINER`, permisos de ejecución mínimos, máximo 10.000 usos, caducidad futura, código de ocho caracteres con reintentos ante colisión y restricciones equivalentes en tabla.
- **Verificación:** la política `agents manage their codes` desapareció, `authenticated` conserva solo `SELECT` directo y las funciones auditadas son las únicas operaciones de escritura expuestas.

### SQL-001 — Repetir un canje consumía usos y los estados caducados no persistían

- **Prioridad:** P1.
- **Estado:** corregido y verificado en producción.
- **Resultado previo:** un reintento HTTP del mismo cliente incrementaba otra vez `uses_count`. Las ramas de caducado y agotado actualizaban el estado y luego lanzaban excepción; PostgreSQL revertía también esa actualización.
- **Corrección aplicada:** un vínculo ya existente a la misma inmobiliaria devuelve el mismo resultado sin consumir ni auditar de nuevo. El listado calcula el estado caducado efectivo sin afirmar que se persistió. El E2E de producción ejecutó dos canjes consecutivos y confirmó `uses_count = 1`.

### SQL-002 — Eliminar una inmobiliaria fallaba si alguna vivienda tenía favorito remoto

- **Prioridad:** P1 operativo.
- **Estado:** corregido y aplicado en producción.
- **Resultado previo:** `delete_agency` eliminaba vínculos y luego la agencia, pero la cascada de viviendas chocaba con `client_favorites.agency_property_id ON DELETE RESTRICT`.
- **Corrección aplicada:** se eliminan primero las referencias remotas a viviendas de esa agencia; los favoritos locales del navegador se conservan. La prueba revertida dejó agencia, vivienda y referencia remota a cero.

### SQL-003 — La base no imponía varias cotas asumidas por la Edge Function

- **Prioridad:** P2.
- **Estado:** corrección SQL aplicada en producción y compatible con los datos actuales.
- **Resultado previo:** una llamada directa a Data API podía guardar coordenadas fuera de rango, superficies, habitaciones, textos o límites de uso muy superiores a los admitidos en la interfaz. `agency_users` permitía varias agencias por cuenta aunque `agentContext().maybeSingle()` presupone una.
- **Corrección aplicada:** restricciones de integridad equivalentes y unicidad de `agency_users.user_id`. La comprobación previa halló cero filas remotas incompatibles.

## Comprobaciones correctas del bloque

- Los importes monetarios persistidos se validan como enteros finitos y no negativos.
- El perfil exige entre uno y tres titulares en el esquema actual.
- Las periodicidades antiguas de deuda reciben el valor mensual por defecto.
- Los cálculos mensuales prefieren la lista normalizada de otros ingresos y solo usan el escalar antiguo como respaldo.
- El alquiler marcado como gasto actual no se vuelve a descontar mediante el campo histórico de respaldo.
- Un JSON que no puede validarse se conserva en el área local de recuperación.
- Los fallos de escritura de `localStorage` se capturan y se comunican al proveedor de estado.
- La URL remota importada no admite credenciales, puertos alternativos ni una procedencia distinta del anuncio pedido.
- La ausencia de exterior, garaje o trastero no se convierte en una negativa.
- Las respuestas HTTP de Hipotecas API se validan antes de llegar a la interfaz.
- Un agente no lee viviendas de otra inmobiliaria; con el SQL preparado tampoco puede mutar códigos fuera de las funciones auditadas.
- Un cliente solo puede crear como favorito remoto una vivienda publicada de su vínculo activo.

## Fuentes oficiales contrastadas

- Texto consolidado aragonés de ITP/AJD: https://boe.es/buscar/act.php?id=BOA-d-2005-90006&p=20250707&tn=0
- Portal tributario de Aragón, TPO: https://www.aragon.es/-/transmisiones-patrimoniales-onerosas
- Portal tributario de Aragón, AJD: https://www.aragon.es/-/actos-juridicos-documentados-documentos-notariales-y-judiciales-
- AEAT, IVA en compra de vivienda: https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/compro-vivienda-tengo-que-pagar-itp.html
- Catastro, valor de referencia: https://www.catastro.hacienda.gob.es/es-ES/faqs.html
- INE, serie HPT64408: https://ine.es/consul/serie.do?L=0&d=true&s=HPT64408
- Firecrawl, referencia oficial de `POST /v2/scrape`: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Supabase, sesiones anónimas y controles RLS: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase, límites de Auth: https://supabase.com/docs/guides/auth/rate-limits
- Supabase JS, `signInAnonymously`: https://supabase.com/docs/reference/javascript/auth-signinanonymously
- PostgreSQL, seguridad por filas: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## Siguientes comprobaciones

- Actualizar los E2E funcionales cuyos selectores y rutas ya no corresponden a la aplicación actual.
- Añadir E2E automatizados y repetibles para agente y superadmin; el cliente anónimo ya se comprobó contra producción.
- Configurar CAPTCHA/Turnstile cuando existan claves del proveedor y programar limpieza de usuarios anónimos antiguos.
- Completar lectura y eliminación de favoritos remotos si se decide sincronización entre dispositivos.
- Diseñar la ampliación de modelo pendiente para fiscalidad y costes específicos por vivienda (`DAT-003` e `INT-008`).

## Punto de reanudación

Revisión detenida tras cerrar en producción los P1 de **importación remota → cliente Hipotecas API → Edge Function → funciones SQL → RLS**. Los tres ficheros SQL están aplicados, las políticas vulnerables fueron retiradas, Auth anónimo está activo con límite 30/h, la Edge fue desplegada y Netlify publicó el deploy `6a847aa213d61104eb8eca83`.

El E2E de cliente anónimo pasó completo y sus datos técnicos fueron eliminados. Durante la prueba se corrigió una última incompatibilidad real: Supabase entrega correo vacío para el usuario anónimo y la Edge ahora lo normaliza a `null`. No volver a aplicar SQL ni repetir esta auditoría contractual salvo cambio de esquema.

No repetir persistencia, motor financiero, reconciliación de pantallas ni esta auditoría contractual. Siguen abiertos `DAT-003`, `INT-008`, la sincronización remota completa de favoritos y la actualización de E2E.

La validación de cierre deja lint, TypeScript y `deno check` correctos, con 35 archivos de pruebas y 381 pruebas correctas. Producción quedó sin códigos, viviendas, favoritos, usuarios ni auditorías técnicas del E2E.
