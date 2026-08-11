# Plan: catálogo de inmobiliaria para clientes

## Objetivo

Ampliar la aplicación para que una inmobiliaria pueda publicar y gestionar su catálogo, y para que sus clientes puedan consultarlo desde la aplicación, abrir la ficha original de cada vivienda y guardarla en favoritos para analizar y simular su hipoteca.

La funcionalidad actual de viviendas personales se conserva: una persona podrá seguir añadiendo viviendas que haya encontrado fuera del catálogo de su inmobiliaria.

## Experiencias y roles

| Rol | Acceso | Acciones principales |
| --- | --- | --- |
| Cliente | Área cliente | Vincular una inmobiliaria mediante código, ver su catálogo, abrir la ficha externa y gestionar favoritos. |
| Agente inmobiliario | Panel privado de su inmobiliaria | Crear, editar, publicar, retirar y compartir viviendas; generar y revocar códigos. |
| Superadmin único | Administración interna | Crear inmobiliarias y crear/asignar la cuenta inicial de su agente. |

Una persona cliente tendrá inicialmente una única **inmobiliaria activa**. Sus favoritos personales no se borrarán si cambia o desvincula la inmobiliaria.

El superadmin es un rol global y único, separado de los roles `agent` y `admin` de cada inmobiliaria. Nadie puede obtenerlo desde la aplicación: se asigna en la configuración interna. Al crear una inmobiliaria, el superadmin define el correo y la contraseña inicial de su agente; esa cuenta queda limitada por RLS a su propia inmobiliaria.

## Área cliente

### Ofertas

La sección **Ofertas** tendrá dos pestañas:

1. **Mi inmobiliaria**
   - Muestra el catálogo publicado por la inmobiliaria vinculada.
   - Si no existe vínculo, presenta una explicación y el botón `+ Añadir inmobiliaria`.
   - Tras vincularse, muestra nombre y marca de la inmobiliaria, además de sus viviendas disponibles.
   - Cada vivienda incluye foto principal, precio, zona, datos clave y dos acciones:
     - `Ver ficha completa`: abre la URL del anuncio de la inmobiliaria en una pestaña nueva.
     - `+ Añadir a favoritos`: añade la vivienda a los favoritos del cliente. Tras hacerlo cambia a `✓ En favoritos`.
   - Si una vivienda deja de estar publicada, desaparece del catálogo, pero los favoritos existentes se marcan como `Ya no disponible` para conservar el contexto de la decisión.

2. **Mis favoritos**
   - Es la evolución de la vista actual de viviendas.
   - Contiene las viviendas guardadas desde el catálogo y las añadidas manualmente por el cliente.
   - Mantiene el botón `+ Añadir vivienda` para añadir viviendas externas.
   - Permite seleccionar la vivienda que se utilizará en los cálculos de la pestaña **Hipoteca**.
   - Las viviendas procedentes de catálogo muestran el origen, por ejemplo: `Ofrecida por Inmobiliaria Sol`.

### Vincular una inmobiliaria

1. El cliente abre **Ofertas → Mi inmobiliaria**.
2. Pulsa `+ Añadir inmobiliaria`.
3. Introduce el código que le ha facilitado el agente.
4. Antes de confirmar, la aplicación muestra el nombre de la inmobiliaria a la que se conectará.
5. Al confirmar, el código queda guardado solo en ese navegador y se carga su catálogo, sin crear cuenta ni iniciar sesión.

Una vez vinculada, el cliente contará con las acciones `Cambiar inmobiliaria` y `Desvincular inmobiliaria`.

## Panel de inmobiliaria

El panel exige inicio de sesión y solo permite a un agente operar sobre su propia inmobiliaria.

### Catálogo de viviendas

- Lista de las viviendas de la inmobiliaria con estados `Borrador`, `Publicada` y `Retirada`.
- Creación y edición con estos campos iniciales:
  - título;
  - precio;
  - zona, dirección opcional y coordenadas opcionales;
  - metros cuadrados, habitaciones y baños;
  - descripción;
  - imagen principal y galería opcional;
  - URL de la ficha completa del anuncio;
  - estado de publicación.
- Publicar y retirar una vivienda sin eliminarla.
- Vista previa de la tarjeta que verá el cliente.

### Códigos para clientes

- Acción `Generar código para cliente` visible desde el panel.
- Código corto y legible, por ejemplo `CASA-7K3P`.
- Al generarlo se puede copiar o compartir por el canal que prefiera la inmobiliaria.
- Un código se vincula a una única inmobiliaria y podrá tener:
  - fecha de caducidad;
  - límite de usos (uno por defecto);
  - estado activo, usado, caducado o revocado.
- El agente puede listar los códigos emitidos y revocarlos antes de que se utilicen.

## Modelo de datos inicial

```text
Inmobiliaria
  ├── Agentes
  ├── Viviendas de catálogo
  └── Códigos de vinculación

Cliente
  ├── Inmobiliaria activa (opcional)
  └── Favoritos
        ├── Referencia a vivienda de catálogo (opcional)
        └── Vivienda añadida manualmente (opcional)
```

Entidades sugeridas:

