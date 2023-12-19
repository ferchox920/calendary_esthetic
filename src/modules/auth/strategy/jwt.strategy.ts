import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interface/jwt-payload.interface';
import { UsersService } from 'src/modules/users/users.service';
import { AdminService } from 'src/modules/admin/admin.service';
import { Roles } from 'src/utility/common/roles-enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usersService: UsersService,
    private adminServices: AdminService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<unknown> {
    let user;


    switch (payload.userType) {
      case Roles.USER:
        user = await this.usersService.findById(payload.id);

        break;

      case Roles.ADMIN:
        user = await this.adminServices.findOne(payload.id);
        break;
    }

    if (user) {
 
      return {
        userType: payload.userType,
        type: payload.type,
        id: payload.id,
        roles: payload.roles,
        email: user.email,
        user: user,
      };
    } else
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Bad token',
        },
        HttpStatus.UNAUTHORIZED
      );
  }
}
