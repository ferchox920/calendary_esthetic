import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { OwnerRequest } from './clients-projects.controller';
import {
  ChangeBlockDto,
  CorrectStatusDto,
  CreateBlockDto,
  CreateSessionDto,
  DayDto,
  RangeDto,
  ReasonDto,
  RescheduleDto,
  SettingsDto,
  VersionDto,
  WindowsDto,
} from './agenda.dto';

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Agenda')
@Controller('agenda')
export class AgendaController {
  constructor(private readonly service: SchedulingService) {}
  @ApiOperation({
    summary: 'Consultar la configuración de la agenda',
    description:
      'Devuelve la zona horaria, los márgenes predeterminados de preparación y limpieza, la versión y las ventanas laborales.',
  })
  @Get('settings') settings() {
    return this.service.settings();
  }
  @ApiOperation({
    summary: 'Actualizar la configuración de la agenda',
    description:
      'Modifica la zona horaria o los márgenes predeterminados. Requiere la versión actual y rechaza cambios de zona que dejen sesiones futuras fuera de jornada.',
  })
  @Patch('settings') updateSettings(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Body() dto: SettingsDto
  ) {
    return this.service.updateSettings(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Reemplazar los horarios laborales',
    description:
      'Configura nuevas ventanas laborales con vigencia desde hoy o una fecha posterior. Requiere la versión de la agenda y rechaza horarios incompatibles con las sesiones futuras.',
  })
  @Post('working-windows') windows(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Body() dto: WindowsDto
  ) {
    return this.service.replaceWindows(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Consultar entradas por intervalo',
    description:
      'Devuelve las sesiones y los bloqueos que se superponen con el intervalo definido por from y to, junto con la zona horaria de la agenda.',
  })
  @Get('entries') range(@Query() dto: RangeDto) {
    return this.service.range(dto.from, dto.to);
  }
  @ApiOperation({
    summary: 'Consultar la agenda de un día',
    description:
      'Devuelve las sesiones y los bloqueos de la fecha indicada en formato YYYY-MM-DD, interpretada en la zona horaria de la agenda.',
  })
  @Get('day') day(@Query() dto: DayDto) {
    return this.service.day(dto.date);
  }
  @ApiOperation({
    summary: 'Consultar la agenda de hoy',
    description:
      'Devuelve las sesiones y los bloqueos del día actual según la zona horaria configurada en la agenda.',
  })
  @Get('today') today() {
    return this.service.day();
  }
  @ApiOperation({
    summary: 'Consultar la disponibilidad de un día',
    description:
      'Calcula los intervalos libres dentro de las ventanas laborales de la fecha indicada, descontando sesiones que ocupan horario y bloqueos activos.',
  })
  @Get('availability') availability(@Query() dto: DayDto) {
    return this.service.availability(dto.date);
  }
}

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly service: SchedulingService) {}
  @ApiOperation({
    summary: 'Consultar una sesión',
    description:
      'Devuelve la sesión identificada por su UUID, con su horario, estado y versión actual.',
  })
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEntry(id, 'session');
  }
  @ApiOperation({
    summary: 'Reservar una sesión',
    description:
      'Crea una sesión pendiente para un proyecto y cliente activos. El horario debe ser futuro y caber, con sus márgenes de preparación y limpieza, en una ventana laboral sin superposiciones.',
  })
  @Post() create(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: CreateSessionDto) {
    return this.service.createSession(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Reprogramar una sesión',
    description:
      'Cambia el horario de una sesión pendiente o confirmada. Requiere la versión actual y un motivo; valida jornada laboral, márgenes y disponibilidad.',
  })
  @Post(':id/reschedule') reschedule(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleDto
  ) {
    return this.service.reschedule(req.user.id, key, id, dto);
  }
  @ApiOperation({
    summary: 'Confirmar una sesión',
    description:
      'Cambia una sesión pendiente a confirmed. Requiere la versión actual y valida que el horario siga siendo futuro y esté disponible.',
  })
  @Post(':id/confirm') confirm(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto
  ) {
    return this.service.transition(req.user.id, key, id, 'confirmed', dto);
  }
  @ApiOperation({
    summary: 'Cancelar una sesión',
    description:
      'Cambia una sesión pendiente o confirmada a canceled y libera su horario. Requiere la versión actual y un motivo de cancelación.',
  })
  @Post(':id/cancel') cancel(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto
  ) {
    return this.service.transition(req.user.id, key, id, 'canceled', dto);
  }
  @ApiOperation({
    summary: 'Marcar una sesión como realizada',
    description:
      'Cambia una sesión confirmada a done. Requiere la versión actual y que haya transcurrido su hora de finalización.',
  })
  @Post(':id/complete') complete(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto
  ) {
    return this.service.transition(req.user.id, key, id, 'done', dto);
  }
  @ApiOperation({
    summary: 'Registrar una inasistencia',
    description:
      'Cambia una sesión confirmada a absent. Requiere la versión actual y que haya transcurrido su hora de finalización.',
  })
  @Post(':id/absent') absent(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto
  ) {
    return this.service.transition(req.user.id, key, id, 'absent', dto);
  }
  @ApiOperation({
    summary: 'Corregir el estado final de una sesión',
    description:
      'Corrige una sesión realizada, ausente o cancelada. Requiere la versión actual, un estado diferente y un motivo; aplica las validaciones de horario y disponibilidad del nuevo estado.',
  })
  @Post(':id/correct-status') correct(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectStatusDto
  ) {
    return this.service.transition(req.user.id, key, id, dto.status, dto, true);
  }
}

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Blocks')
@Controller('blocks')
export class BlocksController {
  constructor(private readonly service: SchedulingService) {}
  @ApiOperation({
    summary: 'Consultar un bloqueo',
    description:
      'Devuelve el bloqueo identificado por su UUID, con su intervalo, motivo, estado de activación y versión.',
  })
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEntry(id, 'block');
  }
  @ApiOperation({
    summary: 'Bloquear un horario',
    description:
      'Registra un intervalo no disponible con un motivo. Rechaza superposiciones con sesiones que ocupan horario y otros bloqueos activos.',
  })
  @Post() create(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: CreateBlockDto) {
    return this.service.createBlock(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Actualizar un bloqueo',
    description:
      'Modifica el intervalo, el motivo y la activación del bloqueo. Requiere la versión actual y valida superposiciones cuando queda activo.',
  })
  @Patch(':id') update(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBlockDto
  ) {
    return this.service.updateBlock(req.user.id, key, id, dto);
  }
}
