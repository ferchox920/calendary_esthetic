import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { Roles } from 'src/utility/common/roles-enum';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: any, email: string, password: string): Promise<unknown> {
    let type = req.body.type;



    if (email.toLowerCase() === process.env.EMAIL_NODEMAIL.toLowerCase()) {
      type = Roles.ADMIN;
    }

    
    const user = await this.authService.validate(email, password, type);
    if (!user) {
      throw new HttpException('Usuario o Email Incorrecto!', HttpStatus.UNAUTHORIZED);
    }
    delete user.password;
    return user;
  }
}
