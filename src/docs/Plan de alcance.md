# Plan de Alcance — Sistema de Gestión para Lavadero y Parqueadero

**Preparado para:** Lavadero y Parqueadero — documento base para cotización
**Elaborado por:** Frank Alessandro Roldán Belalcázar · Desarrollador de Software · Ingeniero de Sistemas
**Fecha:** 14 de agosto de 2026

> Este documento no es una cotización. Es la definición de alcance del proyecto: qué incluye el sistema, cómo funciona, qué reglas de negocio aplica y qué queda fuera. Sirve como base para construir la cotización una vez el cliente confirme los puntos pendientes de la sección 13.

---

## 1. Contexto

El negocio opera en dos modalidades sobre la misma sede:

- **Lavadero:** de 7:00 am a 6:00 pm, atendido por el jefe de zona y los lavadores
- **Cierre:** de 6:00 pm a 7:00 pm no hay atención al público. Es la franja destinada al cierre de caja y arqueo del lavadero
- **Parqueadero:** de 7:00 pm a 7:00 am, atendido por el vigilante

Cada modalidad tiene su propio responsable, su propia caja y su propia dinámica de cobro. Hoy todo el registro de clientes, cobros, asignación de lavadores, liquidación de comisiones y control de inventario se lleva de forma manual, lo que dificulta el control del dinero, la trazabilidad de los servicios y la medición real de la utilidad.

## 2. Objetivo del sistema

Construir una aplicación **100% web** que centralice la operación de ambas modalidades, con control estricto de caja por responsable, trazabilidad de cada servicio y visibilidad separada por rol entre la operación y la administración del negocio.

## 3. Premisas del proyecto

| Aspecto | Definición |
|---|---|
| Tipo de solución | Aplicación web responsive, sin instalación |
| Sedes | Una |
| Horario lavadero | 7:00 am – 6:00 pm |
| Cierre y arqueo | 6:00 pm – 7:00 pm, sin atención al público |
| Horario parqueadero | 7:00 pm – 7:00 am |
| Usuarios del sistema | Administrador, Jefe de zona y Vigilante |
| Lavadores | 4, vinculados por prestación de servicios, sin horario fijo. Uno de ellos, por estar iniciando, recibe pago diario en lugar de liquidación semanal (excepción temporal a la regla general) |
| Asignación de vehículos | Por rotación según orden de llegada del lavador |
| Acceso del lavador | No tiene usuario; recibe su información impresa o en pantalla |
| Medios de pago | Efectivo y transferencia |
| Facturación | Tiquete interno (sin facturación electrónica DIAN). El negocio proyecta implementar facturación electrónica más adelante; queda excluida de este alcance y se trata como fase futura |
| Servicios de lavado | Combos, con precio según tipo de vehículo |
| Comisión del lavador | 40% del combo para el lavador, 60% para el negocio |
| Liquidación | Semanal, sobre el acumulado del lavador |
| Descuentos | Desactivados por defecto, configurables |
| Inventario | Movimientos manuales, sin descuento automático por servicio |
| Hardware en sitio | PC, impresora térmica POS, cajón monedero, celular o tablet |

## 4. Roles y permisos

### Administrador (dueño)
Acceso total. Configura combos, precios, tarifas, reglas y usuarios. Consulta ambos dashboards, autoriza operaciones sensibles mediante PIN, revisa arqueos históricos, registra gastos y ejecuta las liquidaciones semanales. Puede entrar desde cualquier dispositivo fuera del local.

### Jefe de zona (jornada diurna)
Es la cara operativa del lavadero y el responsable de la caja del día. Recibe clientes, registra vehículos y combos, asigna lavadores, cobra, entrega vehículos, registra movimientos de inventario y abre y cierra su turno de caja.

**No tiene acceso** al dashboard administrativo, a los márgenes, a los costos ni al histórico financiero. La restricción se aplica a nivel de base de datos, no solo ocultando pantallas.

### Vigilante (jornada nocturna)
Responsable del parqueadero y de su propia caja. Registra ingresos y salidas de vehículos, cobra según la modalidad, consulta el listado de vehículos en el patio y abre y cierra su turno.

**No tiene acceso** a la operación del lavadero, a las comisiones, a los gastos ni a los dashboards.

## 5. Alcance funcional

