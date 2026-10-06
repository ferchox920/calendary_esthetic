# Primera entrega técnica — entorno local ejecutable

Fecha: 6 de octubre de 2026. Referencia: [PLAN.md](PLAN.md).

## Alcance y decisiones

El usuario pidió comenzar por etapas y preparar una base Docker nueva para probar.
Antes de editar se comunicó el alcance: preparación técnica de F0 y primera parte
de F1, centrada en F1.1/F1.2. No se considera terminada F0 ni la totalidad de F1.

El responsable confirmó en esta conversación: **no hay despliegue ni datos reales**.
Se conserva la migración inicial, sin regenerarla, y se mantiene `synchronize: false`.
No se retiraron tablas ni rutas. Los demás contenedores existentes quedaron intactos.

## Entregables

- `.env` ignorado por Git, con contraseña de PostgreSQL y secretos JWT/admin generados
  aleatoriamente; `.env.example` versionable sin secretos reales.
- Compose exclusivo `calendary-esthetic-dev`, PostgreSQL 16, base
  `calendary_esthetic_dev`, puerto loopback `5546` y volumen persistente propio.
- Opciones compartidas por Nest y TypeORM CLI: validación de conexión/puerto/SSL,
  alias de `POSTGRES_SHEMA`, SSL local desactivable y certificados remotos verificados
  por defecto. Importar el datasource ya no abre una segunda conexión.
- Globs de entidades/migraciones relativos al archivo, compatibles con el build.
- Configuración de tests separada de la aplicación, soporte ESM para Jest/Nest 12,
  scripts de comprobación y ruta corregida del arranque compilado.
- Modo `EMAIL_MODE=disabled`: omite SMTP sin imprimir destinatarios, OTPs o contenido.
- Runtime registrado: Node 24.19.0, npm 11.6.2; lockfile conservado y metadatos
  sincronizados. No se actualizaron dependencias como parte de esta entrega.
- Instrucciones de instalación, conexión y conservación del volumen en README.

## Base previa conservada

Existían modificaciones en `package.json`, `package-lock.json`, `tsconfig.json`,
`auth.service.ts`, `email.service.ts`, `users.module.ts` y `users.service.ts`.
Se utilizó esa base local para las pruebas, sin reset ni reversión. Los cambios nuevos
en package/config/email se suman a ese trabajo; los de auth/users se conservaron.
El entorno previo compilaba, pero los dos specs existentes fallaban antes de ejecutarse
por falta de tipos Jest. Después de resolver los tipos apareció la incompatibilidad
de carga ESM, corregida con el flag de VM de Node para Jest.

## Evidencia de verificación

| Comprobación | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | Instalación completa desde lockfile, 732 paquetes |
| `npm run build` | Correcto |
| `npm test` | 4 suites, 12 tests aprobados |
| `npm run typecheck` | App y specs correctos |
| `npm run db:up` | Contenedor saludable, volumen nuevo |
| `npm run migration:run` | `Init_1707781446343` aplicada únicamente en la base nueva |
| `npm run db:check` | Identidad local, ausencia de migraciones pendientes, escritura/lectura y rollback correctos |
| `npm run start:prod` | Nest arrancó contra PostgreSQL local |
| GET `/api/v1/consultation` | HTTP 200, lista vacía |
| GET `/api/docs-json` | HTTP 200 |
| `git check-ignore .env` | Ignorado; secretos fuera del diff |

La API compilada quedó arrancada al terminar esta entrega. Para editar con recarga,
detener ese proceso y ejecutar `npm run start:dev`. PostgreSQL permanece activo.
La primera instalación limpia encontró bcrypt bloqueado por la propia API de prueba
en Windows; se detuvo esa API, se repitió la instalación con éxito y se volvió a arrancar.
Jest muestra la advertencia experimental esperada de VM Modules.

Estas comprobaciones verifican infraestructura y el comportamiento existente;
no prueban todavía exclusión de turnos, saldos ni acceso privado global.

## Pendientes y siguiente secuencia

1. **F0.3/F0.4/F0.5:** acordar reglas de pendientes, confirmación, duración, márgenes y
   señas; validar boceto móvil hoy/semana y proyecto de dos sesiones. Los supuestos de
   PLAN.md continúan siendo supuestos; no se convirtieron en reglas implementadas.
2. **F1.3:** centralizar JWT, rechazar refresh como credencial de API, proteger rutas
   por defecto y sanitizar respuestas. Hoy ambos secretos locales tienen el mismo
   valor para compatibilidad, pero sigue pendiente corregir expiración y emisión.
3. **F1.4:** cuenta propietaria Gabriela, provisioning, login/logout y recuperación
   asistida, con pruebas del flujo privado.
4. **F1.5:** CI de build/pruebas. `test:e2e` sigue apuntando a archivos inexistentes;
   crear pruebas de integración del acceso privado cuando se implemente.
5. **F2:** nuevas entidades y núcleo de agenda según reglas validadas, migraciones
   aditivas y pruebas reales de concurrencia.

Persisten las discrepancias históricas de esquema documentadas en PLAN.md:
Review no está creado por la migración inicial y el estado de consultation difiere
entre entidad y migración. No se ejecutó generación automática para corregirlas.
El entorno es de desarrollo local; el acceso privado completo aún no está implementado.
