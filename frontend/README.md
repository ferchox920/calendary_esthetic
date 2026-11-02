# Agenda privada de Gabriela

Frontend en TypeScript y Vite. Una única propietaria accede con el login existente;
los clientes son fichas de contacto y no tienen cuentas de acceso.

Incluye agenda diaria/semanal, filtros de estado, calendario, disponibilidad,
clientes con búsqueda, tratamientos con notas e historial, alta y edición de
clientes, reserva, confirmación, reprogramación, cancelación, finalización e
inasistencia de sesiones, bloqueos y configuración de horarios y márgenes.

## Ejecutar con la API en un único origen

Desde la raíz del proyecto:

```powershell
npm ci --prefix frontend
npm run build:all
npm run start:prod
```

Abrir `http://127.0.0.1:3000`. Nest sirve `frontend/dist`; las llamadas a
`/api/v1` usan la cookie HttpOnly existente. Requiere la base y la cuenta privada
preparadas según el README principal. `start:prod` conserva el modo definido en
el entorno; si `NODE_ENV=production`, APP_ORIGIN debe ser HTTPS.

## Desarrollo con recarga automática

Terminal para la API (PowerShell):

```powershell
$env:APP_ORIGIN='http://127.0.0.1:5173'
npm run start:dev
```

Otra terminal:

```powershell
npm run front:dev
```

Abrir `http://127.0.0.1:5173`. Vite envía `/api` a la API local en el puerto
3000 sin alterar Origin. La API debe arrancar con APP_ORIGIN igual al origen
del frontend para aceptar escrituras por cookie.

## Vista de demostración

El botón **Explorar una demostración** del ingreso muestra datos ficticios.
No utiliza la base, no guarda datos ni credenciales en el navegador y no
permite escrituras. Para revisar solo esta vista sin PostgreSQL:

```powershell
npm run front:dev
```

## Validación y publicación

`npm run front:build` valida tipos y genera el bundle. CI instala el lockfile
del frontend y ejecuta ese mismo chequeo. La sesión se restaura consultando
el perfil; al vencer, la interfaz limpia los datos y vuelve al ingreso.
Las operaciones envían versión e Idempotency-Key y conservan la misma clave
al reintentar el mismo formulario. Fechas y horas se interpretan en la zona
de la agenda mediante Temporal, independientemente de la zona del dispositivo.

Para publicar, servir el frontend y `/api/v1` desde el mismo origen HTTPS,
configurado en APP_ORIGIN. No incluir el `.env` del backend en el frontend.
Las fuentes de Google Fonts tienen alternativas locales sans-serif y serif.
