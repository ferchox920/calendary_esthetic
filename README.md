<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
# calendary_esthetic

## Desarrollo local de la agenda de Gabriela

Base local aislada, configuración de build/tests y acceso privado de Gabriela.
Node `24.19.0`, npm `11.6.2` (versiones registradas en `.node-version` y `package.json`).
Se conserva el lockfile y las dependencias previamente actualizadas en el checkout.

1. Ejecutar `npm ci` para instalar exactamente el lockfile.
2. Copiar `.env.example` a `.env` si no existe. Reemplazar los secretos de ejemplo;
   `JWT_SECRET` debe tener al menos 32 bytes. Es el único secreto JWT utilizado.
   El `.env` local preparado ya contiene secretos aleatorios y está ignorado por Git.
3. Con Docker activo, ejecutar `npm run db:up`.
4. Ejecutar `npm run migration:run` **sólo apuntando a la nueva base local**.
5. Para una base recién creada, configurar `OWNER_EMAIL`/`OWNER_PASSWORD` y ejecutar
   `npm run owner:init`. El entorno local preparado ya tiene la cuenta creada.
6. Ejecutar `npm run db:check`, `npm run typecheck`, `npm test` y `npm run test:e2e`.
7. Ejecutar `npm run start:dev`, o `npm run build` seguido de `npm run start:prod`.

API: `http://127.0.0.1:3000/api/v1`; Swagger: `http://127.0.0.1:3000/api/docs`.
El entorno local escucha en loopback mediante `HOST=127.0.0.1`.
Todas las rutas de aplicación requieren sesión salvo `POST /api/v1/auth/login`.
Login acepta exclusivamente email y password; profile devuelve la identidad propietaria.
`POST /api/v1/auth/logout` revoca todas las sesiones existentes. No se emiten refresh tokens.
Swagger está disponible sólo en desarrollo; `NODE_ENV=production` desactiva sus rutas.

PostgreSQL 16 usa `127.0.0.1:5546`, base `calendary_esthetic_dev`, servicio
`calendary-esthetic-dev-postgres-1` y volumen `calendary-esthetic-dev_postgres_data`.
`npm run db:stop` detiene el servicio conservando los datos; `npm run db:up` lo reanuda.
No usar `docker compose down -v` para detenerlo: eliminaría el volumen.
Cambiar credenciales en `.env` no cambia automáticamente las de un volumen ya inicializado.

`POSTGRES_SSL=false` permite el PostgreSQL local. Para una conexión remota,
configurar `POSTGRES_SSL=true` y mantener `POSTGRES_SSL_REJECT_UNAUTHORIZED=true`
con la cadena de confianza del proveedor. `POSTGRES_SHEMA` se admite como alias heredado.
Faltantes de conexión, puertos inválidos y booleanos inválidos fallan al arrancar.
La conexión nunca aplica migraciones ni sincroniza esquemas automáticamente.

`EMAIL_MODE=disabled` omite la entrega sin SMTP, sin mostrar OTPs y sin leer plantillas.
No permite completar una verificación por email; es para probar caminos que no requieren
correo. `EMAIL_MODE=smtp` utiliza la configuración Gmail heredada.
Jest usa `--experimental-vm-modules` para cargar las dependencias ESM de Nest 12
con el código CommonJS existente; Node imprime una advertencia experimental esperada.

`npm run db:check` comprueba identidad local, migraciones aplicadas y lectura/escritura
transaccional con una fixture ficticia que revierte inmediatamente. Rechaza bases remotas.
La migración inicial se conserva intacta: las discrepancias de Review y estados heredados
se documentan para reconciliar más adelante. La migración aditiva de `owner_account`
separa credenciales de clientes y permite una única cuenta propietaria.

Las pruebas e2e crean y utilizan **otra base**, `calendary_esthetic_test`, dentro del
cluster local; limpian únicamente fixtures de esa base. Comprueban protección de rutas,
cookies/origen, expiración, sanitización, logout, recuperación y restricción de cuenta única.
La base de desarrollo y la contraseña local de Gabriela no se modifican en esas pruebas.

Login establece `agenda_session` HttpOnly y SameSite=Strict. En producción también Secure.
Las escrituras por cookie requieren `Origin` igual a `APP_ORIGIN`; los clientes Bearer
pueden operar sin Origin. Si se envía Origin, siempre debe coincidir. CORS usa únicamente
ese origen. En producción debe ser HTTPS; configurar el origen del frontend antes de usarlo.
`JWT_EXPIRATION_TIME` admite s/m/h/d entre un segundo y un día; por defecto, una hora.

Credenciales locales ficticias: email `gabriela@example.test`; contraseña generada en
`OWNER_PASSWORD` del `.env` privado. Para probar con Swagger, ejecutar login y usar
el `access_token` devuelto en Authorize. Nunca pegar credenciales en documentación o Git.
Provisioning y recuperación son comandos administrativos; no hay registro público ni OTP.
Para recuperación asistida, el responsable técnico verifica la identidad de Gabriela,
configura `OWNER_EMAIL` con el email existente y suministra una contraseña nueva mediante
`OWNER_PASSWORD`. Ejecutar `npm run owner:reset` cambia el hash, reactiva la cuenta y revoca
todas las sesiones anteriores. Entregar la contraseña por un canal privado y comprobar
el nuevo login, sin registrar credenciales en tickets ni logs.

## Integración continua (F1.5)

GitHub Actions ejecuta `.github/workflows/ci.yml` en cada push, pull request y ejecución
manual. Usa Ubuntu, el Node de `.node-version`, npm 11.6.2 e instalación desde lockfile.
Comprueba build, tipos, pruebas unitarias, migraciones sobre PostgreSQL 16 vacío,
lectura/escritura con rollback y pruebas HTTP en una base de test separada.

Las bases del runner son descartables. CI usa variables ficticias declaradas en el
workflow, sin `.env`, SMTP ni credenciales de Gabriela. Las acciones están fijadas por
SHA y el token del workflow tiene permiso de lectura. No ejecuta `lint --fix` ni despliega.
Los fallos quedan visibles en la pestaña Actions del repositorio.
