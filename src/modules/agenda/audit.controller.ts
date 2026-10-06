import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AgendaStore } from './agenda-store.service';
import { AuditQueryDto } from './agenda.dto';

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly store: AgendaStore) {}
  @ApiOperation({
    summary: 'Consultar el historial de auditoría',
    description:
      'Devuelve eventos ordenados del más reciente al más antiguo, con paginación mediante page y limit y filtros opcionales por entityType y entityId.',
  })
  @Get() list(@Query() dto: AuditQueryDto) {
    return this.store.db.query(
      `SELECT *,count(*) OVER()::int AS "totalCount" FROM audit_event
      WHERE ($1::text IS NULL OR "entityType"=$1) AND ($2::text IS NULL OR "entityId"=$2)
      ORDER BY "occurredAt" DESC,id LIMIT $3 OFFSET $4`,
      [dto.entityType || null, dto.entityId || null, dto.limit, (dto.page - 1) * dto.limit]
    );
  }
}
