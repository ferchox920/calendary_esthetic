import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenTypes } from '../commons/token-types.enum';


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
      if ((this.request.url as string).indexOf('/auth/changePassword/') === -1) {
        havePermission = true;
      }
    }
    if (user.type === TokenTypes.CHANGEPASSWORD) {
      if ((this.request.url as string).indexOf('/user/recovery-password/') === -1) {
        havePermission = true;
      }
    }
    if (user.type === TokenTypes.REFRESH) {
      if ((this.request.url as string).indexOf('/auth/refreshToken/') === -1) {
        havePermission = true;
      }
    }

    if (user.type === TokenTypes.ACCESS) {
      return user;
    }
    if (err || !user || !havePermission) {
      console.log(err);

      throw err || new UnauthorizedException(info ? info.message : '');
    }
    delete user.password;
    return user;
  }
}