### M1 — Configuración y maestros
- Tipos de vehículo (moto, automóvil, camioneta, etc.)
- Combos de lavado: nombre, descripción de lo que incluye, estado activo/inactivo
- Catálogo de combos de lavado a cargar como datos iniciales:
  - **Automóviles y camionetas:** Combo 1 (lavado y aspirado) · Combo 2 (+ brillado) · Combo 3 (+ lavado de motor) · Combo 4 (+ brillado + lavado de motor) · Combo 5 (+ rasqueteada) · Combo 6 (+ lavado de cojinería)
  - **Motocicletas:** Combo 1 (lavado y desengrasada) · Combo 2 (+ brillado) · Combo 3 (lavado y grafitada) · Combo 4 (+ desengrasada + brillado + grafitada)
- Matriz de precios: cada combo tiene un precio distinto según el tipo de vehículo
- Tarifas de parqueadero en sus tres modalidades:
  - *Noche:* de 7:00 pm a 7:00 am, $8.000 por una sola noche
  - *Mensualidad:* cobro mensual con fecha de vencimiento
  - *Fijo 24 horas:* el vehículo permanece día y noche, con entradas y salidas ilimitadas
- Porcentaje de comisión del lavador, parametrizable (valor inicial 40%)
- Reglas de rotación de lavadores: criterio de orden de la cola y comportamiento cuando un lavador está ocupado
- Configuración de descuentos (ver sección 6)
- Categorías de gasto
- Datos del negocio para el tiquete
- Gestión de usuarios del sistema y sus roles
- Campo de fecha de cumpleaños configurable como base para futuras promociones (ver Manejo de descuentos)

### M2 — Recepción de lavado
Pantalla principal del jefe de zona, diseñada para atender rápido con el cliente al frente:

- Ingreso de placa con autocompletado desde el histórico propio: si la placa existe, trae automáticamente el cliente, teléfono, tipo de vehículo y último combo realizado
- Registro de cliente nuevo con datos mínimos (nombre, teléfono y fecha de cumpleaños opcional)
- Selección de tipo de vehículo y combo, con cálculo automático del precio desde la matriz
- Campo de observaciones libres sobre el estado del vehículo, sin checklist extenso
- Asignación del lavador responsable, con sugerencia automática según la cola de rotación (ver M9); el jefe de zona puede aceptarla o cambiarla dejando constancia
- Cálculo automático de la distribución 60% / 40%
- Registro del pago con su método
- Generación de orden con consecutivo e impresión del tiquete

### M3 — Seguimiento de servicios
Vista de control de la operación del día con tres estados: **En proceso → Listo → Entregado**.

Permite ver qué vehículos están en el patio, cuánto tiempo llevan, reasignar lavador si es necesario y evitar que se entregue un vehículo sin haberse cobrado. Genera el tiempo promedio de atención por combo y por lavador.

### M4 — Parqueadero (módulo del vigilante)
- Registro de ingreso por placa con hora automática y selección de modalidad
- Autocompletado de placa desde el histórico
- Cálculo automático del cobro a la salida
- Vehículos con **fijo 24 horas**: entradas y salidas ilimitadas sin cobro adicional, con registro de cada movimiento
- **Mensualidades:** control de vigencia, alerta de próximos vencimientos y de vencidos
- **Ventana de salida de 7:00 a 8:00 am:** los vehículos de noche y de mensualidad deben retirarse en ese lapso. El sistema muestra al vigilante la lista de los que aún están adentro y marca los que superan la hora límite
- Los vehículos con modalidad **fijo 24 horas** permanecen en el patio y no aparecen en esa alerta
- Listado en tiempo real de los vehículos actualmente en el parqueadero
- Control de cupos y disponibilidad
- Impresión de tiquete de ingreso y recibo de salida
- Consulta rápida por placa para saber si un vehículo está adentro y bajo qué modalidad
- El cobro de la modalidad noche se realiza al retiro del vehículo, no al ingreso

### M5 — Caja y turnos
Cada responsable maneja su propia caja. El jefe de zona abre y cierra la del día; el vigilante la de la noche.

- Apertura de turno con registro de base inicial y usuario responsable
- Registro de todos los ingresos discriminados por método de pago
- En pagos por transferencia, campo obligatorio de referencia o comprobante
- Registro de salidas de dinero de la caja
- **Cierre con arqueo ciego:** el sistema solicita el conteo físico sin mostrar el valor esperado, y solo después revela la diferencia
- Justificación obligatoria de diferencias
- Turno cerrado queda bloqueado e inmodificable
- **Regla de fecha:** todo movimiento pertenece a la fecha en que se abrió el turno. El turno nocturno que arranca un lunes y termina el martes a las 7:00 am se contabiliza completo como operación del lunes
- Entrega de turno documentada, con constancia de quién recibió

