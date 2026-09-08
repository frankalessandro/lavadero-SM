# Lavadero SM — Funcionalidades del software

> Estado a la fecha de este documento. Referencia funcional de todo lo que el sistema hace hoy,
> organizado por rol. Para el detalle técnico de cada decisión, ver `CLAUDE.md` en la raíz del
> repo y las migraciones en `supabase/migrations/`.

---

## 1. Qué es

Sistema de gestión para un lavadero de carros que además opera como **parqueadero nocturno**.
Cubre el ciclo completo: recepción del vehículo, seguimiento del lavado, cobro y entrega, caja y
arqueo, inventario y ventas de nevera, comisiones y liquidación de personal, parqueadero, y los
paneles de control operativo y financiero.

- **Frontend:** React 19 + TypeScript, TanStack Router. Móvil/tablet como caso principal para
  jefe de zona y vigilante; escritorio para admin.
- **Backend:** Supabase (PostgreSQL). Autenticación real, políticas RLS por rol, todo el control
  antifraude aplicado a nivel de base de datos.
- **Sin conexión a datáfono ni facturación DIAN** (fuera de alcance). Los comprobantes son
  internos en pantalla / impresión térmica del navegador.

---

## 2. Acceso y roles

Se entra por `/login` con usuario y contraseña. Cada usuario tiene un rol y el sistema lo lleva a
su panel. Hay **una cuenta de acceso por rol** (compartida); la **persona** que responde por cada
turno se identifica aparte, con un registro propio de "personal de caja".

| Rol | A qué entra | Qué NO ve |
|---|---|---|
| **Administrador** | Todo: los dos dashboards, rentabilidad, operación, dinero, catálogo y precios, personal, configuración, auditoría | — |
| **Jefe de zona** | Recepción, seguimiento de lavados, caja diurna + conteo de inventario, ventas de nevera, inventario, liquidaciones (vista), asistencia | Costos, márgenes, utilidad, histórico financiero |
| **Vigilante** | Parqueadero (entrada/salida) y su propia caja nocturna | Operación del lavadero, comisiones, gastos, dashboards |

La restricción de datos es real (RLS en la base): un rol no puede leer lo que no le corresponde
aunque intente saltarse la interfaz.

- **Cierre de sesión automático** por inactividad.
- Cada creación, anulación, cambio de precio, movimiento de inventario y cambio de configuración
  queda en una **bitácora de auditoría** que solo el administrador consulta.

---

## 3. Control antifraude y auditoría (transversal a todos los roles)

- **Nada se elimina.** Las órdenes se **anulan** con motivo obligatorio y quedan visibles en
  reportes. Los maestros (lavadores, tipos de vehículo, productos, suscripciones) se **inactivan**,
  no se borran.
- **Historial inmutable.** Un turno de caja cerrado no se puede modificar. Una liquidación pagada
  no se puede anular. Las órdenes ya cobradas no se editan por vías laterales.
- **Bitácora de auditoría** (`/admin` › Operación › Auditoría): registra quién, cuándo y el
  antes/después de cada creación, anulación, cambio de precio, movimiento de inventario y cambio
  de configuración. Se escribe automáticamente en la base — no depende de que la interfaz se
  acuerde de registrarlo.
- **Consecutivo continuo de tiquetes** con **alerta de huecos**: si un número de tiquete nunca se
  confirmó, aparece marcado en el dashboard de admin y en Operación › Órdenes. Una orden anulada
  conserva su número y no cuenta como hueco.
- **Precios siempre desde la lista configurada**, nunca escritos a mano en el momento del cobro.
- **Comisiones fijadas al crear la orden** — no cambian aunque después se aplique un descuento o
  cambie la configuración.

---

## 4. Jefe de zona

### 4.1 Recepción de lavado (`/recepcion`)

Pantalla de una sola tarea, optimizada para el mostrador. Formulario en tres pasos de acordeón:

1. **Vehículo:** placa (autocompleta datos del cliente y del vehículo desde el historial de esa
   placa), nombre, teléfono y correo del cliente, tipo de vehículo.
2. **Servicio:** combo, o servicios individuales sueltos, o combo + adicionales. El precio sale
   de la matriz combo × tipo de vehículo; si no hay precio configurado para esa combinación, no
   deja continuar. Checkbox de "alto cilindraje" para motos (suma un recargo fijo).
3. **Pago / lavador:** se asigna un lavador sugerido por la **cola de rotación**. El lavador es
   **opcional** — si los cuatro están ocupados y el cliente hace cola, se registra sin asignar y
   se le pone lavador después desde el tablero. También se puede marcar "lavar entre dos".

