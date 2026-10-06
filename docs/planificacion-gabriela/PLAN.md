# Agenda de tattoo de Gabriela — planificación de desarrollo

Fecha: 6 de octubre de 2026. Estado: propuesta para validar y ejecutar por fases. Esta entrega sólo agrega documentación; no modifica la aplicación, sus migraciones ni sus datos.

## 1. Decisión de producto y alcance de la revisión

Conservar el repositorio y su historial, NestJS, TypeScript, PostgreSQL y TypeORM. Reconstruir el núcleo de reservas para una sola agenda de Gabriela, con acceso privado y una web adaptable al celular. La prioridad es poder confiar en qué horario está ocupado y cuánto queda por cobrar de cada proyecto.

Se inspeccionó el checkout `D:\PersonalProyect\calendary_esthetic`, cuyo remoto coincide con [el repositorio solicitado](https://github.com/ferchox920/calendary_esthetic). HEAD: `cc7973671e22c0e95d24156143fb0312ce5aa131`, mensaje `adapted to production` (13/02/2024). El diagnóstico refleja los archivos locales, incluyendo modificaciones previas no confirmadas; no se presume que esas modificaciones estén publicadas. No se hizo fetch, instalación, conexión a PostgreSQL, envío de correo ni arranque del servidor.

Había siete archivos modificados antes de esta revisión: `package.json`, `package-lock.json`, `tsconfig.json`, `auth.service.ts`, `email.service.ts`, `users.module.ts` y `users.service.ts`. Se preservan. No se encontraron instrucciones AGENTS.md dentro del árbol revisado. La carpeta de este documento fue propuesta y aceptada por el usuario; no se escribió en ningún proyecto de resúmenes de Mercado Pago.

### Evidencia y límites sobre despliegues y datos

- El commit de producción sólo cambia `db/data-source.ts`; contiene configuración SSL y no acredita un entorno usado.
- No se encontraron archivos de despliegue, Docker/Compose, CI ni `.env.example` en los archivos versionados. El README es el del starter de Nest.
- La consulta pública a la API de despliegues de GitHub devolvió cero registros el día de la revisión. Eso no descarta hosting externo, despliegues manuales o bases existentes.
- No hay `.env` en la raíz visible. No se consultaron secretos ni bases remotas. Sigue pendiente la respuesta sobre despliegues y datos reales.

**Puerta obligatoria antes de cambiar estructuras:** inventariar con el responsable URLs, proveedor, versión desplegada, motor y versión de PostgreSQL, esquema efectivo, migraciones aplicadas, existencia y volumen agregado de datos, responsable y respaldo recuperable. No reemplazar ni borrar la migración inicial, no ejecutar `db:drop`, no activar `synchronize` y no retirar tablas hasta resolver este punto. Mientras se desconozca, tratar los datos como potencialmente reales y diseñar cambios aditivos. La decisión de reemplazar el código de reservas no implica borrar sus registros.

## 2. Diagnóstico verificable y decisión por módulo

| Parte | Implementado / evidencia | Falta o problema | Decisión para el MVP |
|---|---|---|---|
| Base Nest / HTTP | `src/main.ts`: prefijo `/api/v1`, Swagger, ValidationPipe, compresión y cookies | CORS abierto; sin guard global; validación de entorno ausente | **Conservar y corregir**. Acceso privado por defecto, origen permitido, contratos explícitos, errores útiles y documentación restringida en producción |
| PostgreSQL / TypeORM | `db/data-source.ts`, repositorios y una migración; `synchronize: false` | SSL forzado con certificado no verificado; inicialización con efecto lateral al importar; globs de migraciones a revisar | **Conservar y corregir**. Configuración distinta local/producción, una conexión administrada por Nest y CLI independiente |
| Migraciones | `1707781446343-init_.ts`: usuarios, profesionales, actividades y citas | `consultation.status` es varchar en migración y enum en entidad; entidad Review sin creación en esa migración; relaciones de profesiones duplicadas en tablas puente | **Conservar y reconciliar** contra esquema real. Nuevas migraciones revisadas manualmente; no regenerar una base inicial destruyendo historial |
| Auth | Passport local/JWT y bcrypt; login según rol; guard reutilizable | Secretos y vencimientos inconsistentes; refresh emitido pero endpoint comentado; estrategia no exige tipo ACCESS | **Corregir** y reducir a una cuenta propietaria. Reutilizar hashing, Passport y guard; centralizar emisión/verificación |
| Usuarios | Registro, OTP, login y consultas; email obligatorio y único | Cliente confundido con cuenta; `users.service.update()` es un placeholder. Rutas de detalle/borrado sin guard; password y OTP no excluidos por defecto | **Reemplazar el dominio de clientes** con fichas sin login. Reutilizar utilidades verificadas; conservar datos existentes mediante mapeo, si corresponde |
| Admin | CRUD, bcrypt y alta con ADMIN_KEY | Controlador sin guard; actualización acepta entidad parcial; exceso de roles para una propietaria | **Corregir temporalmente / retirar del flujo final**. Una cuenta Gabriela; provisioning administrativo fuera del registro público. No duplicar credenciales entre tres tablas |
| Professional | CRUD, login, profesiones, score y relaciones | Orientación a directorio de profesionales; no hay horarios laborales | **Reemplazar en producto** por configuración de la agenda única. Conservar referencias heredadas durante transición |
| Profession | Catálogo CRUD y relación con profesionales/actividades | No resuelve una necesidad inicial de Gabriela | **Retirar del MVP**. Desactivar rutas tras verificar consumidores; sin borrado de tablas durante transición |
| Activity | Catálogo con nombre, descripción y precio decimal | No representa tattoo individual, duración ni múltiples sesiones | **Reemplazar** por proyectos con presupuesto evaluado manualmente. Catálogo opcional sólo si Gabriela lo pide más adelante |
| Consultation | Crear/listar/ver/actualizar/eliminar; cuatro estados, date textual y linkpay | Sin fin, intervalos, margen, cliente independiente, transiciones, auditoría ni concurrencia | **Reemplazar el núcleo** por sesiones y ocupaciones. Mantener compatibilidad o retirar rutas antiguas al cortar consumidores |
| Review | Entidad y controlador; servicio devuelve textos de scaffolding | No implementa reseñas persistidas. Las dos pruebas sólo verifican instanciación | **Retirar del MVP**; no confundirlo con historial de cambios |
| Email | Nodemailer Gmail y plantilla de OTP | Acoplado al registro público; ruta de plantilla debe verificarse contra el build real | **Conservar aislado y corregir cuando se use**. No exigir SMTP para operar la agenda privada |
| Utility | Roles, firma, hashes e interceptor | No hay uso global comprobado; firma propia no sustituye autenticación | **Conservar sólo lo utilizado y probado**; retirar piezas sin consumidor después del inventario |
| Frontend | No hay proyecto ni dependencias de interfaz en el árbol versionado | No hay agenda móvil usable | **Crear** dentro de este mismo repositorio |
| Pruebas / operación | Jest y scripts de build/migraciones | Sin pruebas de reservas, sin directorio `test` ni configuración e2e referenciada; sin runbook ni backups definidos | **Corregir y ampliar** alrededor de invariantes y recuperación |

### Verificación de los seis hallazgos previos

1. **Confirmado:** `consultation.service.ts:51–62` compara `consultation.date === date` y sólo excluye canceladas. Dos inicios diferentes pueden solaparse; dos cadenas distintas también pueden representar el mismo instante. `consultation.entity.ts:22–23` guarda fecha como string y no tiene duración ni fin. El DTO sólo exige string.
2. **Confirmado:** `consultation.service.ts:94–97` actualiza directamente después de comprobar existencia; no revalida disponibilidad. Además, el DTO ofrece IDs de relaciones que no coinciden directamente con las propiedades de entidad: el comportamiento de actualización de relaciones debe corregirse, no darse por terminado.
3. **Confirmado en reservas:** la lectura y el save no están bajo transacción ni bloqueo, y la migración no impone exclusión temporal. Dos solicitudes pueden superar la misma comprobación. Existen transacciones en OTP, pero no protegen la agenda.
4. **Confirmado:** `consultation.controller.ts` no usa guards y no hay `APP_GUARD` ni guard global en el arranque revisado. También hay exposición en otros módulos: cerrar únicamente citas dejaría rutas privadas abiertas.
5. **Confirmado:** AuthService firma con `JWT_SECRET`; JwtModule y JwtStrategy usan `ACCESS_TOKEN_SECRET_KEY`. `calculateExpirationTime()` quita unidades: `1h` termina reportando un segundo. La verificación de expiración del JWT sí está activa, pero la fecha informada al frontend es incorrecta. El guard actual no rechaza explícitamente refresh tokens como credenciales de acceso.
6. **Confirmado:** sólo hay dos specs de Review, ninguna de agenda. No se encontró frontend. La ausencia se limita a este repositorio; no prueba que no haya otra aplicación externa.

### Comprobaciones ejecutadas, sin correcciones

- `npm test`: dos suites fallidas, cero tests ejecutados; TypeScript no encuentra `describe`, `beforeEach`, `it`, `expect`. Los flags pasados desde PowerShell fueron interpretados por npm como configuración, y finalmente se ejecutó Jest con su configuración actual. No se conecta a DB en esas suites.
- `npx --no-install tsc --noEmit --incremental false`: falla por los mismos tipos de Jest en los specs. No emite archivos.
- No se ejecutó build de producción: el tsconfig de build excluye specs; no extrapolar ese fallo a la compilación de producción. Tampoco se probó conexión ni runtime. Las dependencias locales cambiaron respecto de HEAD y deben estabilizarse antes de estimar compatibilidad.

## 3. Preguntas para Gabriela y supuestos de trabajo

### Bloquean decisiones o la salida a producción

| Pregunta | Decisión que desbloquea | Cuándo se necesita |
|---|---|---|
| ¿Existe una web/API usada, otro consumidor o base con datos reales? ¿Quién administra hosting y backups? | Estrategia de compatibilidad, migración y conservación | Antes de cualquier cambio de esquema o retirada de rutas |
| ¿Sólo Gabriela usa la agenda? ¿Alguien más edita turnos? | Cuenta única y política de permisos | Antes de cerrar autenticación; si hay asistente, registrar necesidad y ajustar sin crear plataforma de estudios |
| ¿En qué ciudad trabaja y qué celular/navegador utiliza? | Zona horaria y aceptación móvil | Antes del modelo temporal y validación del prototipo |
| ¿Cuáles son sus horarios, descansos y márgenes reales? ¿Permite excepciones? | Disponibilidad y fronteras de ocupación | Antes de aceptar reservas reales; se puede construir con valores ficticios configurables |
| ¿Un pendiente guarda horario? ¿Qué condición permite confirmarlo: evaluación, acuerdo, seña? | Semántica de estados y flujo de confirmación | Antes de desarrollar reglas de reservas |
| ¿Presupuesta por proyecto o sesión? ¿Cómo trata una seña al cancelar, ausentarse o reprogramar? | Saldo y tratamiento manual del dinero | Antes de implementar registros financieros |
| ¿Cuánto dato admite perder y cuánto tiempo puede estar sin agenda? ¿Quién recupera su acceso? | Backups, recuperación y soporte | Antes de producción |

### Se pueden resolver después

- Colores, logo, texto de mensajes, filtros secundarios y vista mensual: no bloquean la agenda diaria/semanal.
- Fotos de referencia, archivos de diseños, consentimiento, formularios sanitarios o documentación personal: definir sólo si surge necesidad; no recogerlos por anticipado.
- Canal y horario de recordatorios, solicitudes públicas, Google Calendar, WhatsApp y cobros: se decidirán en fases posteriores.
- Estadísticas, exportaciones contables, múltiples profesionales o locales: requieren necesidad confirmada.

**Supuestos explícitos, sujetos a validación:** una propietaria y una agenda; zona `America/Argentina/Buenos_Aires`; moneda ARS; presupuestos a nivel proyecto; pendiente reserva espacio hasta cancelación manual; confirmación siempre decidida por Gabriela. Trabajo normal dentro del día local; turnos nocturnos que crucen medianoche quedan fuera inicialmente. No hay exigencia de seña para confirmar hasta que Gabriela establezca su política. No hay expiración automática de pendientes.

Para demos: “Cliente Demo A”, teléfono ficticio y email `cliente-a@example.test`; horario ficticio 09:00–18:00, descanso 13:00–14:00, preparación 15 minutos y limpieza 15 minutos. Estos números no son reglas reales. Nunca usar datos reales en tests, screenshots, seeds ni staging.

## 4. MVP y exclusiones

**Incluido:** acceso privado, cerrar sesión y recuperación asistida; hoy y semana; búsqueda de clientes por nombre/contacto; ficha mínima; proyectos y sesiones variables; alta, reprogramación, cancelación y estados; horarios semanales, descansos, días/intervalos bloqueados y márgenes; presupuesto, seña y otros pagos registrados manualmente; saldo del proyecto; historial de cambios; backup automático y recuperación ensayada.

La agenda muestra cliente, descripción, inicio/fin, estado y margen ocupado. El detalle permite ver sesiones del mismo tattoo y saldo sin duplicar un presupuesto por cada sesión. Los estados se distinguen con texto además de color. Crear un cliente y un primer turno debe poder hacerse desde un solo flujo, sin obligar a completar un email o registrar al cliente como usuario.

**Excluido:** reserva pública, confirmación automática, portal del cliente, recordatorios, cobros o enlaces de pago, facturación, catálogo de precios cerrados, marketplace, directorio de artistas, reseñas, estudios múltiples, app nativa, sincronización con calendarios externos y escritura offline. Instalar un acceso directo al celular es opcional; no significa que se pueda reservar sin conexión.

**MVP terminado:** Gabriela completa un circuito de una semana ficticia en su celular, incluido un proyecto de dos sesiones, una reprogramación rechazada por conflicto, una cancelación y una seña; dos solicitudes paralelas nunca reservan el mismo espacio; ninguna API privada funciona sin su sesión; una copia restaurada conserva agenda, saldos e historial.

## 5. Flujos de uso

### Gabriela

1. **Preparar la agenda:** ingresar, fijar zona/horarios/descansos/márgenes, bloquear un día. Ver inmediatamente en semana qué intervalos están disponibles. Un bloqueo que pisa turnos muestra cuáles y se rechaza; no los cancela silenciosamente.
2. **Evaluar un tattoo:** buscar o crear cliente (nombre y al menos teléfono o email), crear proyecto con título y nota breve. Puede dejar presupuesto sin definir y no crear un turno hasta evaluar duración. Este proyecto sin sesiones no ocupa agenda.
3. **Reservar:** elegir día e inicio, duración o fin, descripción y estado pendiente. Mostrar fin y espacio ocupado con márgenes antes de guardar. El servidor valida; al éxito aparece en día/semana. Ante 409, mantener formulario y actualizar disponibilidad para elegir otro horario.
4. **Confirmar:** registrar el acuerdo y, si corresponde, una seña manual; confirmar con acción explícita. Pagar no confirma automáticamente. Presupuesto o duración todavía inciertos se resuelven antes de confirmar.
5. **Varias sesiones:** agregar una segunda sesión al mismo proyecto con su propio intervalo y estado. Ver presupuesto único, pagos acumulados y saldo; no exigir fijar todas las sesiones desde el principio.
6. **Reprogramar:** abrir detalle, elegir nuevo intervalo y guardar con versión del registro. Si falla por conflicto o edición concurrente, el turno original queda intacto. Usar formulario como camino principal; arrastrar eventos queda para después.
7. **Cancelar:** registrar motivo, conservar historial y liberar intervalo en una transacción. Mostrar que la seña conserva su registro y que cualquier devolución o crédito requiere una decisión manual.
8. **Cerrar una sesión:** marcar realizada o ausente; registrar un pago de saldo si lo hubo. El estado no altera dinero automáticamente. Consultar historial del proyecto y próximos turnos.
9. **Corregir un error:** ajustar nota/presupuesto con historial; corregir dinero mediante reversión y nuevo movimiento, no sobrescribir un cobro histórico. Corregir un estado terminal exige motivo y revalidación cuando corresponda.

### Cliente, fase posterior

Enviar solicitud con nombre, contacto, idea, zona del cuerpo/tamaño aproximado y preferencias de fecha. Recibir acuse de solicitud, sin promesa de turno. Gabriela evalúa, estima duración/precio y propone sesión. Sólo después de acuerdo y disponibilidad crea o confirma el turno. Las solicitudes no ocupan agenda ni necesitan cuenta del cliente inicialmente. Una futura solicitud de cambio/cancelación tampoco cambia el turno hasta que Gabriela la resuelva. Los mensajes automáticos se agregan luego, con entrega y reintentos separados de la transacción de agenda.

## 6. Modelo de datos propuesto

Modelo lógico; tipos y nombres finales se fijan después del inventario de base. UUID para identidades; timestamps de creación/actualización; FKs obligatorias donde aplique. Archivo lógico en clientes/proyectos para preservar referencias.

| Entidad | Campos mínimos | Relación / motivo |
|---|---|---|
| OwnerAccount | id, email único normalizado, passwordHash, active, sessionVersion | Una cuenta Gabriela. Credenciales separadas de clientes; mapear cuenta heredada si existe |
| AgendaSettings | id fijo, timezone IANA, currency, defaultPrepMinutes, defaultCleanupMinutes, version | Una fila persistente también utilizada para serializar cambios de disponibilidad |
| WorkingWindow | id, weekday, localStart, localEnd, validFrom/validTo opcionales | Varias ventanas por día permiten representar un descanso; rangos efectivos evitan cambiar retroactivamente el historial |
| Client | id, name obligatorio, phone nullable, email nullable, shortNote, archivedAt | Al menos un contacto. No contraseña ni DNI obligatorio; contacto no necesariamente único |
| TattooProject | id, clientId, title, briefDescription, quoteAmount nullable, currency, quoteStatus (sin evaluar/estimado/acordado), archivedAt, version | Un cliente tiene varios proyectos; presupuesto único y revisable con auditoría |
| ScheduleEntry | id, agendaId fijo, kind (session/block), startAt, endAt, occupiedStartAt, occupiedEndAt, sessionStatus nullable, blockActive nullable, prepMinutes, cleanupMinutes, version, createdAt/updatedAt | Contenedor único de ocupaciones y campos que determinan su exclusión; checks de campos según kind. Márgenes cero para bloqueos |
| Session | scheduleEntryId único, projectId, description, cancellationReason nullable | Proyecto con N sesiones. Inicio/fin, estado y márgenes se leen de ScheduleEntry, sin duplicarlos |
| Block | scheduleEntryId único, reason | Intervalo no laboral puntual; activación en ScheduleEntry. Día entero = medianoche local a medianoche local siguiente; no asumir 24 horas en todas las zonas |
| MoneyEntry | id, projectId, sessionId opcional, kind (seña/pago/devolución/reversión), amountMinor, currency, occurredAt, note, reversesId nullable, idempotencyKey | Libro manual de movimientos; sessionId sólo contextual y debe pertenecer al mismo proyecto |
| AuditEvent | id, actorId, entityType/id, action, occurredAt, before/after acotados, reason, requestId | Se guarda en la misma transacción que la acción relevante; no incluir passwords, JWT o datos innecesarios |
| IdempotencyRecord | ownerId, operation, key, payloadHash, responseRef, createdAt | Unicidad para reintentos de altas y movimientos; misma clave y otro cuerpo se rechaza |

La separación Session/ScheduleEntry puede implementarse mediante una tabla de ocupaciones con campos de sesión, si eso reduce duplicación. La condición imprescindible es **una única tabla con todos los intervalos excluyentes**, no dos restricciones independientes que permitan que un bloqueo y un turno se pisen. La sesión y su ocupación se crean/actualizan juntas; no se expone un CRUD genérico que pueda desincronizarlas.

### Tiempo, disponibilidad e intervalos

- Guardar instantes como `timestamptz`; API acepta ISO 8601 con offset o Z y devuelve UTC. La UI convierte usando la zona de la agenda, no la zona del dispositivo. Rechazar fechas sin zona, inválidas y valores infinitos.
- Horarios semanales son horas de pared en la zona IANA y fechas efectivas locales. Consultar “hoy” entre medianoche local y la siguiente, convirtiendo ambas a UTC; no sumar 24 horas a ciegas. La consulta de agenda usa intersección de intervalos y rango acotado.
- Intervalo de sesión `[inicio, fin)` con fin > inicio. Duración positiva en minutos; sin duración fija por actividad. Ocupación `[inicio − preparación, fin + limpieza)`. Dos ocupaciones se cruzan cuando `a.inicio < b.fin && b.inicio < a.fin`.
- Ejemplo ficticio: sesión 10:00–12:00, preparación/limpieza 15/15: ocupa 09:45–12:15. Una segunda sesión con iguales márgenes puede comenzar a las 12:30, porque su ocupación empieza a las 12:15. Empezar 12:15 todavía solapa.
- Toda la ocupación debe entrar en una ventana laboral, sin cruzar descansos ni bloqueos. Los márgenes se copian en cada sesión; cambiar defaults sólo afecta nuevas sesiones. Modificar márgenes de una existente requiere revalidar.
- No permitir crear turnos normales en el pasado. Cargar historia heredada se realiza mediante importación revisada. No permitir sesiones que crucen día local en el MVP. La granularidad visual propuesta es 15 minutos, pero no debe redondear ni alterar silenciosamente el horario introducido.
- Cambiar zona, ventanas efectivas o descansos requiere mostrar y rechazar incompatibilidades con sesiones futuras; no moverlas en silencio. Primero reprogramarlas y luego cambiar disponibilidad. El pasado conserva su historial.

### Estados y ocupación

| Estado | Ocupa horario | Transición habitual |
|---|---|---|
| Pendiente | Sí | Confirmado o cancelado |
| Confirmado | Sí | Realizado, ausente o cancelado; también puede reprogramarse |
| Realizado | Sí, conserva ocupación histórica | Terminal; corrección excepcional con motivo |
| Ausente | Sí, conserva ocupación histórica | Terminal; corrección excepcional con motivo |
| Cancelado | No | Terminal; para reactivar, acción explícita con nueva validación |

Mantener realizadas y ausentes ocupadas evita duplicar registros históricos sobre una sesión existente. Realizado/ausente sólo después del fin previsto; el MVP no modela liberación anticipada ni duración real diferente de la planificada. Si Gabriela necesita eso, se valida antes de agregarlo. Un proyecto en evaluación sin sesión no es un turno pendiente. No liberar pendientes por cron ni confirmar por seña automáticamente.

Cancelación conserva la fila y auditoría, nunca DELETE físico. Reprogramar cambia la misma sesión y preserva su ID; la versión e historial muestran antes/después. No permitir cambiar el cliente del proyecto si ya hay sesiones/pagos sin un procedimiento de corrección revisado.

### Concurrencia: decisión concreta

Usar dos defensas complementarias:

1. Todas las operaciones que alteren sesiones, bloqueos, márgenes, ventanas o zona abren una transacción TypeORM y adquieren `SELECT ... FOR UPDATE` sobre la fila persistente de AgendaSettings. Todos los servicios usan el mismo orden de bloqueo: agenda, registro/proyecto y movimientos. Para una agenda, serializar estas escrituras simplifica la validación de disponibilidad sin afectar significativamente el uso.
2. PostgreSQL impone una restricción `EXCLUDE USING gist` sobre `(agenda_id WITH =, tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&)` para ocupaciones activas. Requiere comprobar disponibilidad de `btree_gist` en el hosting. Predicado sobre la misma fila: sesión con estado distinto de cancelado, o bloqueo activo. Checks exigen estado no nulo para sesión, activación no nula para bloqueo, intervalos positivos y coherencia de límites. Los límites se materializan al guardar y se verifican contra inicio/fin/márgenes, evitando depender de expresiones temporales problemáticas en índices. No calcular el predicado a través de un join a Session/Block.

Dentro del bloqueo: cargar versión vigente, validar permisos/DTO/proyecto, convertir fechas, validar jornada y descansos, buscar cruces excluyendo el propio ID en reprogramación, escribir sesión/ocupación y auditoría, confirmar. Usar únicamente repositorios del EntityManager transaccional. La DB resuelve la carrera final aunque otra conexión supere una lectura previa; traducir `23P01` a HTTP 409 con mensaje para elegir otro horario. [PostgreSQL documenta rangos y restricciones de exclusión](https://www.postgresql.org/docs/current/rangetypes.html), y [bloqueos de fila](https://www.postgresql.org/docs/current/explicit-locking.html).

Una versión incremental y actualización condicionada impiden que dos pestañas sobrescriban el mismo turno: versión vieja => 409, sin cambios. Idempotencia impide que un doble toque o reintento duplique turnos o señas; misma clave+cuerpo devuelve el resultado anterior. Si `btree_gist` no está permitido, mantener bloqueo transaccional por agenda como alternativa documentada y probada, sin aceptar reservas sólo con comprobación en memoria. Preferir hosting donde ambas defensas estén disponibles. Limitación: horarios semanales se protegen por el protocolo transaccional, no únicamente por la exclusión; restringir escrituras directas a la base.

### Presupuesto, seña y saldo

- Representar importes en centavos enteros seguros o decimal exacto; API no calcula dinero con floats. Moneda única por proyecto y movimientos; importes negativos/moneda diferente se rechazan.
- Presupuesto null significa no evaluado, distinto de cero. Un presupuesto estimado se muestra como tal; el saldo es orientativo hasta acordarlo. El presupuesto acordado y cualquier revisión quedan auditados.
- Neto recibido = señas + pagos − devoluciones, considerando reversiones. Saldo = presupuesto − neto. No sumar “pagos de sesión” y “pagos de proyecto” dos veces: existe un único libro por proyecto. Un exceso se muestra como crédito, no se pierde al forzar saldo cero.
- Reprogramar conserva los movimientos. Cancelar o marcar ausente no devuelve, retiene ni descuenta seña automáticamente. Registrar la decisión manual con motivo y, si hubo devolución real, el movimiento correspondiente.
- Corregir un cobro requiere reversión enlazada (una sola por movimiento) y nuevo registro. Devoluciones no pueden exceder el neto recibido bajo bloqueo de proyecto. Registrar un movimiento no ejecuta ningún cobro.

## 7. Arquitectura y frontend

Monolito modular Nest con módulos Auth/Owner, Clients, Projects, Scheduling, Money y Audit; PostgreSQL como fuente de verdad. Scheduling concentra fechas, disponibilidad y transacciones; los controladores no duplican reglas. Reutilizar TypeORM y DTOs donde sirvan; añadir SQL explícito en migraciones para las restricciones temporales. Sin microservicios, Redis ni motor de reservas externo.

Mantener backend en su estructura actual y crear `web/` en el mismo repo, con scripts/lockfile claramente definidos. No mover todo a un monorepo complejo en la primera fase. API con DTOs de respuesta: nunca devolver entidades con password/OTP. Endpoints de comandos explícitos para reprogramar, cancelar, confirmar y movimientos; consultas de agenda por rango, clientes paginados y proyecto con sesiones/saldo. Contratos 401 sin sesión, 403 sin permiso, 400 de validación y 409 de conflicto/versión/idempotencia.

| Opción de interfaz | Simplicidad y mantenimiento | Uso móvil / decisión |
|---|---|---|
| React + TypeScript + Vite | Cliente estático y API Nest ya existente; sin duplicar lógica de servidor | **Recomendada**, si el equipo conoce React. Responsive, formulario táctil y agenda diaria/semanal |
| Next.js | Añade SSR, servidor y decisiones de autenticación/caché que la agenda privada no necesita inicialmente | Viable si ya existe experiencia fuerte o futura web pública lo exige; no es requisito del MVP |
| HTML renderizado desde Nest | Menos herramientas, pero calendario interactivo y formularios dinámicos requieren JavaScript igualmente | Alternativa si el equipo no conoce React; validar esfuerzo real antes de elegir |
| Flutter/React Native | Otra compilación, distribución y soporte por plataforma | Posponer: no hay requisito de capacidades nativas |

La [guía oficial de Vite](https://vite.dev/guide/) contempla React/TypeScript. Para el calendario, evaluar componentes estándar de día/semana de [FullCalendar](https://fullcalendar.io/docs) con un prototipo en el celular de Gabriela; fijar versión, licencia y dependencias antes de adoptarlo. No usar vistas de recursos múltiples ni plugins premium innecesarios. Si semana resulta demasiado estrecha, mostrar días navegables y lista semanal sin sacrificar la vista de conjunto.

UI: botones táctiles amplios, fuente legible, navegación Hoy/Anterior/Siguiente, estados con texto, formulario que conserva datos ante error, confirmación de cancelación y aviso de conexión perdida. Sin escrituras offline ni caché de respuestas privadas en service worker. Probar a 360 px y en el dispositivo real; no depender de hover o arrastrar.

Seguridad propuesta: JWT de acceso corto en cookie HttpOnly/Secure/SameSite, mismo origen web/API y validación CSRF/origen para escrituras. Centralizar secreto y obtener vencimiento del claim `exp`; rechazar tipo distinto de ACCESS. En el MVP, reingresar al vencer, sin prometer refresh funcional. Ajustar TTL tras probar el uso diario; logout limpia cookie y permite invalidación por sessionVersion. Recuperación asistida mediante procedimiento administrativo autenticado, sin necesitar SMTP; ensayarla antes de lanzamiento. Provisionar cuenta por comando de administración, no ruta de registro público. Guard global salvo login/health mínimo, limitación de intentos, swagger privado y respuestas sanitizadas. Desactivar rutas heredadas públicas en el despliegue privado tras inventariar consumidores.

## 8. Fases, dependencias y tareas verificables

Estimaciones en días laborables de una persona con experiencia full stack; cada tarea debe caber aproximadamente en medio día a dos días. No son fechas comprometidas. La salida de una fase depende de sus criterios, no de consumir su estimación.

### F0 — conocer el punto de partida y acordar reglas (2–3 días)

| Tarea | Necesidad de Gabriela / aceptación |
|---|---|
| F0.1 Inventariar despliegues, consumidores y datos, sin exponer registros | Evitar perder trabajo previo. Ficha con entorno, responsable, esquema/migraciones, existencia de datos y estrategia de conservación; si se desconoce, ninguna tarea destructiva avanza |
| F0.2 Revisar diferencias locales y herramienta Node/npm/TS/Jest | Desarrollo reproducible. Versiones y fallos documentados, acuerdo sobre qué cambios previos forman la base, sin reset de trabajo ajeno |
| F0.3 Entrevista corta con ejemplos reales de reglas, sin copiar datos personales | Validar zona, duración, pendientes, márgenes y señas. Decisiones y respuestas pendientes registradas |
| F0.4 Boceto de hoy/semana y alta de un tattoo de dos sesiones | Gabriela reconoce cómo trabaja. Recorrido del boceto en su celular y lista corta de ajustes |
| F0.5 Aprobar contratos/modelo y secuencia de migración | Nadie inventa duración de registros viejos. Mapeo y tratamiento de excepciones aceptados |

Resultado demostrable: boceto navegable o pantallas enlazadas con datos ficticios y tablero de tareas con puertas de conservación explícitas. Depende sólo de acceso al repositorio y disponibilidad del responsable; no requiere implementar reservas.

### F1 — base ejecutable y acceso privado (3–5 días; depende de F0)

| Tarea | Criterio de aceptación |
|---|---|
| F1.1 Fijar runtime/lockfile y reparar configuración de build/test | Instalación limpia y build/tests básicos reproducibles; diferenciar tsconfig de app y tests. No actualizar todo por conveniencia |
| F1.2 Preparar PostgreSQL local aislado, variables de ejemplo y modo sin correo | Otra persona levanta entorno desde instrucciones sin credenciales reales; SSL local/producción configurables |
| F1.3 Centralizar JWT, guard global, respuestas sanitizadas y cierre de rutas antiguas | Sin sesión no se accede a clientes/agenda/dinero; refresh token no sirve para API privada; password/OTP nunca salen |
| F1.4 Provisionar Gabriela, login/logout, recuperación asistida | En celular entra, sale y recupera acceso siguiendo el runbook; sesión vencida solicita reingreso sin perder silenciosamente trabajo |
| F1.5 Configurar CI de validación sin datos reales | Cada cambio corre build y pruebas, sin `lint --fix` que altere archivos en CI |

Demo: pantalla privada de inicio con login/logout en celular; API bloqueada desde otra sesión. La base todavía no se declara agenda usable.

### F2 — núcleo de agenda confiable (6–8 días; depende de F1 y reglas de F0)

| Tarea | Criterio de aceptación |
|---|---|
| F2.1 Migraciones aditivas, checks y ocupaciones unificadas | Instalación vacía y copia de esquema heredado migran sin perder IDs/datos; exclusión probada |
| F2.2 Clientes y proyectos mínimos | Crear cliente sin email si tiene teléfono; proyecto sin precio ni sesiones no ocupa horario |
| F2.3 Ventanas, descansos, bloqueos y márgenes | Jornada ficticia muestra huecos correctos; bloqueo y cambio de jornada rechazan turnos incompatibles |
| F2.4 Alta y consulta por rango con conversión de zona | Inicio/fin y ocupación correctos; la misma sesión aparece a la hora de la agenda desde dispositivos en otra zona |
| F2.5 Reprogramación, cancelación y transiciones | Mover hacia un cruce falla conservando el original; cancelar libera el horario y conserva fila |
| F2.6 Bloqueo transaccional, exclusión, versión e idempotencia | Solicitudes simultáneas y doble toque producen una reserva válida, sin duplicados ni sobrescrituras |
| F2.7 Auditoría atómica | Cada cambio relevante tiene actor y antes/después; transacción rechazada no deja evento falso |

Demo: cliente ficticio con dos sesiones vía API, creación simultánea rechazada y reprogramación fallida con original intacto. Pruebas contra PostgreSQL real de test, no SQLite.

### F3 — agenda móvil y operación diaria (5–7 días; depende de F2)

| Tarea | Criterio de aceptación |
|---|---|
| F3.1 Crear `web/`, navegación privada y estados de conexión | Pantallas legibles a 360 px, sin datos privados cacheados para usuarios desconectados |
| F3.2 Vista diaria y semanal con márgenes/bloqueos | Gabriela distingue sesión, espacio no disponible y pendiente; cambia de día sin perder orientación |
| F3.3 Flujo cliente → proyecto → primera/segunda sesión | Completa alta mínima sin pasar por registro de usuarios; las sesiones quedan en el proyecto correcto |
| F3.4 Detalle y acciones confirmar/reprogramar/cancelar/realizado/ausente | Error 409 conserva formulario y explica el conflicto; vista se actualiza sólo tras confirmación del servidor |
| F3.5 Historial y prueba con Gabriela | Puede reconocer quién/cuándo cambió hora, estado o presupuesto; recorrido completo sin asistencia técnica |

Demo: organizar una semana ficticia desde el celular. No desplegar para uso real hasta terminar F4/F5.

### F4 — presupuesto, seña y saldo manual (3–4 días; depende de F2; UI depende de F3)

| Tarea | Criterio de aceptación |
|---|---|
| F4.1 Presupuesto estimado/acordado y versiones | Desconocido se muestra sin saldo inventado; una revisión conserva valor anterior |
| F4.2 Libro de seña/pago/devolución/reversión con idempotencia | Doble toque no duplica seña; importes exactos y movimientos vinculados al proyecto |
| F4.3 Saldo y formulario móvil | Proyecto ficticio de ARS 100.000, seña 20.000 y pago 30.000 muestra saldo 50.000 en ambas sesiones |
| F4.4 Cancelación/ausencia y correcciones | Cancelar mantiene 50.000 recibidos; devolver 20.000 deja neto 30.000 y saldo 70.000. Ningún estado mueve dinero solo |

Demo: dos sesiones comparten un presupuesto y un saldo verificable; corrección conserva trazabilidad.

### F5 — despliegue, conservación y recuperación (4–6 días; depende de F3/F4)

| Tarea | Criterio de aceptación |
|---|---|
| F5.1 Staging privado y producción reproducibles | Web/API HTTPS, DB persistente y privada, health mínimo; secretos fuera de Git; CI y versiones de release documentadas |
| F5.2 Ensayar migración de datos si existen | Copia autorizada aislada y protegida: conteos, referencias, saldos y excepciones conciliados; demos sólo ficticias |
| F5.3 Backups automáticos y alertas de fallo | Respaldo fuera del servicio de aplicación, retención definida y verificación de ejecución, sin depender de disco efímero |
| F5.4 Restaurar en base separada y verificar | Recuperar agenda, clientes, proyectos, dinero y auditoría dentro del objetivo acordado; registrar tiempo y procedimiento |
| F5.5 Pruebas finales y piloto con Gabriela | Matriz crítica aprobada; circuito móvil completo y soporte conocido; fallos bloqueantes resueltos |

Demo: restablecer desde backup una semana ficticia y sus saldos en un entorno vacío. Corte a producción sólo después de conservación, permisos, concurrencia y recuperación aprobados.

### F6 — piloto y ajustes (2–3 días distribuidos)

Observar varios días de uso acordados, corregir obstáculos concretos de agenda móvil y mensajes de conflicto; revisar salud y backups. No abrir alcance público durante el piloto. Resultado: Gabriela organiza una semana con confianza y sabe qué hacer si pierde acceso o conexión.

### Etapas posteriores, sin compromiso de estimación hasta validarlas

1. Solicitudes públicas y bandeja de evaluación: sin confirmar ni ocupar automáticamente; antiabuso, privacidad y aceptación manual.
2. Recordatorios: preferencias de contacto, proveedor, cola/outbox, reintentos y deduplicación; fallo del envío no deshace la reserva.
3. Integraciones/fotos/reportes/cobros: cada una con necesidad confirmada, costo y política de datos; varios estudios/artistas no se presupone.

## 9. Pruebas necesarias y ejemplos de aceptación

Fixtures ficticias, reloj controlado y DB de test desechable. Suite unitaria para reglas puras; integración PostgreSQL para constraints/transacciones; e2e HTTP y recorrido móvil para resultado visible. No sustituir concurrencia con mocks de repositorios.

| Área | Caso / resultado esperado |
|---|---|
| Permisos | Sin cookie, expirado, firma inválida, cuenta desactivada y token REFRESH: rechazo. Otra identidad válida sin permiso: 403. Probar también rutas heredadas, clientes, dinero y auditoría. Responses/logs sin hashes, OTP ni tokens |
| Sesión | Logout invalida acceso según política; cookie segura y CSRF/origen incorrecto rechazado; expiración comunicada coincide con `exp`; recuperación asistida deja credenciales anteriores inutilizables |
| Fechas | Fin ≤ inicio, fecha imposible, sin offset, minutos negativos, pasado y cruce de medianoche: rechazo. Dos offsets del mismo instante se tratan igual. “Hoy” en Buenos Aires no depende del reloj/zona del navegador |
| Zona | Límites de día/semana correctos y prueba con zona con DST para la utilidad temporal; horas ambiguas/inexistentes se rechazan o resuelven explícitamente. No asumir que Buenos Aires tiene DST actualmente |
| Solapamiento | Igual inicio, intersección parcial, contenido, envolvente y cruce sólo por margen: rechazo. Contacto exacto de límites `[)` sin cruce: permitido. Se prueba sesión contra bloqueo en ambos órdenes |
| Disponibilidad | Margen fuera de jornada, descanso y día bloqueado: rechazo. Cambiar horario/zona con incompatibilidades futuras no altera configuración. Defaults nuevos no cambian reservas previas |
| Estados | Pendiente/confirmado/realizado/ausente ocupan; cancelado libera. Transiciones ilegales y cierre antes del fin rechazados. Reactivar cancelado revalida y se audita |
| Concurrencia | 20 altas paralelas de mismo intervalo, conexiones distintas y barrera de inicio: exactamente una fila válida, demás 409, sin 500 ni eventos huérfanos. Intervalos disjuntos terminan guardados. Repetir turno vs bloqueo y turno vs cambio de jornada |
| Defensa DB | Inserts por conexiones distintas sin preconsulta de API: exclusión evita cruce. Validar error 23P01 y rollback. Si se usa alternativa sin extensión, demostrar serialización en todos los caminos de escritura |
| Reprogramación | Excluir propio ID; ampliar duración valida margen; destino ocupado conserva origen/versión/auditoría. Dos pestañas con misma versión: una actualiza y otra 409. Reprogramación vs alta y cancelación concurrentes mantienen invariantes |
| Cancelación | Fila e historial permanecen; siguiente reserva puede ocupar espacio liberado. Reintento de cancelación no duplica auditoría ni dinero |
| Clientes/proyectos | Contacto mínimo, clientes con igual nombre/contacto permitido y advertencia de posible duplicado; FK impide sesión sin proyecto; archivo no borra historia; dos sesiones corresponden al mismo cliente |
| Dinero | ARS 100.000 − 20.000 − 30.000 = 50.000 exactos; presupuesto null no da cero; doble request idempotente produce una seña; misma clave con importe distinto falla; moneda/importe inválido y devolución excesiva rechazados |
| Dinero concurrente | Dos devoluciones que juntas excederían el neto: sólo las válidas se guardan. Una reversión por movimiento. Cancelar/reprogramar no altera neto; sobrepago aparece como crédito |
| Auditoría | Un fallo al guardar auditoría revierte reserva/pago; cambios aceptados con actor/hora/diferencia. No edición o borrado público del historial |
| Migración/restore | Base vacía y esquema heredado migran; fechas sin zona o duración incierta quedan en informe de revisión, nunca se convierten inventando. Backup restaurado mantiene FKs, conteos y saldos |
| Móvil | Alta, segunda sesión, conflicto, cancelación, seña y búsqueda en celular de Gabriela; texto legible, sin scroll horizontal obligatorio ni interacción sólo con mouse; red caída no muestra reserva guardada |

CI ejecuta reglas e integración por PR; antes de release, e2e y recorrido móvil. No imponer porcentaje arbitrario de cobertura: todas las invariantes anteriores son puertas de salida. Tests e2e deben tener config real; el script actual apunta a un archivo inexistente.

## 10. Ejecución local, despliegue y recuperación

### Local, trabajo a implementar en F1

Registrar Node/npm compatibles con las dependencias elegidas, reparar lockfile/configuración, y documentar `npm ci`. Crear `.env.example` sin secretos con PORT, parámetros PostgreSQL (resolver el typo `POSTGRES_SHEMA` con compatibilidad temporal), zona y JWT. Separar entorno local de producción; DB local sin SSL si está en loopback y producción con verificación de certificado. Evitar que importar data-source abra una segunda conexión.

Preparar Compose para una DB local persistente de desarrollo y otra desechable de test, o PostgreSQL local con roles/bases separados. No usar URLs reales en defaults. Secuencia futura: levantar DB → instalar backend → compilar → ejecutar migraciones revisadas → seed ficticio por comando explícito → `npm run start:dev` → instalar/iniciar `web/`. El CLI de migraciones debe reconocer el directorio emitido real: inspeccionar build antes de confiar en globs actuales. Probar la secuencia completa desde checkout limpio; frontend con proxy `/api` al backend para evitar CORS innecesario. No ejecutar esos pasos sobre producción por copiar el runbook local.

### Despliegue recomendado

Un servicio Node para Nest que sirva el build estático de web bajo el mismo dominio y `/api/v1`, más PostgreSQL administrado persistente. Es una propuesta operativa, no una selección de proveedor: confirmar presupuesto, ubicación, backups, extensión `btree_gist`, disponibilidad y persona a cargo antes de contratar. No depender de niveles gratuitos que suspendan la app o eliminen datos.

Separar staging y producción con DB/secretos distintos. HTTPS, DB sin exposición pública innecesaria, rol de app con permisos mínimos y rol separado para migraciones. Logs técnicos sin nombres/contactos/importes completos; alertas por errores de agenda, indisponibilidad y backups fallidos. No volcar cuerpos de login ni JWT. Construcción reproducible, health check de conexión y límites/timeouts de transacciones.

Deploy: CI verde → respaldo verificado → migraciones aditivas como job único → desplegar versión compatible → smoke privado → registrar release y observar. Si hay app antigua: inventariar consumidores y cortar sus escrituras durante migración para no evadir nuevas reglas. No ejecutar varias instancias migrando simultáneamente. Rollback preferente de aplicación a una versión compatible con el esquema expandido; no usar `migration:revert` indiscriminadamente porque puede borrar datos nuevos.

### Conservación si se encuentran datos reales

No deducir fin a partir de Activity: no hay duración. La fecha textual tampoco garantiza offset. Hacer inventario agregado, copia/restore aislado bajo autorización del responsable y mapeo con IDs originales. Identificar fechas inválidas, pendientes, referencias incompletas y conflictos; resolver con Gabriela mediante proceso privado. No publicar ejemplos reales en la planificación.

Agregar estructuras nuevas y migración de datos verificable; conservar legado en sólo lectura durante transición. Convertir los cuatro estados actuales con mapeo aprobado (`scheduled` candidato a pendiente, no equivalencia asumida); definir zona/duración de cada registro o marcarlo para revisión fuera de agenda operativa. No activar constraint sobre datos incompatibles ni esconderlos silenciosamente. Ensayar, conciliar conteos/relaciones, suspender escrituras al corte, migrar y verificar. Retirar estructuras antiguas en una fase independiente tras aceptación y respaldo, manteniendo migraciones históricas.

### Backups y recuperación

Propuesta inicial para acordar: RPO ≤ 24 horas y RTO ≤ 4 horas; si Gabriela no acepta perder un día, elegir PITR y objetivo de pérdida menor. Backup automático diario, retención propuesta 14 diarios y 8 semanales, cifrado y almacenado fuera de la app con permisos limitados. Preferir PITR del proveedor; sumar dump lógico para portabilidad con herramienta compatible. Respaldar también configuración necesaria de esquema/extensiones; secretos se recuperan desde su gestor, nunca desde Git.

Responsable técnico designado revisa fallos de backups y ensaya restore mensual al principio y antes de cambios grandes. Restaurar en DB nueva, instalar extensiones/roles necesarios, verificar migrations, FKs, conteos agregados, última sesión, netos/saldos y auditoría; iniciar app compatible, probar con acceso privado, recién entonces cambiar conexión. Registrar punto recuperado y pérdida estimada. Mientras se recupera, pausar escrituras y usar contingencia manual de Gabriela; reconciliar lo anotado antes de reabrir. Un backup exitoso sin restauración comprobada no satisface aceptación.

## 11. Riesgos, pendientes y estimación

| Riesgo / pendiente | Impacto | Mitigación / puerta |
|---|---|---|
| Datos/despliegues desconocidos | Pérdida o ruptura de consumidores | F0.1 bloquea cambios destructivos; migraciones aditivas y corte controlado |
| Fecha heredada sin fin/zona | Agenda importada errónea | Revisión humana y reporte; no inventar duración ni offset |
| Dependencias y configuración local cambiadas | Baseline no reproducible | F0.2/F1.1; conservar diferencias y probar instalación limpia |
| Políticas de pendiente/seña no acordadas | Horarios o saldos que no reflejan trabajo | Ejemplos de cancelación/ausencia/dos sesiones con Gabriela antes de F2/F4 |
| Todas las reservas validadas sólo en servicio | Carreras y cruces | Exclusión DB + transacción; integración con conexiones reales |
| Cambios de jornada fuera del protocolo | Reservas fuera de disponibilidad | Servicio único, bloqueo agenda, rol DB restringido y tests cruzados |
| Celular/red o UI semanal incómoda | Abandono de herramienta | Prototipo temprano, formularios cortos, estados claros y sin escrituras offline |
| Hosting sin persistencia, extensión o backups | Pérdida / diseño inviable | Evaluar requisitos antes de proveedor; restauración como puerta de lanzamiento |
| Falta de soporte/recuperación de cuenta | Gabriela queda sin agenda | Responsable, procedimiento y ensayo de recuperación en F1/F5 |
| Expansión a clientes públicos/integraciones | Retrasa confiabilidad | Backlog separado; no incluir en criterio de MVP |

Estimación base: F0 2–3, F1 3–5, F2 6–8, F3 5–7, F4 3–4, F5 4–6, F6 2–3: **25–36 días laborables**, aproximadamente **6–9 semanas** con una persona y margen del 20%. Asume experiencia Nest/PostgreSQL/React, respuestas de Gabriela en 1–2 días, una propietaria, sin migración compleja, sin imágenes ni cobros y proveedor con capacidades requeridas. Es esfuerzo de ingeniería, no promesa de calendario; esperas de decisiones y piloto pueden extender fechas.

Si hay datos reales, prever **3–8 días adicionales** de inventario/mapeo/ensayo, y reestimar tras F0 si aparecen conflictos o fechas indeterminadas. Si el equipo no conoce React o hay frontend externo a integrar, reestimar F3. No hay presupuesto de infraestructura calculado: fijarlo después de conocer proveedor y objetivos de recuperación, sin inventar precios actuales.

Decisiones pendientes principales: presencia de datos/consumidores, cuenta única, zona y dispositivo, política de pendientes/confirmación, márgenes reales, presupuesto por proyecto/seña, límites de recuperación y proveedor. Ninguna exige implementar plataforma de varios estudios.

## 12. Primera etapa lista para comenzar

**Próximo trabajo: F0, sin implementar funcionalidades.** Responsable técnico + Gabriela; resultado esperado en 2–3 días de esfuerzo.

1. Resolver inventario de despliegues/datos y responsables; usar sólo metadatos agregados. Si no puede resolverse aún, registrar conservación obligatoria y avanzar con boceto/reglas, sin mutar esquema.
2. Revisar y acordar los siete cambios locales existentes. Registrar runtime instalado, lockfile y configuración de tests; preparar lista de correcciones de F1 sin aplicarlas en esta etapa de planificación.
3. Hacer entrevista con escenarios: tattoo sin precio definido; sesión larga; descanso; pendiente; segunda sesión; reprogramación ocupada; cancelación con seña. Registrar decisión y ejemplo de resultado esperado para cada uno.
4. Preparar boceto móvil hoy/semana, ficha de proyecto y formulario de sesión con fixtures ficticias; validarlo en el teléfono de Gabriela.
5. Cerrar contrato de estados, ocupación y dinero; confirmar estrategia aditiva y restricciones de hosting; convertir F1/F2 en tickets usando criterios de este plan.

**Salida de F0:** evidencia de conservación, reglas mínimas aceptadas, boceto comprensible, baseline identificada y backlog con dependencias. La siguiente implementación autorizable es F1; no comenzar retirando módulos ni reescribiendo migraciones.