### M6 — Gastos
Registro categorizado de los egresos que cubre el negocio con su 60%: fecha, categoría, descripción, monto, responsable e indicación de si salió de la caja o de otra fuente. Es lo que permite que la utilidad mostrada en el dashboard sea real y no una cifra bruta.

### M7 — Inventario
- Catálogo de productos e insumos con unidad de medida
- Registro de entradas por compra, con proveedor y costo
- Registro de salidas por consumo (manual)
- Ajustes de inventario con motivo obligatorio
- Stock actual y alerta de stock mínimo
- Valorización del inventario
- Histórico de movimientos con usuario y fecha

### M8 — Lavadores y liquidación
- **Perfil del lavador:** datos personales, contacto, fecha de ingreso, fecha de cumpleaños, foto opcional, estado activo/inactivo. Los lavadores se inactivan, nunca se eliminan, para preservar el histórico de servicios y liquidaciones
- Acumulado de comisiones por lavador
- Detalle de los servicios que componen ese acumulado
- Resumen consultable **por día, por semana y por mes**
- Generación de la liquidación semanal, marcado como pagada y comprobante imprimible para entregar al lavador
- Histórico de liquidaciones y pagos realizados
- Excepción de pago diario: parametrizable por lavador, para casos como un trabajador nuevo en periodo inicial que no entra en la liquidación semanal general
- Indicador de comisiones pendientes de pago

### M9 — Asistencia y rotación de lavadores
Los lavadores están vinculados por prestación de servicios y no tienen horario fijo: uno de ellos entra desde las 7:00 am y los demás a partir de las 9:00 am. El reparto de vehículos se hace por **orden de llegada**, y ese es el mecanismo que el sistema debe reflejar.

- **Registro de llegada:** el jefe de zona marca la hora de llegada de cada lavador al iniciar la jornada
- **Cola de rotación:** el sistema ordena a los lavadores presentes según su hora de llegada y determina a quién corresponde el siguiente vehículo
- **Sugerencia automática** del lavador en la pantalla de recepción, con posibilidad de cambio manual justificado (por ejemplo, si el cliente pide a alguien en particular)
- **Avance de la cola** cada vez que se asigna un vehículo, de modo que el reparto quede equilibrado a lo largo del día
- **Manejo de lavadores ocupados:** cuando al lavador en turno todavía le falta terminar un vehículo, la cola avanza al siguiente y él conserva su posición para la siguiente ronda
- **Retiro de la cola:** marcar cuando un lavador se ausenta o termina su jornada
- **Panel de rotación** con la cola actual, quién está ocupado, cuántos vehículos lleva cada uno y quién sigue
- **Reportes de equidad:** vehículos atendidos por lavador en el día y en la semana, para verificar que la rotación esté siendo pareja
- **Registro de asistencia y jornada** del jefe de zona y del vigilante, con sus turnos fijos y sus novedades

Este módulo alimenta directamente la liquidación semanal (M8) y el reporte de productividad del dashboard administrativo (M11).

### M10 — Dashboard operativo y gestión
Visible para el jefe de zona y el administrador. Solo información no sensible: sin costos, sin márgenes, sin gastos y sin utilidad.

**Indicadores del día**
- Lavados del día: total, en proceso y entregados
- Cantidad de servicios por lavador (ranking del día)
- Combos más solicitados
- Ticket promedio
- Dinero esperado en la caja del turno actual
- Comparativo contra el día anterior y contra el mismo día de la semana pasada
- Ocupación actual del parqueadero
- Mensualidades próximas a vencer
- Alertas de stock mínimo

**Histórico y consultas**
- Registro histórico de órdenes con filtros por fecha, lavador, combo, tipo de vehículo y estado
- Buscador global por placa
- Ficha del vehículo: historial completo de servicios sobre esa placa
- Ficha del cliente: sus vehículos, frecuencia de visita y último servicio
- Reimpresión de tiquetes
- Consulta del histórico de turnos propios y sus arqueos

**CRUDs disponibles en este nivel**
- Clientes y vehículos: crear, editar, fusionar duplicados
- Lavadores: crear perfil, editar datos, activar e inactivar
- Movimientos de inventario: entradas, salidas y ajustes
- Órdenes: crear, editar antes del cierre del turno, anular con motivo
- Registros de parqueadero

