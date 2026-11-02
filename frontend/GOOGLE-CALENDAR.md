# Google Calendar como origen de la agenda

La agenda lee el calendario seleccionado por Gabriela. Importa cinco años
anteriores y dos años futuros; amplía automáticamente el período futuro.
Los eventos importados mantienen identidad, título, notas, horarios,
instancias recurrentes, días completos y cancelaciones. No se crean clientes
ni se deducen datos de contacto. La vinculación con un tratamiento es manual.

Google es la autoridad para estos horarios. Los cambios y cancelaciones se
realizan en Google Calendar; las fichas y notas de tratamiento se gestionan
en la aplicación. Los turnos locales no se escriben en el calendario de origen.
El exportador previo para calendarios creados por la aplicación se conserva
para conexiones antiguas y funciona por separado.

## Preparar Google Cloud

Proyecto creado: `agenda-gabriela-2026` (**Agenda Gabriela**), en la cuenta
administradora actualmente abierta en Google Cloud, sin organización.

1. Habilitar **Google Calendar API** en ese proyecto.
2. Configurar **Google Auth Platform**, nombre **Agenda de Gabriela**,
   audiencia **External** y modo **Testing**. Elegir el correo de soporte
   y el contacto del responsable técnico. Agregar el correo Google de
   Gabriela a **Test users**; esto no crea una cuenta adicional en la agenda.
3. Preparar los permisos `openid`, `email`,
   `https://www.googleapis.com/auth/calendar.events.readonly`,
   `https://www.googleapis.com/auth/calendar.calendarlist.readonly` y
   `https://www.googleapis.com/auth/calendar.app.created`. Este último
   mantiene compatibilidad con la exportación anterior; no da permiso
   de escritura sobre el calendario de origen de Gabriela.
4. Crear un cliente OAuth de tipo **Web application**, nombre
   **Agenda Gabriela local**, con origen autorizado
   `http://127.0.0.1:3000` y URI de redirección exacto
   `http://127.0.0.1:3000/api/v1/auth/google/callback`.
5. Guardar Client ID y Client Secret exclusivamente en el `.env` privado:

```dotenv
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=<cliente>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secreto privado>
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/v1/auth/google/callback
GOOGLE_SYNC_WORKER_ENABLED=true
```

Conservar `GOOGLE_TOKEN_ENCRYPTION_KEY`, ya preparado. No subir el JSON de
credenciales a Git ni enviar el secreto al chat. En el modo Testing,
Google limita la vigencia del acceso sin conexión; podría ser necesario
reconectar hasta configurar la publicación apropiada de la aplicación.

También se puede importar el JSON descargado desde Google Cloud, guardándolo
en `.local/google-oauth.json` (carpeta ignorada por Git):

```powershell
node scripts/configure-google.cjs .local/google-oauth.json
```

El comando valida el proyecto, tipo web y callback, conserva la clave de cifrado
y modifica solo las variables de Google en `.env`, sin mostrar credenciales.

## Activar y usar

Con la base local preparada, ejecutar desde la raíz:

```powershell
npm run build:all
npm run migration:run
npm run start:prod
```

Ingresar en `http://127.0.0.1:3000`. Desde **Configuración → Google Calendar**:

1. **Conectar Google Calendar** y conceder los permisos con la cuenta de Gabriela.
2. **Elegir calendario** y seleccionar el calendario que usa para sus turnos.
3. Esperar la importación y consultar **Actualizar estado**.
4. En la agenda, abrir un evento y elegir **Vincular cliente y tratamiento**.
5. Consultar la ficha: el evento aparece en el historial del tratamiento.

Para probar OAuth desde un celular se necesita un origen HTTPS y un URI
de redirección registrados en Google Cloud. La IP HTTP de la vista LAN
sirve para la demostración; no es un URI OAuth válido para Google.
La autorización inicial puede hacerse desde esta computadora y luego
servir la aplicación bajo el origen definitivo.

## Comportamiento y verificación

El worker consulta cada minuto, ejecutando tareas pendientes cada 15 segundos.
La agenda visible se actualiza una vez por minuto cuando no hay un formulario
abierto. **Sincronizar ahora** adelanta la siguiente lectura; después se puede
actualizar el estado. Los datos ya importados se conservan ante errores.

La paginación guarda el cursor incremental solo al terminar todas las páginas.
Un cursor vencido (HTTP 410) inicia una lectura completa y mantiene los vínculos.
Solo una lectura completa finalizada cancela eventos ausentes de ese período.
Los reintentos son progresivos y los resultados de conexiones anteriores se
descartan después de una reconexión o cambio de calendario.

Los eventos transparentes no ocupan horario. Los eventos de día completo usan
el fin exclusivo de Google y la zona del calendario. La agenda conserva
superposiciones que ya existen en Google y marca conflictos con turnos locales.
Una nueva reserva local comprueba también los horarios de Google importados.

No se aplican los márgenes locales de preparación/limpieza a los eventos de
origen: se respeta su intervalo exacto. Los recordatorios locales anteriores
siguen asociados a las sesiones locales; esta importación no envía mensajes.

Pruebas: `npm run typecheck`, `npm test`, `npm run test:e2e`,
`npm run front:build`, `npm test --prefix frontend`. Las pruebas de integración
usan PostgreSQL en `calendary_esthetic_test` y un proveedor Google simulado,
sin leer calendarios personales ni enviar invitaciones.

Referencias oficiales:
[permisos de Calendar](https://developers.google.com/workspace/calendar/api/auth),
[lectura y sincronización incremental](https://developers.google.com/workspace/calendar/api/v3/reference/events/list),
[configuración OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent).
