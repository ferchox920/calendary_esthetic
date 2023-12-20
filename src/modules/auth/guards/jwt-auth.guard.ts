import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenTypes } from '../../../utility/common/token-types.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  request: any;

  canActivate(context: ExecutionContext) {
    this.request = context.switchToHttp().getRequest();

    return super.canActivate(context);
  }

  handleRequest(err, user, info) {

    let havePermission = false;

    if (user.type === TokenTypes.CHANGEPASSWORD) {
      havePermission = (this.request.url as string).indexOf('/auth/changePassword/') !== -1;
    } else if (user.type === TokenTypes.REFRESH) {
      havePermission = (this.request.url as string).indexOf('/auth/refreshToken/') !== -1;
    }

    if (user.type === TokenTypes.ACCESS || havePermission) {
      return user;
    }

    console.log(err);
    throw err || new UnauthorizedException(info ? info.message : '');
  }
}
