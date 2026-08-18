# Plan de revisión de datos, cálculos y reglas de negocio

## Objetivo

Comprobar que los datos se capturan, normalizan, guardan y recuperan correctamente, y que todos los cálculos financieros, fiscales e hipotecarios producen resultados trazables y coherentes en toda la aplicación.

Esta revisión no evalúa colores, tipografía, distribución, animaciones ni acabado visual. Solo se revisan elementos de interfaz cuando afectan a la entrada, salida o persistencia de datos.

## Línea base — 16 de agosto de 2026

- `npm.cmd run lint`: correcto.
- `npx.cmd tsc -b`: correcto.
- `npm.cmd test`: 31 archivos y 316 pruebas correctas.
- `npm.cmd run test:cobertura`: las pruebas pasan, pero el comando falla porque la cobertura de ramas es 87,30 % y el mínimo configurado es 90 %.
- `npm.cmd run e2e`: 14 de 40 ejecuciones correctas y 26 fallidas. La mayoría de los fallos observados buscan campos, textos o rutas que ya no coinciden con el flujo actual; deben clasificarse antes de considerarlos defectos funcionales.
- No existe todavía una suite automatizada equivalente para `src/services/hipotecasApi.ts`, la función Edge `hipotecas-api`, las funciones SQL remotas y la matriz completa de permisos RLS.
- Hallazgo inicial de persistencia: `ESTADO_INICIAL.schemaVersion` vale 13, mientras que `SCHEMA_ACTUAL` vale 12. Esto puede impedir que los datos de versión 12 ejecuten la migración a versión 13.

La línea base se obtuvo con cambios locales preexistentes. La revisión debe preservarlos y no atribuirlos al proceso de auditoría.

## Principios de revisión

1. Cada cifra debe poder trazarse desde su entrada hasta su presentación y exportación.
2. Los resultados esperados se calcularán de manera independiente al código de producción.
3. El dinero se validará en céntimos y con una regla de redondeo explícita.
4. Los porcentajes se distinguirán siempre entre decimal interno y porcentaje mostrado.
5. La misma operación debe producir la misma cifra en todos los apartados que la consumen.
6. Una prueba que solo repita la misma implementación no se considerará validación independiente.
7. Los permisos se comprobarán tanto por operaciones permitidas como por operaciones que deben rechazarse.

## Matriz de apartados

### 1. Tus datos

- Ingresos de uno a tres titulares, con 12 o 14 pagas.
- Conversión mensual de ingresos, deudas, gastos y otros ingresos según periodicidad.
- Tratamiento del alquiler actual antes y después de la compra.
- Ahorros actuales, ahorro mensual previsto e ingresos extraordinarios con fecha.
- Edades, situación laboral y efecto sobre el plazo hipotecario.
- Valores vacíos, cero, límites, duplicados y entradas inválidas.
- Propagación del cambio a Resumen, Mi plan, Inmuebles e Hipoteca.

### 2. Resumen

- Ingresos y gastos mensuales normalizados.
- Dinero libre mensual y capacidad de ahorro.
- Precio máximo cómodo, bancario y absoluto.
- Ratios bancario y personal.
- Factor limitante y siguiente acción recomendada.
- Coherencia con Mi plan hipotecario y la escala de precios.

### 3. Mi plan hipotecario

- Precio objetivo y cuota estimada.
- Entrada, impuestos, gastos obligatorios y comerciales.
- Desembolso mínimo, recomendado y cómodo.
- Dinero faltante y progreso del ahorro.
- Fecha estimada de compra.
- Crecimiento anual del precio, rentabilidad del ahorro e ingresos extraordinarios.

### 4. Escala de precios

- Cálculo de cada escalón y límites exactos.
- Intervalos viables y discontinuidades provocadas por reglas fiscales.
- Búsqueda del precio máximo.
- Efecto del paso, rango, tasación, LTV, ratios y ahorro disponible.
- Propiedades de monotonía, salvo excepciones fiscales documentadas.

### 5. Inmuebles

- Alta manual, importación OCR, catálogo y favoritos.
- Equivalencia de unidades y campos entre todas las fuentes.
- Precio de venta, superficie, precio por metro cuadrado y reformas.
- Impuestos, gastos de compra, costes recurrentes y desembolso inicial.
- Ausencia de doble contabilización de reformas u otros gastos.
- Encaje con el plan y comparación entre viviendas.
- Duplicados, cambios de precio y retirada del catálogo.

### 6. Hipoteca y ofertas bancarias

- Hipoteca fija, variable y mixta.
- Sistema francés y recálculo en revisiones.
- LTV sobre el menor importe entre precio y tasación.
- Euríbor, diferencial, suelo, periodos y fechas de revisión.
- Bonificaciones, vinculaciones y sus costes.
- Comisiones y desembolso inicial.
- Cuota, intereses, coste total y flujo mensual.
- Separación entre TAE oficial y TAE estimada.
- Comparabilidad, pesos, puntuación y recomendación de ofertas.