### M11 — Dashboard administrativo
Exclusivo del administrador. Contiene todo lo anterior más la capa financiera y de control.

**Financiero**
- Ingresos discriminados por método de pago y por la línea de negocio (lavadero vs. parqueadero)
- Ingresos del parqueadero desglosados por modalidad: noche, mensualidad y fijo
- Gastos por categoría, con tendencia en el tiempo
- Utilidad neta: ingresos, menos comisiones de lavadores, menos gastos, menos consumo de inventario
- Margen por combo y por tipo de vehículo, para identificar qué servicios realmente dejan dinero
- Comparativos entre periodos: día, semana, mes y acumulado del año
- Punto de equilibrio: cuántos lavados diarios se necesitan para cubrir los gastos fijos
- Cierre mensual consolidado

**Personal y productividad**
- Productividad por lavador: cantidad de servicios, ingresos generados, tiempo promedio de atención
- Comisiones pendientes de pago y proyección del pago semanal
- Histórico completo de liquidaciones
- Días trabajados y novedades por trabajador
- Horas y días pico, como insumo para dimensionar el personal

**Clientes**
- Clientes recurrentes y frecuencia de retorno por placa
- Tasa de retorno: cuántos clientes vuelven y en cuánto tiempo
- Clientes inactivos (placas que no regresan hace X tiempo)
- Estado de las mensualidades de parqueadero, vigentes y vencidas

**Inventario**
- Valorización del inventario y consumo del periodo
- Productos de mayor rotación
- Cruce entre consumo de insumos y cantidad de servicios realizados, para detectar desvíos

**Control y auditoría**
- Histórico de arqueos con diferencias por turno y por responsable
- Tendencia de diferencias acumuladas por persona
- Listado de anulaciones con motivo y responsable
- Listado de descuentos aplicados, si están habilitados
- Bitácora de cambios sobre precios y configuración
- Registros creados fuera del horario habitual

**Configuración y CRUDs exclusivos**
- Combos, matriz de precios y tarifas de parqueadero
- Porcentaje de comisión y reglas de descuento
- Usuarios del sistema y asignación de roles
- Categorías de gasto
- Registro y edición de gastos
- Cierre y reapertura autorizada de turnos

**Exportación**
- Todos los reportes exportables a Excel y PDF

## 6. Reglas de negocio

1. Los servicios de lavado se venden como combos, con precio definido por la combinación combo + tipo de vehículo.
2. De cada combo, el 40% corresponde al lavador y el 60% al negocio.
3. Un vehículo se asigna a un solo lavador.
4. La liquidación de lavadores es semanal, sobre el acumulado del periodo, y no admite descuentos al lavador. Excepción: un lavador en periodo de inicio puede recibir pago diario en lugar de liquidación semanal.
5. Los lavadores se inactivan, nunca se eliminan.
6. El parqueadero opera en tres modalidades independientes: noche (7:00 pm a 7:00 am, $8.000 la noche), mensualidad y fijo de 24 horas con entradas y salidas ilimitadas.
7. Los vehículos de noche y de mensualidad deben retirarse entre las 7:00 y las 8:00 am. Los de modalidad fija permanecen en el patio. El vehículo que no se retira dentro de esa ventana genera un cobro adicional tipo "multa" (monto por definir — ver sección 13).
8. Los vehículos que ingresan a lavado se retiran al terminar el servicio, con un tiempo promedio de una hora. Ningún vehículo lavado permanece en el parqueadero nocturno, por lo que no existe cobro combinado entre las dos líneas de negocio.
9. Los vehículos se asignan a los lavadores por rotación, según el orden de llegada de cada lavador a la jornada. Cuando un lavador está ocupado, la cola avanza al siguiente y él conserva su posición para la ronda que le corresponde.
10. Se permite que un cliente solicite un lavador específico; ese vehículo cuenta dentro de la rotación normal de ese lavador.
11. Todo movimiento pertenece a la fecha en que se abrió el turno en que se registró.
12. Cada responsable (jefe de zona y vigilante) maneja su propia caja y responde por su propio arqueo. Las dos cajas no se traslapan: la del lavadero se cierra a las 6:00 pm y la del parqueadero se abre a las 7:00 pm.
13. Ningún registro se elimina: las órdenes se anulan con motivo obligatorio y permanecen visibles en los reportes.
14. Los precios se toman siempre de la lista configurada.
15. Un turno de caja cerrado no puede modificarse.
16. El indicador de rotación por lavador mide productividad en cantidad de vehículos atendidos, no en ingresos generados; los ingresos por tipo de servicio se siguen con un indicador aparte, para que el valor distinto de los combos no distorsione la medición de la rotación.
17. El parqueadero de una sola noche se cobra al retiro del vehículo, no al ingreso.

