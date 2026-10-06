# Acceso privado — F1.3 y backend de F1.4

Fecha: 6 de octubre de 2026. Referencia: [PLAN.md](PLAN.md).

El usuario autorizó continuar con JWT centralizado, protección de rutas y cuenta
de Gabriela. Se mantiene su confirmación de que no hay despliegue ni datos reales.
La API local está en `http://127.0.0.1:3000`; PostgreSQL continúa en el Docker del proyecto.

## Comportamiento implementado

- Cuenta propietaria separada en `owner_account`, creada mediante una migración aditiva.
  Una restricción de base admite como máximo una fila propietaria. Contraseña bcrypt
  con costo 12, cuenta activable y versión persistente de sesión.
- Único secreto `JWT_SECRET`, firma HS256 con issuer/audience y duración validada.
  La expiración comunicada se obtiene de `exp`, sin quitar unidades al vencimiento.
- `POST /api/v1/auth/login` acepta email/password y devuelve perfil mínimo, token de
  acceso y expiración. Establece cookie HttpOnly, SameSite=Strict y Secure en producción.
  No acepta el antiguo campo type ni emite refresh tokens.
- Guard global: todas las rutas de aplicación son privadas por defecto salvo login.
  Valida tipo ACCESS, propietario, firma, issuer/audience, vencimiento, cuenta activa
  y versión de sesión. Refresh, tokens sin expiración y sujetos inválidos reciben 401;
  una identidad firmada sin permiso propietario recibe 403.
- `GET /api/v1/auth/profile` expone sólo id/nombre/email. Logout incrementa la versión
  persistente y elimina la cookie: **cierra todas las sesiones de Gabriela**, incluidas
  otras pestañas y dispositivos. Tokens ya emitidos dejan de servir en la siguiente petición.
- CORS limitado a `APP_ORIGIN`. Si una petición envía Origin, debe coincidir. Las
  escrituras autenticadas por cookie exigen ese Origin; clientes Bearer no necesitan
  enviarlo. Un header Authorization inválido no evita esa protección.
- Hashes, contraseñas y OTPs están excluidos de consultas normales y de respuestas
  recursivamente, incluidos objetos planos devueltos por los módulos heredados.
- Registro público de users, generación/validación de OTP y el flujo JWT heredado
  quedaron retirados. Las tablas antiguas permanecen y su CRUD exige sesión propietaria.
  Las cuentas admin/user/professional antiguas ya no pueden iniciar sesión de agenda.
- Swagger se expone sólo en desarrollo. No se registran cuerpos, credenciales,
  tokens ni parámetros de consulta en los logs HTTP de arranque.

## Cuenta local y uso desde Swagger

Se ejecutaron la migración y `npm run owner:init` en `calendary_esthetic_dev`.
Cuenta local ficticia: `gabriela@example.test`, nombre Gabriela. La contraseña aleatoria
se encuentra en `OWNER_PASSWORD` del `.env` privado y no se publica aquí.
La cuenta no se crea automáticamente al arrancar la API.

1. Abrir `http://127.0.0.1:3000/api/docs`.
2. Ejecutar `POST /api/v1/auth/login` con email y password del `.env`.
3. Pegar el access_token devuelto en Authorize para probar profile o las rutas privadas.
4. Ejecutar logout; una consulta posterior con el mismo token debe devolver 401.

Para otro entorno, instalar dependencias, configurar conexión y secreto, aplicar
migraciones, configurar OWNER_EMAIL/OWNER_PASSWORD y ejecutar `npm run owner:init`.
El comando rechaza una cuenta ya existente y no reemplaza su contraseña.
La contraseña debe tener entre 12 y 72 bytes, sin placeholders; el email se normaliza.
Para producción usar email acordado con Gabriela, HTTPS, `APP_ORIGIN` exacto y secretos
fuera del repositorio. Las variables OWNER_* son exclusivas de los comandos administrativos.

## Recuperación asistida

El responsable técnico debe verificar la identidad de Gabriela fuera de la aplicación
y disponer de acceso administrativo al entorno/DB. No hay recuperación pública por email.

1. Confirmar que la conexión seleccionada corresponde al entorno a recuperar y que
   OWNER_EMAIL coincide con el email existente.
2. Generar una contraseña nueva de 12–72 bytes y suministrarla como OWNER_PASSWORD
   al comando, sin incluirla en argumentos de terminal, tickets o logs.
3. Ejecutar `npm run owner:reset`. Cambia el hash, reactiva la cuenta e incrementa
   sessionVersion en una actualización. Revoca todos los tokens anteriores.
4. Entregar la contraseña a Gabriela por el canal privado acordado y comprobar login.
   La contraseña antigua debe fallar. Registrar fecha/responsable del procedimiento
   sin registrar la contraseña.

En el entorno local puede actualizarse OWNER_PASSWORD en el `.env` privado antes del
comando. Para evitar escribir una contraseña en el historial de PowerShell, se puede
proporcionar una variable de proceso temporal:

```powershell
$taskRecoverySecret = Read-Host 'Nueva contraseña' -AsSecureString
$env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $taskRecoverySecret).Password
try { npm run owner:reset } finally {
    Remove-Item Env:OWNER_PASSWORD
    Remove-Variable taskRecoverySecret
}
```

El comando nunca imprime credenciales. Sin acceso administrativo al entorno no se puede
recuperar la cuenta por HTTP. La API continúa funcionando tras la recuperación y sólo
acepta credenciales/versiones nuevas.

## Verificación realizada

| Comprobación | Resultado |
|---|---|
| Build y typecheck de app/specs | Correctos |
| `npm test` | 5 suites, 22 pruebas aprobadas |
| `npm run test:e2e` | 9 pruebas HTTP con PostgreSQL real aprobadas |
| Protección de rutas | Cada método privado enumerado por OpenAPI rechaza sin sesión |
| Firma/vencimiento/tipo/permiso | Firma incorrecta, expirado, refresh, sin exp y subject inválido: 401; otra identidad: 403 |
| Cookies/origen/logout | Cookie protegida; escritura sin origen correcto rechazada; logout revoca ambas sesiones de prueba |
| Recuperación y desactivación | Cuenta inactiva rechazada; nueva contraseña funciona; contraseña/token anteriores rechazados |
| Sanitización | Lecturas de users/admin/professional sin hashes ni OTPs; objetos anidados también sanitizados |
| Cuenta única | Segunda alta rechazada por CLI y por constraint PostgreSQL |
| `npm run db:check` | Migraciones sin pendientes, escritura/lectura y rollback correctos |
| API compilada contra DB de desarrollo | 401 sin sesión; login/profile/agenda correctos; logout 204 y token anterior 401 |

Las pruebas usan `calendary_esthetic_test`, una base separada dentro del cluster local.
Sólo limpian fixtures de test. El ensayo de recuperación cambia la cuenta ficticia de
test; la contraseña generada de la cuenta de desarrollo queda intacta.
La API compilada quedó arrancada al terminar. PostgreSQL y su volumen continúan activos.

## Límites y siguiente trabajo

Esta entrega implementa el backend del acceso privado. La pantalla de ingreso y la
validación en el celular pertenecen al frontend de F3: todavía no existe interfaz móvil.
La expiración devuelve 401; conservar formularios al reingresar se implementará allí.
No se considera completado F1 entero: queda CI (F1.5), además de los acuerdos y boceto
pendientes de F0 antes de implementar las reglas del núcleo de agenda de F2.
Las discrepancias históricas de Review/estados continúan documentadas; no se regeneró
ni borró la migración inicial, ni se ejecutó synchronize/schema drop.
