import { CanActivate, ExecutionContext, UnauthorizedException, mixin } from '@nestjs/common';

export const AuthorizeGuard = (allowedRoles: string[]) => {
  class RolesGuardMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
    
      const role = request?.user?.roles; // Aquí obtén directamente el rol, ya que es un enum

      console.log('aqui estoy ');
      console.log(request?.user?.roles);

      if (!role || !allowedRoles.includes(role)) {
        throw new UnauthorizedException('User role not provided or invalid.');
      }

      return true;
    }
  }

  const guard = mixin(RolesGuardMixin);
  return guard;
};