### Manejo de descuentos

Hoy el negocio **no aplica descuentos**, por lo que el sistema se entrega con la funcionalidad **desactivada**: el jefe de zona no puede alterar el precio de ningún combo, lo que además refuerza el control antifraude.

Queda construida y configurable por el administrador para cuando se necesite:

- Interruptor general para habilitar o deshabilitar descuentos
- Catálogo de motivos autorizados (cliente frecuente, cortesía por reclamo, promoción, etc.)
- Tipo de descuento: porcentaje o valor fijo
- Tope máximo permitido
- Exigencia de PIN del administrador para aplicarlo
- **Base de cálculo de la comisión del lavador**, parametrizable entre dos opciones:
  - *Sobre precio de lista* (opción por defecto): el negocio absorbe el descuento y el lavador recibe su 40% completo
  - *Sobre valor cobrado:* el descuento se reparte entre ambos
- Todo descuento queda registrado con usuario, motivo, valor y orden asociada, y aparece en el reporte de auditoría

## 7. Control antifraude

- Arqueo ciego en cada cierre de turno, para ambos responsables
- Consecutivo continuo de tiquetes, con alerta ante números faltantes
- Bitácora de auditoría con usuario, fecha y hora en cada creación, anulación, cambio de precio y ajuste de inventario
- Precios bloqueados; descuentos deshabilitados por defecto y sujetos a PIN del administrador cuando se habiliten
- Imposibilidad de editar o borrar registros históricos
- Cierre automático de sesión por inactividad
- Sesión individual por usuario, sin cuentas compartidas
- Reporte de tendencias: diferencias de arqueo acumuladas por responsable, anulaciones por día, registros fuera de horario
- Cruce entre consumo de inventario y cantidad de servicios realizados

## 8. Modelo de datos (entidades principales)

Usuarios · Roles · Trabajadores · Turnos de trabajo · Asistencias · Clientes · Vehículos · TiposVehículo · Lavadores · Combos · ListaPrecios · Órdenes · OrdenDetalle · EstadosOrden · Descuentos · MotivosDescuento · Pagos · MétodosPago · TurnosCaja · MovimientosCaja · Gastos · CategoríasGasto · Productos · MovimientosInventario · Liquidaciones · DetalleLiquidación · ModalidadesParqueadero · TarifasParqueadero · EstanciasParqueadero · Mensualidades · LogAuditoría

## 9. Arquitectura y aspectos técnicos

**Frontend:** React con Vite, interfaz responsive optimizada para uso en PC con teclado (velocidad de digitación en recepción) y usable en tablet y celular.

**Backend y datos:** Supabase — base de datos PostgreSQL, autenticación, políticas de seguridad a nivel de fila para separar lo que ve cada rol, almacenamiento y actualización en tiempo real para los dashboards.

**Despliegue:** Vercel o Cloudflare, con dominio propio.

**Impresión:** tiquetes maquetados en CSS a 80 mm, impresos mediante el driver de la impresora POS instalado en el PC. Navegador configurado en modo de impresión directa para evitar el diálogo de confirmación. La apertura del cajón monedero se realiza mediante la configuración del propio driver.

### Infraestructura y costos recurrentes

El sistema se opera sobre servicios en la nube. La configuración de arranque busca el menor costo posible sin comprometer la integridad de la información:

| Componente | Servicio | Costo |
|---|---|---|
| Alojamiento de la aplicación | Vercel o Cloudflare | Sin costo |
| Base de datos y autenticación | Supabase (plan inicial gratuito) | Sin costo |
| Automatización de respaldos | GitHub Actions | Sin costo |
| Almacenamiento de respaldos | Google Drive | Sin costo |
| Dominio propio | Registrador | ~$60.000 COP/año (solo si se desea) |