- `real_estate_agencies`: identidad, nombre comercial, logo y estado.
- `agency_users`: usuario autenticado, inmobiliaria y rol de agente/administrador.
- `agency_properties`: vivienda, datos del catálogo, URL externa, imágenes y estado de publicación.
- `agency_invitation_codes`: inmobiliaria, código, caducidad, límite de usos y estado.
- `client_agency_links`: cliente, inmobiliaria activa y fecha de vinculación.
- `client_favorites`: cliente, referencia opcional a `agency_properties` y/o datos de una vivienda manual.

Para una vivienda de catálogo, el favorito debe guardar la referencia a la vivienda original. Así se reflejan cambios de precio, disponibilidad y datos sin duplicar información.

## Reglas de negocio y permisos

- Un agente solo puede leer y modificar viviendas, códigos y datos de su propia inmobiliaria.
- Solo se muestran al cliente las viviendas en estado `Publicada` de su inmobiliaria activa.
- El código no revela datos de clientes y no concede acceso al panel de la inmobiliaria.
- El cliente puede desvincularse cuando quiera; esto elimina el vínculo, no sus favoritos.
- Una misma vivienda no se añade dos veces a favoritos.
- Las URLs externas se validan y se abren con protección de nueva pestaña (`noopener`).
- Las acciones de generar, utilizar y revocar códigos quedan registradas para auditoría.

## Fases de implementación

### Fase 1 — Base de producto y catálogo de demostración ✅ Completada

- Dividir **Ofertas** en `Mi inmobiliaria` y `Mis favoritos`.
- Mantener la funcionalidad actual en `Mis favoritos`.
- Crear tarjetas de catálogo y estados vacíos.
- Añadir el flujo visual de `Añadir inmobiliaria` e introducción de código.
- Usar datos de demostración mientras no exista persistencia real.

**Resultado:** se puede validar la experiencia de cliente de principio a fin.

### Fase 2 — Autenticación y persistencia ✅ Activa en producción

- El proyecto Supabase ya contiene las tablas, controles de acceso y funciones de canje.
- La aplicación permite al cliente comprobar y pegar un código, cargar el catálogo real,
  guardar favoritos en el navegador y desvincularse, sin crear cuenta ni iniciar sesión.
- La Edge Function `hipotecas-api` queda desplegada como capa HTTP entre la aplicación y Supabase.
- Las variables `VITE_HIPOTECAS_API_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` están
  configuradas en Netlify para producción, vistas previas y desarrollo.
- El frontend está publicado en https://hipotecasyuni.netlify.app y la función
  `hipotecas-api` está desplegada en Supabase.

**Resultado:** cada cliente ve únicamente el catálogo de la inmobiliaria que le ha invitado.

### Fase 3 — Panel inmobiliaria ✅ Implementada, pendiente de despliegue

- **3.1 Acceso del agente.** Añadir una entrada y rutas privadas para agentes;
  resolver la inmobiliaria del usuario autenticado desde `agency_users` y
  mostrar un estado claro si no tiene rol de agente.
- **3.2 API de agente.** Extender `supabase/functions/hipotecas-api/index.ts`
  con operaciones protegidas para consultar, crear, editar, publicar y retirar
  viviendas. Las consultas deben usar el JWT del agente y las políticas RLS
  existentes, nunca una clave de servicio para operaciones normales.
- **3.3 Gestión de códigos.** Usar la función SQL existente
  `generate_agency_invitation_code` para generar códigos; añadir listado y
  revocación conservando la auditoría en `agency_audit_log`.
- **3.4 Interfaz.** Crear el panel de catálogo con formulario de vivienda,
  selector de estado, vista previa de tarjeta y sección de códigos.
- **3.5 Pruebas.** Cubrir que un agente no puede operar otra inmobiliaria y que
  un cliente no accede al panel ni a datos de gestión.

**Resultado:** la inmobiliaria gestiona autónomamente el catálogo que ven sus clientes.

### Punto de continuación para la próxima sesión

Desplegar `hipotecas-api` y el frontend tras ejecutar lint, TypeScript y tests;
después verificar con una cuenta de agente y una cuenta de cliente el flujo
completo de publicación, código, canje y retirada. La función SQL adicional
`revoke_agency_invitation_code` está documentada en
`supabase/sql/agency-operations.sql` y ya se aplicó al proyecto remoto. No
ejecutar `supabase db push` ni reparar el historial de migraciones remoto.

### Fase 4 — Calidad operativa

- Añadir validaciones, auditoría y recuperación de errores.
- Notificar al cliente cuando un favorito cambia de precio o se retira, si se decide incluir notificaciones.
- Añadir métricas para inmobiliaria: visualizaciones, aperturas de ficha y añadidos a favoritos.
- Cubrir los flujos con pruebas de permisos y pruebas end-to-end.

## Criterios de aceptación del primer lanzamiento

- Un agente autenticado puede publicar una vivienda y generar un código activo.
- Un cliente puede canjear ese código desde **Mi inmobiliaria** y ver esa vivienda.
- El enlace `Ver ficha completa` abre la URL definida por el agente en una nueva pestaña.
- El cliente puede añadir esa vivienda a favoritos y usarla en el flujo de hipoteca.
- El cliente no puede ver ni acceder al catálogo de otra inmobiliaria.
- Una vivienda retirada deja de aparecer en el catálogo y permanece señalizada si ya era favorita.
- Un agente no puede modificar los datos de otra inmobiliaria.