Al registrar:

- Se abre un **comprobante de ingreso** en pantalla (referencia `LAV-####`, datos del vehículo,
  combo, lavador, precio, aviso de que se cobra al entregar).
- El formulario se reinicia con el siguiente lavador sugerido.

Ayudas del flujo:

- **Alerta de doble registro** para motos: si la placa ya tiene un lavado en proceso, avisa antes
  de registrar otra vez.
- El selector de lavador **oculta** a quien descansa hoy y **marca** (sin bloquear) a quien está
  ocupado o **no marcó llegada**.
- **Requiere turno de caja abierto** para registrar vehículos.

También se puede **corregir una orden**: si el combo o el precio quedaron mal y no se pueden
arreglar editando, el botón "Corregir" (desde el tablero) abre recepción con todo precargado; al
guardar, se crea la orden nueva y la anterior queda anulada, encadenada a la nueva. No se cobra
dos veces.

### 4.2 Dashboard = Seguimiento de lavados (`/jefe-zona`)

Es el tablero de trabajo del turno. Banner grande "Abrir recepción" arriba de todo.

**Tablero de dos columnas: "En proceso" y "Listos para cobrar".** Cada vehículo es una tarjeta con:

- Placa, combo, lavador(es), contador de tiempo en vivo (minutos desde que entró o desde que
  quedó listo).
- Acento de color por estado; una tarjeta sin lavador asignado se distingue con un badge "En
  cola".

**Acciones sobre cada tarjeta:**

- **Finalizar lavado** — pasa de "en proceso" a "listo".
- **Volver a proceso** — corrige un "finalizar" hecho sin querer.
- **Asignar / reasignar / quitar lavador** — incluye asignar por primera vez una orden que entró
  sin lavador, y el segundo lavador de un "lavar entre dos".
- **Agregar producto** — carga productos de nevera a un vehículo que está esperando; se cobran
  junto con el lavado al entregar (un solo pago). Chip "Productos por cobrar · $X" bajo la
  tarjeta, con opción de quitar líneas.
- **Editar datos del cliente** — placa, contacto y **tipo de vehículo** (cambiar el tipo recalcula
  precio y comisiones desde la lista).
- **Avisado** — marca manual de "ya le avisé al cliente que puede recoger".
- **Contactar** — abre WhatsApp con un mensaje armado (saludo con el nombre, "carro"/"moto" según
  el tipo, marca del negocio).
- **Corregir** — reemplaza la orden por una nueva (ver 4.1).
- **Finalizar y cobrar** en un paso — para cuando el cliente ya está esperando.

**Cobro y entrega:**

- Modal de cobro con **pago partido**: hasta 3 líneas por método (efectivo / transferencia /
  datáfono) que deben sumar exacto el total. Referencia obligatoria en transferencia/datáfono.
- **Descuento sobre el lavado** (bloque "Aplicar descuento"): monto fijo o porcentaje, con motivo
  y quién autoriza. El negocio absorbe el descuento — la comisión del lavador se paga completa.
  Permite cortesía total (lavado en $0).
- Si hay productos cargados, el cobro muestra "Lavado + Productos = Total".
- Al confirmar se abre el **comprobante de pago** (itemiza productos y descuento) y el vehículo
  queda entregado.

**Herramientas del tablero:**