**Acceso al sistema:** la aplicación puede utilizarse directamente mediante la dirección (URL) proporcionada por la plataforma de alojamiento (Vercel o Cloudflare), por lo que no es necesario adquirir un dominio propio. El dominio constituye únicamente una mejora opcional para facilitar el acceso mediante una dirección personalizada (por ejemplo, sistemaempresa.com), sin aportar diferencias funcionales al sistema.

**Limitaciones asumidas en la configuración inicial:** el plan gratuito de la base de datos no incluye respaldos administrados por el proveedor, no ofrece acuerdo de nivel de servicio y suspende el proyecto tras siete días consecutivos sin actividad, caso en el cual se reactiva manualmente. Estas limitaciones se aceptan de forma consciente para la etapa inicial y se mitigan con el esquema de respaldos propio descrito abajo.

**Escalamiento previsto:** cuando el volumen de operación o la criticidad del sistema lo justifiquen, se migra al plan pago de la base de datos (aproximadamente USD 25 mensuales), lo que incorpora respaldos administrados, disponibilidad continua y soporte del proveedor. La migración no implica cambios en el código.

### Esquema de respaldos

- Respaldo diario automático y comprimido de la base de datos, ejecutado mediante tarea programada en la nube, independiente de cualquier equipo del local
- Almacenamiento externo en unidad de nube separada del proveedor de la base de datos
- Política de retención: siete respaldos diarios, cuatro semanales y doce mensuales
- Notificación automática ante fallo de la tarea
- Validación de integridad: la tarea falla si el respaldo resulta anormalmente pequeño
- Prueba de restauración completa documentada antes de la puesta en producción
- Posibilidad de ejecutar un respaldo manual bajo demanda
- **Ventana máxima de pérdida ante un incidente: 24 horas** en la configuración inicial

**Decisiones de arquitectura con visión a futuro:** identificadores generados en el cliente, operaciones idempotentes y consecutivo de tiquete independiente del identificador interno. No representa costo adicional hoy y permite incorporar operación sin conexión más adelante sin rehacer el sistema.

**Dependencia de internet:** al ser una solución web, la operación requiere conexión. Como contingencia se contempla el uso del celular como punto de acceso y un talonario físico de respaldo para digitación posterior.

## 10. Entregables

1. Prototipo navegable de las pantallas principales, para aprobación previa al desarrollo
2. Aplicación web desplegada en dominio propio
3. Base de datos configurada, con respaldos automáticos diarios y prueba de restauración documentada
4. Configuración de la estación de trabajo: impresión de tiquetes y cajón monedero
5. Carga inicial de datos maestros: combos, precios, tipos de vehículo, tarifas de parqueadero, lavadores y trabajadores
6. Capacitación presencial al administrador, al jefe de zona y al vigilante
7. Manual de uso breve, orientado a operación
8. Período de soporte y estabilización posterior a la entrega

## 11. Supuestos

- El cliente dispone de conexión a internet estable en el local
- El cliente suministra el hardware: PC, impresora térmica POS, cajón monedero y tablet o celular
- El cliente suministra la lista completa de combos, precios por tipo de vehículo y tarifas de parqueadero antes del inicio del desarrollo
- La impresora y el cajón son compatibles entre sí y cuentan con driver para Windows
- El personal que usará el sistema tiene manejo básico de computador
- El módulo de personal y horarios se desarrolla sobre el alcance base descrito; cambios sustanciales tras la definición del cliente se tratan como alcance adicional

## 12. Exclusiones

Quedan **fuera** de este alcance:

- Facturación electrónica ante la DIAN
- Integración con datáfono o pasarelas de pago
- Cálculo de nómina, prestaciones sociales o aportes de seguridad social
- Aplicación móvil nativa
- Operación sin conexión a internet
- Múltiples sedes
- Suministro de hardware
- Migración de datos históricos existentes
- El servicio mensual de operación (infraestructura, respaldos, monitoreo, soporte y ajustes menores) no está incluido en el valor del desarrollo y se cotiza por separado
- El registro y renovación anual del dominio corre por cuenta del cliente
- Migración al plan pago de base de datos y su costo mensual, cuando el negocio lo requiera
- Soporte que exceda las horas mensuales pactadas en el servicio de operación, que se factura a la tarifa por hora acordada

## 13. Puntos pendientes de confirmación

1. **Monto de la "multa"** por vehículo que no se retira antes de las 8:00 am. El cliente confirmó que sí aplica un cobro adicional, pero falta definir el valor o la fórmula (fijo, por fracción, o tarifa de noche adicional completa).