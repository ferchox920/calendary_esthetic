# Integración continua — F1.5

Fecha: 6 de octubre de 2026. El usuario autorizó configurar CI y publicar el trabajo
acumulado mediante commit y push sobre `main`.

## Implementación

Workflow `.github/workflows/ci.yml` para push en cualquier rama, pull request y ejecución
manual. Job `Build, types and PostgreSQL tests`, con timeout de 20 minutos y cancelación
de ejecuciones anteriores del mismo ref cuando aparece un cambio nuevo.

Secuencia:

1. Checkout con token de sólo lectura, sin persistir credenciales; acciones fijadas por SHA.
2. Node 24.19.0 desde `.node-version`, npm 11.6.2 y `npm ci` desde lockfile.
3. Compilación, comprobación de tipos de aplicación/specs y pruebas unitarias.
4. Migraciones históricas y aditiva sobre PostgreSQL 16 inicialmente vacío.
5. Comprobación de migraciones y escritura/lectura/rollback sin fixtures persistidas.
6. Pruebas HTTP del acceso privado con la base separada `calendary_esthetic_test`.

PostgreSQL es un servicio efímero del runner, con healthcheck. Se conserva el nombre
`calendary_esthetic_dev` en ese servicio para satisfacer las comprobaciones de aislamiento
de los scripts; es una base nueva del runner y no la base de la computadora del usuario.
No se monta ni se publica `.env`; todas las variables de CI son ficticias. No requiere
secrets del repositorio, acceso SMTP ni OWNER_PASSWORD. No despliega la aplicación.

La configuración sigue las fuentes oficiales de
[actions/checkout](https://github.com/actions/checkout),
[actions/setup-node](https://github.com/actions/setup-node) y
[servicios PostgreSQL de GitHub Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## Validación antes de publicar

Se comprobó la sintaxis YAML, triggers, permisos, servicio PostgreSQL y SHA de acciones.
Luego se exportó el índice de Git a una carpeta temporal, sin `.env`, node_modules ni
dist, y se ejecutó la secuencia del workflow en Linux con la imagen
`node:24.19.0-bookworm-slim` y un contenedor PostgreSQL 16 nuevo, sin puertos publicados.
El puerto interno usado en ese ensayo fue 5432; en GitHub el servicio se mapea a 5546.

Resultado: instalación limpia desde lockfile, build y typecheck correctos; 22 pruebas
unitarias y 9 pruebas HTTP aprobadas; ambas migraciones aplicadas desde cero y verificación
de transacción/rollback correcta. La base local de desarrollo no se modificó.
La revisión de los 50 archivos preparados para el commit no encontró el `.env` privado
ni los valores de sus secretos locales en el contenido a publicar.

El resultado remoto del primer workflow se consulta en GitHub Actions después del push;
la validación Linux anterior no sustituye el estado de esa ejecución remota.

## Alcance de publicación

El commit incluye el trabajo previo autorizado de entorno local, acceso privado,
pruebas, corrección de asociación de specs con VS Code y planificación/documentación,
además del workflow. Se mantienen los cambios de dependencias ya presentes al comenzar
la planificación y el historial de migraciones. `.env`, node_modules y dist están excluidos.

Completar CI no cierra los acuerdos/boceto pendientes de F0 ni la validación de acceso en
celular, que depende del frontend. Esas tareas preceden al núcleo de agenda de F2.
