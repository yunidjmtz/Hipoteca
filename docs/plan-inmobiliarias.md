# Plan: catálogo de inmobiliaria para clientes

## Objetivo

Ampliar la aplicación para que una inmobiliaria pueda publicar y gestionar su catálogo, y para que sus clientes puedan consultarlo desde la aplicación, abrir la ficha original de cada vivienda y guardarla en favoritos para analizar y simular su hipoteca.

La funcionalidad actual de viviendas personales se conserva: una persona podrá seguir añadiendo viviendas que haya encontrado fuera del catálogo de su inmobiliaria.

## Experiencias y roles

| Rol | Acceso | Acciones principales |
| --- | --- | --- |
| Cliente | Área cliente | Vincular una inmobiliaria mediante código, ver su catálogo, abrir la ficha externa y gestionar favoritos. |
| Agente inmobiliario | Panel privado de su inmobiliaria | Crear, editar, publicar, retirar y compartir viviendas; generar y revocar códigos. |
| Administrador | Administración interna | Crear inmobiliarias, gestionar agentes y resolver incidencias. |

Una persona cliente tendrá inicialmente una única **inmobiliaria activa**. Sus favoritos personales no se borrarán si cambia o desvincula la inmobiliaria.

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
5. Al confirmar, la inmobiliaria queda vinculada y se carga su catálogo.

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

### Fase 2 — Autenticación y persistencia ⏳ Cliente listo para activar

- El proyecto Supabase ya contiene las tablas, controles de acceso y funciones de canje.
- La aplicación permite al cliente crear cuenta o iniciar sesión, comprobar y canjear un código,
  cargar el catálogo real, guardar favoritos y desvincularse.
- La Edge Function `hipotecas-api` queda desplegada como capa HTTP entre la aplicación y Supabase.
- **Pendiente de activación:** definir `VITE_HIPOTECAS_API_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` en el entorno de Netlify y desplegar el frontend.

**Resultado:** cada cliente ve únicamente el catálogo de la inmobiliaria que le ha invitado.

### Fase 3 — Panel inmobiliaria

- Construir login y navegación privada del agente.
- Crear gestión de viviendas, fotos, URL externa y estados de publicación.
- Implementar generación, listado y revocación de códigos.

**Resultado:** la inmobiliaria gestiona autónomamente el catálogo que ven sus clientes.

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