- **Buscador por placa** + **filtro por lavador** (incluye "sin asignar").
- **Entregados hoy** — lista con precio neto (y "desc. −$X" si hubo descuento), método de pago, y
  botón para **corregir el reparto** de un pago ya registrado (cambiar "puse efectivo y era
  transferencia") — queda auditado, no cambia el total.
- **Tiempo promedio de atención** hoy, por combo y por lavador.
- **Estado de la caja** del turno (abierta / cerrada, responsable, base) con enlace a Caja.

### 4.3 Caja y turnos + conteo de inventario (`/jefe-zona/caja`)

**Apertura:**

- Se elige el responsable de una lista (personal de caja) y se ingresa la base inicial.
- **Conteo de inventario de apertura:** conteo ciego de cada producto de nevera/vitrina, luego se
  revela contra el cierre de la noche anterior. Cualquier diferencia exige justificación y ajusta
  el stock del sistema a lo que hay de verdad.

**Durante el turno:**

- **Gastos de caja menuda:** registrar lo que sale del cajón (domicilio, gasolina, un repuesto).
  Se descuenta del arqueo al cerrar.
- **Traspaso de responsabilidad:** pasarle el turno a otra persona sin cerrarlo, con registro.

**Cierre:**

- **Conteo de inventario de cierre** (obligatorio antes de cerrar la caja): conteo ciego → se
  revela el esperado (stock del sistema menos lo que está en cuentas abiertas) → por cada
  diferencia, justificación + nota; antes de registrar hay que marcar "ya reconté y busqué". Un
  faltante queda registrado a nombre del responsable del turno (a costo), estado "pendiente", para
  que el administrador lo revise. No se cobra en el momento.
- **Arqueo ciego de caja:** primero se pide el conteo físico del efectivo, y solo después se
  revela el valor esperado (base + lavados en efectivo + ventas en efectivo − gastos de caja). Si
  hay diferencia, la justificación es obligatoria. Se registra quién cierra y quién recibe.

**Turnos recientes:** últimos 5, solo lectura.

### 4.4 Ventas de nevera (`/jefe-zona/ventas`)

- **Carrito de mostrador:** grilla de productos con stepper, varias líneas, un solo "Cobrar" con
  **pago partido**. Genera un comprobante combinado con rango de consecutivos `VTA-N a VTA-M`.
- **Cuentas abiertas:** abrir una cuenta a nombre de alguien (lavador, acompañante, transeúnte sin
  vehículo), irle cargando productos a lo largo del rato (sin mover stock), y cerrarla cobrando
  todo junto con pago partido. El stock y el costo se fijan al cerrar. Anular una cuenta abierta
  con motivo.
- **Ventas de hoy:** lista con anulación (motivo obligatorio) y corrección de reparto del pago.

### 4.5 Inventario (`/jefe-zona/inventario`)

- **Registrar movimiento:** entrada / salida / ajuste (sin ver costos ni proveedor — eso es de
  admin).
- Dos tablas de stock: **insumos de lavado** (jabón, cera…) y **productos para vender** (nevera).
- Movimientos recientes.

### 4.6 Liquidaciones — vista informativa (`/jefe-zona/liquidaciones`)

Vista de solo lectura de lo que llevan acumulado los lavadores y el jefe de patio. **No genera
pagos** — eso es exclusivo del administrador. Cuenta solo órdenes entregadas.

### 4.7 Asistencia (`/jefe-zona/asistencia`)

- **Marcar llegada** de cada lavador (una vez por día).
- **Cronograma de descanso:** 4 lavadores, uno descansa cada lunes–jueves; viernes a domingo
  trabajan todos. El calendario se genera solo según el patrón de rotación y se puede corregir
  quién descansa una fecha puntual (swap entre dos).

---

## 5. Vigilante

Pantalla única, mobile-first (`/vigilante`).

### 5.1 Turno de caja

- **Abrir turno:** elegir responsable de la lista + base inicial.
- **Cerrar turno:** arqueo ciego de 2 pasos (conteo físico → revelar esperado/diferencia).
  Justificación obligatoria si hay diferencia. Registra quién cierra y quién recibe.
- Los botones de Entrada/Salida funcionan sin turno abierto (el movimiento queda sin turno); la
  exigencia del turno es de visibilidad, no de bloqueo.

### 5.2 Parqueadero

- **Stats:** vehículos adentro, dinero recaudado hoy.
- **Registrar entrada:** placa + modalidad (noche / mensualidad / fijo 24h).
  - Si la placa es **suscriptor** de mensualidad/fijo, muestra el estado: Al día / Por vencer /
    Vencida.
  - Si la placa **se lavó hoy**, avisa: regla 8, un vehículo lavado no paga parqueadero combinado.
- **Registrar salida:** selecciona el vehículo del patio.
  - Solo la modalidad **noche** cobra por movimiento: $8.000 fijo, **al retiro** (no al ingreso).
  - Mensualidad y fijo 24h **no cobran por visita** (se facturan aparte).
  - Alerta si la salida es **fuera de la ventana 7:00–8:00 am** (para noche y mensualidad). El
    monto de la "multa" está pendiente de definir — hoy solo se marca la alerta.
  - Repite los avisos de suscriptor y de lavado del día.
- **Lista del patio:** tarjetas, cada una abre el flujo de salida al tocarla; tiempo transcurrido
  y alerta de fuera de ventana.

---

## 6. Administrador

Menú de 7 secciones. Cada sección de "Operación", "Dinero", "Catálogo" y "Personal" agrupa varias
pestañas.

### 6.1 Dashboard (`/admin`) — el pulso de HOY

- Encabezado con la fecha y el **estado de las dos cajas** (jefe de zona y vigilante).
- **4 KPIs con comparación vs. ayer:** utilidad del día, ingresos del día, lavados entregados
  (con cuántos siguen en el patio y el margen), efectivo recibido.
- **Flujo del día:** barra En proceso → Listos → Entregados, con contexto (lavadores activos,
  vehículos en parqueadero, anulaciones, **huecos en el consecutivo de los últimos 7 días**).
- **Dinero de hoy:** ingresos por línea × método de pago, y "Resultado del día" (ingresos −
  comisiones lavadores − comisión jefe de patio − costo de productos vendidos − gastos = utilidad
  neta aproximada).
- **Últimos 7 días:** ingresos y utilidad por día.
- **Ritmo del día** (ingreso de lavado por hora) y **lavados por lavador** hoy.
- **Pendiente por pagar** (comisiones) y **gastos de hoy por categoría**.

### 6.2 Rentabilidad (`/admin/rentabilidad`) — análisis del PERIODO

Navegable por día / semana / mes.

- **4 KPIs grandes** (utilidad neta, margen, ingresos, egresos) con variación ▲▼ contra el
  periodo anterior de igual longitud.
- **Cascada "De ingresos a utilidad":** waterfall en tres bloques (Entra → Sale → Queda), cada
  línea con barra de proporción y su porcentaje. Cada línea abre un modal con el detalle (órdenes,
  gastos, movimientos). Cierra con el reparto de cada $100 que entra.
- Gráficos de utilidad e ingresos por día.
- **Resumen por día** y **por semana** (cada fila abre el detalle del día).
- **Desglose por lavador**, **por combo**, **gastos por categoría**.
- **Indicadores:** lavados, ticket promedio, productos vendidos, descuentos absorbidos, día más y
  menos rentable.

### 6.3 Operación

- **Órdenes:** histórico con filtro por rango (hoy / 7 días / 30 días). Nombres de combo y lavador
  resueltos, total de ingresos del rango. Acción **Anular** (motivo obligatorio + quién anula) y
  **corregir el reparto** de un pago. Tarjeta de **huecos en el consecutivo** y tarjeta de
  **anulaciones** del rango (con motivo, quién y cuándo).
- **Clientes:** vista derivada del historial de órdenes, agrupada por cliente.
- **Turnos y arqueos:** histórico de todos los turnos (jefe de zona y vigilante), solo lectura.
  Filtro por rol, contadores (turnos con diferencia, suma con signo de las diferencias), y por
  turno: base, esperado, conteo, diferencia (verde/rojo/ámbar), justificación, quién cerró y quién
  recibió. Sección de **correcciones de reparto de pago** de los últimos 30 días.
- **Auditoría:** la bitácora completa. Filtros por rango, acción, entidad y persona. Modal con el
  antes/después de cada cambio.

### 6.4 Dinero

- **Liquidaciones:**
  - Selector "Lavadores | Jefe de patio".
  - **Comisiones pendientes:** una tarjeta por persona, con "Generar diaria" / "Generar semanal"
    (el admin elige el periodo en cada generación). El detalle por combo y por categoría
    (carros/motos) se ve antes de generar.
  - **Histórico:** cada corte con su tipo (Diaria/Semanal) y hora exacta. Botones **Colilla**
    (imprimible, 58 mm), **Marcar pagada** y **Anular** (solo si no está pagada — devuelve las
    órdenes a pendiente, con motivo).
- **Gastos:** registrar un gasto (fecha, categoría, monto, descripción, responsable, origen
  caja/otro). Tabla del mes con total. Gestión de categorías (crear / activar / inactivar).
- **Inventario y ventas:**
  - Catálogo de productos (nombre, unidad, stock mínimo, precio de venta, costo). Se inactivan, no
    se borran.
  - Registrar movimiento (entrada con costo y proveedor / salida / ajuste con motivo obligatorio).
  - Stat cards: productos activos, cuántos bajo el mínimo, **valorización total** (costo promedio
    ponderado de las entradas × stock).
  - Tabla de stock (fila en rojo si está bajo el mínimo), "Ganancia" por producto vendible.
  - Movimientos recientes.
  - **Faltantes de inventario por revisar:** los que dejó el conteo de cierre de turno, agrupados
    por la persona que responde, con el monto a costo.

### 6.5 Catálogo y precios

- **Combos y precios:** crear/editar un combo (nombre, descripción, categoría auto/moto) **y su
  precio por cada tipo de vehículo en el mismo formulario**. Al guardar, crea o actualiza el combo
  y todos sus precios.
- **Servicios:** el catálogo de servicios que componen los combos y que se pueden vender sueltos.
- **Tipos de vehículo:** auto / camioneta / camioneta de platón / moto, con su categoría. Se
  inactivan, no se borran.
- **Parqueadero:**
  - Las 3 tarifas por modalidad (noche / mensualidad / fijo), editables. "Sin definir" cuando no
    hay tarifa, con aviso de que está pendiente de confirmación.
  - **Suscriptores:** titulares de mensualidad y fijo 24h (placa, titular, teléfono, valor del
    periodo, vigencia desde/hasta). Estado Al día / Por vencer (≤7 días) / Vencida. Alerta de los
    que están por vencer. Se inactivan, no se borran.

### 6.6 Personal

- **Lavadores:** CRUD (nombre, teléfono, fecha de ingreso, cumpleaños). Badge activo/inactivo.
  Nunca se eliminan.
- **Personal de caja:** las **personas** que abren caja y responden por un turno (nombre, nivel:
  administrador / jefe de patio / vigilante, teléfono). No son cuentas de acceso — es la lista que
  alimenta el selector de "quién abre el turno" y el sujeto de la comisión de jefe de patio.
- **Usuarios del sistema:** las cuentas de acceso (una por rol) y su rol/estado.

### 6.7 Configuración (`/admin/configuracion`)

- **Comisión del lavador (%)** y **comisión del jefe de patio en turno (%)**.
- **Base de cálculo de la comisión** cuando haya descuentos: sobre precio de lista (el negocio
  absorbe) vs. sobre valor cobrado (se reparte).
- **Periodicidad de liquidación** por defecto (diaria / semanal).
- **Recargo de moto alto cilindraje** (monto fijo).
- **Historial de cambios:** línea de tiempo de cada estado que rigió, con su fecha. La marcada
  "Vigente" es la actual.

---

## 7. Reglas de negocio implementadas

| # | Regla | Estado |
|---|---|---|
| 1 | Combo + tipo de vehículo define el precio; siempre desde la lista, nunca a mano | ✅ |
| 2 | Comisión configurable (lavador % / jefe de patio %); base ajustable con descuentos | ✅ |
| 3 | Un vehículo = un solo lavador (o dos, con "lavar entre dos") | ✅ |
| 4 | Liquidación sobre acumulado, sin descuentos al lavador; admin elige diaria o semanal | ✅ |
| 5 | Lavadores (y maestros) se inactivan, nunca se eliminan | ✅ |
| 6 | Parqueadero: 3 modalidades independientes (noche $8.000 al retiro, mensualidad, fijo 24h) | ✅ (multa de la ventana pendiente) |
| 7 | Ventana de salida 7–8 am; fuera de ella aplica cobro tipo "multa" | ⚠️ solo alerta — falta la fórmula |
| 8 | Vehículo lavado no genera cobro combinado con parqueadero | ✅ aviso al vigilante |
| 9 | Rotación por orden de llegada; si el lavador está ocupado la cola avanza y él conserva turno | ✅ |
| 10 | Cliente puede pedir lavador específico; cuenta en su rotación normal | ✅ |
| 11 | Todo movimiento pertenece a la fecha de apertura del turno | ✅ para caja; aproximado en dashboards |
| 12 | Cajas de jefe de zona y vigilante no se traslapan; cada una su arqueo | ✅ |
| 13 | Ningún registro se elimina; órdenes se anulan con motivo y quedan en auditoría | ✅ |
| 14 | Turno de caja cerrado inmodificable | ✅ (a nivel de base de datos) |
| 15 | Arqueo ciego: se pide el conteo físico antes de mostrar el esperado | ✅ (efectivo e inventario) |
| 16 | El indicador de rotación mide cantidad de vehículos, no ingresos | ✅ |

---

## 8. Pendiente

### Decisión de negocio (no es código)

- **Fórmula de la multa** de parqueadero por salida fuera de la ventana 7–8 am (fija, por
  fracción, o una tarifa de noche adicional completa).
- **Cómo se salda un faltante de inventario** — hoy se registra a nombre de la persona con su
  monto; el mecanismo de cobro (descuento de nómina, efectivo, se perdona) está por definir.
- **PIN de autorización** — solo aplica el día que se contrate un jefe de patio que no sea
  administrador. Hoy toda la operación diaria la hace el jefe de patio sin PIN, con el control
  posterior de la bitácora.

### Deuda técnica conocida (no afecta el alcance)

- El cálculo de precio de una orden existe en dos lugares (interfaz y una función de base de datos
  para el cambio de tipo de vehículo) — conviene unificarlo.
- La venta inmediata de un solo producto no valida stock antes de descontar (el conteo nocturno lo
  detectaría, pero no lo previene).
- Asistencia registra la llegada, no la salida ni las ausencias explícitas.
- "Clientes" es una vista derivada de las órdenes, sin unificación de duplicados (misma persona
  con dos placas, o placa con typo).