### 7. Amortización anticipada

- Pagos extraordinarios únicos y múltiples.
- Aplicación en la cuota correcta según la fecha.
- Reducción de cuota o de plazo.
- Comisiones y ahorro neto.
- Nuevo vencimiento e intereses ahorrados.
- Capital pendiente final igual a cero.
- Coincidencia entre resumen, tabla y exportación.

### 8. Ajustes fiscales e hipotecarios

- ITP, IVA, AJD, tramos y bases fiscales.
- Valor de referencia fiscal y bonificaciones.
- Vivienda nueva o usada, destino y VPO especial.
- LTV, TIN, ratios, edad máxima y plazo.
- Aplicación inmediata de cambios a todos los cálculos.
- Fuente oficial y fecha de revisión de cada regla fiscal.

### 9. TIN de referencia del INE

- Dato, periodo y fecha de consulta.
- Caché, actualización forzada y caducidad.
- Respaldo sin conexión y errores de red.
- Respeto de un TIN configurado manualmente.

### 10. Persistencia, copia e importación

- Esquema y migraciones de versiones 1 a 13.
- Validación Zod y compatibilidad con campos opcionales.
- Guardado con debounce y guardado inmediato.
- Recuperación de JSON dañado.
- Exportación e importación sin pérdida de información ni céntimos.
- Restablecimiento conservando la configuración prevista.
- Funcionamiento con almacenamiento bloqueado o lleno.

### 11. Importación de anuncios

- Detección de fuente, extracción, OCR y mapeo.
- Datos incompletos o ambiguos.
- Identificador del anuncio y detección de duplicados.
- Historial de precios y conservación del texto original.
- Prohibición de inventar datos no extraídos.

### 12. Cliente e inmobiliaria

- Registro, inicio y cierre de sesión.
- Previsualización, canje y revocación del vínculo.
- Códigos inexistentes, caducados, agotados o revocados.
- Catálogo publicado de la inmobiliaria vinculada.
- Favoritos y retirada de propiedades.
- Aislamiento entre clientes e inmobiliarias.

### 13. Panel de agentes

- Lectura y modificación exclusiva de la inmobiliaria propia.
- Alta, edición y estados de viviendas.
- Importes almacenados en céntimos.
- Generación, límites, caducidad y revocación de códigos.
- Acceso de agentes y administradores de agencia.
- Registro de operaciones sensibles.

### 14. Superadministración

- Alta, edición, activación y eliminación de inmobiliarias.
- Alta, cambio de rol y retirada de empleados.
- Consecuencias sobre catálogo, códigos, clientes y auditoría.
- Conservación o eliminación intencionada de cuentas de usuario.
- Rechazo del acceso a usuarios sin rol de superadministración.

### 15. Supabase, API y RLS

- Validación manual de JWT en todas las rutas protegidas.
- Contratos HTTP, códigos de estado y validación de cuerpos.
- Matriz de permisos para anónimo, cliente A, cliente B, agente A, agente B, administrador de agencia y superadministrador.
- Operaciones cruzadas entre inmobiliarias y usuarios.
- Atomicidad del canje de códigos y operaciones concurrentes.
- Funciones SQL, RLS y auditoría.
- Ausencia de claves secretas en el frontend.

## Casos e invariantes transversales

- La suma del principal amortizado debe ser igual al capital inicial.
- El capital pendiente final debe ser cero.
- El total pagado debe reconciliar capital, intereses, comisiones y costes incluidos.
- Entrada y financiación deben respetar precio, tasación y LTV.
- Ningún impuesto, gasto, reforma o vinculación puede contarse dos veces.
- Aumentar el capital no puede reducir la cuota manteniendo el resto constante.
- Aumentar el plazo debe reducir la cuota y normalmente aumentar los intereses totales.
- Una amortización anticipada positiva no puede aumentar el capital pendiente.
- Exportar e importar debe conservar exactamente los datos válidos.
- Un cambio de ajuste debe invalidar cualquier resultado derivado anterior.
- Una operación no autorizada debe fallar sin modificar datos.

## Estrategia de pruebas

1. Casos de referencia con entradas y salidas calculadas independientemente.
2. Pruebas unitarias de fórmulas, redondeos y límites.
3. Pruebas generativas de invariantes con `fast-check`.
4. Pruebas de integración entre pantalla, estado, cálculo y almacenamiento.
5. Pruebas de contrato del cliente HTTP y la función Edge.
6. Pruebas SQL/RLS con identidades y agencias separadas.
7. Recorridos E2E funcionales por rol, sin aserciones visuales ajenas al dato.

## Registro de cada comprobación

Cada caso debe registrar:

- Identificador.
- Apartado y riesgo.
- Precondiciones y entradas.
- Fuente o regla de negocio.
- Resultado esperado.
- Resultado real.
- Tolerancia y regla de redondeo.
- Estado: correcto, defecto, prueba insuficiente o regla por confirmar.
- Evidencia y prueba automatizada asociada.

## Prioridad de incidencias

- **P0:** pérdida o corrupción de datos, cálculo monetario materialmente incorrecto, acceso entre usuarios o inmobiliarias, o exposición de secretos.
- **P1:** cifra incoherente entre apartados, regla fiscal incorrecta, migración incompleta o flujo principal no operativo.
- **P2:** caso límite incorrecto, mensaje funcional confuso o prueba insuficiente sin fallo demostrado.
- **P3:** mejora de mantenibilidad o claridad sin impacto actual en resultados.

## Orden de ejecución

1. Modelo de datos, esquemas, migraciones y persistencia.
2. Núcleo monetario, fechas y normalización de entradas.
3. Capacidad, gastos de compra, ahorro y fiscalidad.
4. Hipotecas, TAE, ofertas, vinculaciones y amortización.
5. Integración de cálculos en cada apartado.
6. Importación de anuncios y catálogo.
7. API, Supabase, funciones SQL y RLS.
8. Flujos E2E por rol y consolidación del informe.

## Criterios de aprobación

- Lint, TypeScript, pruebas unitarias y E2E funcionales correctos.
- Cobertura de ramas del motor igual o superior al 90 %.
- Matriz RLS completa y correcta.
- Diferencia máxima de un céntimo en resultados monetarios cuando la regla permita tolerancia.
- Diferencia máxima de 0,01 puntos porcentuales en TAE cuando corresponda.
- Reconciliación de cifras entre todos los apartados.
- Reglas fiscales documentadas con fuente y fecha.
- Las correcciones P1 de importación y contrato HTTP están verificadas en producción.
- Las incidencias P1 `API-003`, `RLS-001` y `RLS-002` están cerradas en producción desde el 18 de agosto de 2026.

## Estado de avance

- [x] Inventario inicial de apartados, motor, almacenamiento, API y pruebas.
- [x] Línea base de lint, TypeScript, unitarias, cobertura y E2E.
- [x] Auditoría de modelo de datos y persistencia.
- [x] Primera auditoría del motor financiero, fiscalidad, ahorro, ofertas y amortización.
- [x] Auditoría de integración por apartado para el flujo completo de cliente.
- [x] Auditoría de importación remota, Supabase, API, SQL y permisos; correcciones aplicadas y verificadas en producción.
- [ ] Informe final y cierre de incidencias.

### Resultado acumulado al 18 de agosto de 2026

- 381 pruebas correctas en 35 archivos.
- Última cobertura global completa registrada: 90,73 % de ramas, por encima del mínimo del 90 %.
- Lint y TypeScript correctos.
- La Edge Function supera `deno check`; los tres ficheros SQL están aplicados, Auth anónimo está activo con límite 30/h y las políticas RLS vulnerables ya no existen.
- Edge y frontend están desplegados; el E2E de cliente anónimo cubre preview, canje idempotente, catálogo, favorito, refresh, desvinculación y bloqueo posterior.
- Persistencia, migración inmediata anterior, versión futura, guardado al cerrar y round trip cubiertos.
- Corregidos defectos en redondeo, búsqueda de precio, ranking de ofertas y viviendas, comisión de cancelación, vinculaciones, ahorro neto por amortización, ingresos extraordinarios, proyección del precio, importación OCR y caché del INE.
- Reconciliados Resumen, Capacidad, Escala, Meta, Inmuebles, Hipoteca, Simulador y Amortización.
- Pendiente ampliar los datos personales y las anulaciones por vivienda para fiscalidad y costes recurrentes.

## Pausa y punto exacto para la siguiente ventana

- **Último bloque terminado:** cierre en producción de `API-003`, `RLS-001` y `RLS-002`, incluido SQL, Auth anónimo, Edge, Netlify y E2E de cliente.
- **Estado remoto:** endurecimiento aplicado, sesiones anónimas activas con límite 30/h y despliegue Netlify `6a847aa213d61104eb8eca83` en producción. No quedan artefactos técnicos del E2E.
- **Siguiente operación:** automatizar E2E de agente y superadmin, o continuar con la Fase 3 del panel privado de agentes.
- **Después:** CAPTCHA/Turnstile y limpieza programada de usuarios anónimos; sincronización remota completa de favoritos si se confirma como requisito.
- **No repetir:** persistencia, motor financiero, reconciliación de pantallas ni la auditoría contractual ya cerrada.
- **Pendientes de producto:** `DAT-003`, `INT-008`, sincronización remota completa de favoritos y actualización de E2E.
