import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OwnerLoginDto } from './dto/owner-login.dto';
import { Public } from './public.decorator';
import { JwtPayload } from './interface/jwt-payload.interface';
import { authConfig } from './auth-config';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Ingresar a la agenda de Gabriela' })
  @Post('login')
  async login(@Body() dto: OwnerLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    const config = authConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(config.cookieName, result.credential.access_token, {
      ...config.cookie,
      maxAge: config.seconds * 1000,
    });
    return result;
  }

  @ApiBearerAuth()
  @Get('profile')
  profile(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.getProfile(req.user.id);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request & { user: JwtPayload }, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user);
    const config = authConfig();
    res.clearCookie(config.cookieName, config.cookie);
  }
}
