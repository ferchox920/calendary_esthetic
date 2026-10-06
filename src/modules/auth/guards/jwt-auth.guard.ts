import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { PUBLIC_ROUTE } from '../public.decorator';
import { authConfig } from '../auth-config';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const config = authConfig();
    const origin = req.headers.origin;
    if (origin && origin !== config.origin) throw new ForbiddenException('Origen no permitido');
    const publicRoute = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publicRoute) return true;
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (req.headers.authorization && !bearer) throw new UnauthorizedException();
    // Browser cookie writes require the configured Origin. Bearer clients do not rely on cookies.
    if (unsafe && !bearer && req.cookies?.[config.cookieName] && origin !== config.origin) {
      throw new ForbiddenException('Origen requerido para modificar la agenda');
    }
    return super.canActivate(context);
  }

  handleRequest(err, user) {
    if (err) throw err;
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
