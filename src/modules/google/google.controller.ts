import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { authConfig } from '../auth/auth-config';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { Public } from '../auth/public.decorator';
import { GOOGLE_CALLBACK_PATH, GOOGLE_STATE_COOKIE } from './google-config';
import { GoogleService } from './google.service';

type OwnerRequest = Request & { user: JwtPayload };
function stateCookie() {
  return {
    httpOnly: true,
    secure: authConfig().production,
    sameSite: 'lax' as const,
    path: GOOGLE_CALLBACK_PATH,
    maxAge: 10 * 60 * 1000,
  };
}

@ApiTags('Google access')
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly service: GoogleService) {}

  @Public()
  @ApiOperation({
    summary: 'Iniciar sesión con Google',
    description:
      'Abre esta URL en el navegador para iniciar el flujo OAuth. Redirige a Google y permite ingresar con la cuenta previamente vinculada.',
  })
  @Get('start')
  async start(@Res() res: Response) {
    const { state, authorizationUrl } = await this.service.begin();
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(GOOGLE_STATE_COOKIE, state, stateCookie());
    res.redirect(302, authorizationUrl);
  }

  @Public()
  @ApiOperation({
    summary: 'Completar la autorización de Google',
    description:
      'Recibe el retorno OAuth de Google y valida el estado contra la cookie del navegador. Completa la vinculación o establece la sesión local según el flujo iniciado.',
  })
  @Get('callback')
  async callback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.clearCookie(GOOGLE_STATE_COOKIE, { ...stateCookie(), maxAge: undefined });
    const result = await this.service.callback(
      req.query.state,
      req.cookies?.[GOOGLE_STATE_COOKIE],
      req.query.code,
      req.query.error
    );
    if ('session' in result) {
      const config = authConfig();
      res.cookie(config.cookieName, result.session.credential.access_token, {
        ...config.cookie,
        maxAge: config.seconds * 1000,
      });
      return { mode: 'login', profile: result.session.profile };
    }
    return result;
  }
}

@ApiTags('Google integration')
@ApiBearerAuth()
@Controller('integrations/google')
export class GoogleController {
  constructor(private readonly service: GoogleService) {}
  @ApiOperation({
    summary: 'Consultar el estado de la integración con Google',
    description:
      'Devuelve el estado de vinculación y sincronización de Google para la propietaria autenticada.',
  })
  @Get() status(@Req() req: OwnerRequest) {
    return this.service.status(req.user.id);
  }

  @ApiOperation({
    summary: 'Vincular una cuenta de Google',
    description:
      'Inicia la autorización para vincular Google y habilitar el calendario de la aplicación. Devuelve authorizationUrl para abrir en el navegador y establece la cookie de validación OAuth.',
  })
  @Post('connect')
  async connect(@Req() req: OwnerRequest, @Res({ passthrough: true }) res: Response) {
    const { state, authorizationUrl } = await this.service.begin(req.user);
    res.cookie(GOOGLE_STATE_COOKIE, state, stateCookie());
    return { authorizationUrl };
  }
  @ApiOperation({
    summary: 'Solicitar la sincronización con Google Calendar',
    description:
      'Encola la sincronización de eventos y el reintento de eventos fallidos. La agenda local conserva las reservas como fuente de datos.',
  })
  @Post('sync')
  sync(@Req() req: OwnerRequest) {
    return this.service.resync(req.user);
  }

  @ApiOperation({
    summary: 'Desvincular Google',
    description:
      'Desvincula la cuenta de Google, revoca las sesiones locales y elimina la cookie de sesión. Conserva el calendario que ya fue exportado.',
  })
  @Delete()
  async disconnect(@Req() req: OwnerRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.disconnect(req.user);
    const config = authConfig();
    res.clearCookie(config.cookieName, config.cookie);
    return result;
  }
}
