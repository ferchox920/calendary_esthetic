import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

// Kept for Passport consumers; HTTP login uses the validated OwnerLoginDto.
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string) {
    const owner = await this.auth.validateCredentials(email, password);
    return { id: owner.id, email: owner.email, name: owner.name };
  }
}
