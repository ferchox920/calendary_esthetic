import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OwnerRequest } from '../agenda/clients-projects.controller';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { LinkGoogleEventDto, SelectGoogleCalendarDto } from './google-import.dto';
import { GoogleImportService } from './google-import.service';

@ApiTags('Google calendar source')
@ApiBearerAuth()
@Controller('integrations/google')
export class GoogleImportController {
  constructor(private readonly service: GoogleImportService) {}
  @Get('calendars')
  @ApiOperation({ summary: 'Listar los calendarios disponibles para importar' })
  calendars(@Req() req: OwnerRequest) {
    return this.service.calendars(req.user.id);
  }
  @Post('source')
  @ApiOperation({ summary: 'Elegir Google Calendar como fuente de horarios' })
  select(
    @Req() req: OwnerRequest & { user: JwtPayload },
    @Headers('idempotency-key') key: string,
    @Body() dto: SelectGoogleCalendarDto
  ) {
    return this.service.select(req.user, key, dto);
  }
  @Post('import')
  @ApiOperation({ summary: 'Solicitar lectura de los cambios del calendario seleccionado' })
  sync(@Req() req: OwnerRequest & { user: JwtPayload }, @Headers('idempotency-key') key: string) {
    return this.service.sync(req.user, key);
  }
  @Get('events/:id')
  @ApiOperation({ summary: 'Consultar un evento importado' })
  event(@Req() req: OwnerRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.event(req.user.id, id);
  }
  @Post('events/:id/link')
  @ApiOperation({ summary: 'Vincular manualmente un evento a un tratamiento; projectId null quita el vínculo' })
  link(
    @Req() req: OwnerRequest & { user: JwtPayload },
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkGoogleEventDto
  ) {
    return this.service.link(req.user, key, id, dto);
  }
}
