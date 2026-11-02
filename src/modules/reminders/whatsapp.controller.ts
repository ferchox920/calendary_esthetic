import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  Injectable,
  NestInterceptor,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { WhatsAppEmptyDto, WhatsAppLinkDto } from './whatsapp.dto';
import { WhatsAppService } from './whatsapp.service';

type OwnerRequest = Request & { user: JwtPayload };

@Injectable()
class WhatsAppNoStore implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return next.handle();
  }
}

@ApiTags('WhatsApp connection')
@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para POST. Reusar sólo para consultar el mismo comando, sin repetir la operación externa.',
})
@UseInterceptors(WhatsAppNoStore)
@Controller('integrations/whatsapp')
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}
  @ApiOperation({
    summary: 'Consultar conexión y vinculación de WhatsApp',
    description: 'Devuelve metadatos, sin número de cuenta ni QR/código.',
  })
  @Get()
  status() {
    return this.service.status();
  }
  @ApiOperation({
    summary: 'Iniciar vinculación por código o QR',
    description:
      'Requiere desvincular primero si ya hay cuenta. Devuelve linkId; consultar GET links/:id para obtener el material temporal.',
  })
  @Post('links')
  link(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: WhatsAppLinkDto) {
    return this.service.command(req.user, key, 'link', dto);
  }
  @ApiOperation({
    summary: 'Consultar QR o código temporal',
    description:
      'Sólo para el propietario; no se conserva en auditoría, idempotencia ni logs. Puede requerir polling mientras state=pending. El material se retira al vencer o conectar.',
  })
  @Get('links/:id')
  challenge(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.challenge(id);
  }
  @ApiOperation({
    summary: 'Reconectar la cuenta vinculada',
    description: 'Restaura la conexión existente sin solicitar código/QR y sin reenviar mensajes.',
  })
  @Post('reconnect')
  reconnect(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: WhatsAppEmptyDto = {}) {
    return this.service.command(req.user, key, 'reconnect', dto as Record<string, never>);
  }
  @ApiOperation({
    summary: 'Desvincular WhatsApp',
    description:
      'Cancela vinculación y elimina credenciales/claves locales. Solicita logout remoto cuando puede; remoteLogout=requested no acredita revocación remota. Conserva historial y recibos contra duplicados.',
  })
  @Post('disconnect')
  disconnect(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: WhatsAppEmptyDto = {}) {
    return this.service.command(req.user, key, 'disconnect', dto as Record<string, never>);
  }
}
