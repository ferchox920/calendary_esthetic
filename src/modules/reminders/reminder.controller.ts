import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { OwnerRequest } from '../agenda/clients-projects.controller';
import { ClientReminderDto, ReminderHistoryDto, ReminderSettingsDto, SessionReminderDto } from './reminder.dto';
import { ReminderService } from './reminder.service';
import { ReminderWorker } from './reminder-worker.service';

@ApiBearerAuth()
@ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.' })
@ApiTags('Reminders')
@Controller()
export class ReminderController {
  constructor(
    private readonly service: ReminderService,
    private readonly worker: ReminderWorker
  ) {}
  @ApiOperation({
    summary: 'Consultar la configuración de recordatorios',
    description:
      'Devuelve la configuración global de envíos, incluidos anticipos, horario permitido, tolerancia, intentos máximos y versión.',
  })
  @Get('reminders/settings') settings() {
    return this.service.settings();
  }
  @ApiOperation({
    summary: 'Actualizar la configuración de recordatorios',
    description:
      'Modifica las reglas globales de envío. Requiere la versión actual y un horario permitido cuyo fin sea posterior al inicio.',
  })
  @Patch('reminders/settings') updateSettings(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Body() dto: ReminderSettingsDto
  ) {
    return this.service.updateSettings(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Consultar el estado del servicio de recordatorios',
    description:
      'Devuelve el estado operativo del proceso encargado de enviar recordatorios.',
  })
  @Get('reminders/status') status() {
    return this.worker.status();
  }
  @ApiOperation({
    summary: 'Consultar el historial de recordatorios',
    description:
      'Devuelve recordatorios paginados con su estado y los intentos de envío. Permite filtrar por identificador de sesión y estado.',
  })
  @Get('reminders/history') history(@Query() dto: ReminderHistoryDto) {
    return this.service.history(dto);
  }
  @ApiOperation({
    summary: 'Consultar las preferencias de un cliente',
    description:
      'Devuelve la activación, la versión y la disponibilidad de teléfono para recordatorios del cliente. Si no tiene preferencias registradas, devuelve enabled=false y version=0.',
  })
  @Get('clients/:id/reminders') preference(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.preference(id);
  }
  @ApiOperation({
    summary: 'Actualizar los recordatorios de un cliente',
    description:
      'Activa o desactiva los recordatorios del cliente con control de versión. La activación requiere un teléfono internacional y aceptación explícita para ese destino; no se permite para clientes archivados.',
  })
  @Patch('clients/:id/reminders') updatePreference(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClientReminderDto
  ) {
    return this.service.updatePreference(req.user.id, key, id, dto);
  }
  @ApiOperation({
    summary: 'Actualizar los recordatorios de una sesión',
    description:
      'Activa o desactiva los recordatorios de una sesión mediante disabled. Requiere la versión actual de la sesión.',
  })
  @Patch('sessions/:id/reminders') session(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionReminderDto
  ) {
    return this.service.session(req.user.id, key, id, dto);
  }
}
