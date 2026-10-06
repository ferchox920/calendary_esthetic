import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OwnerAccount } from '../entities/owner-account.entity';
import { authConfig } from '../auth-config';
import { TokenTypes } from '../../../utility/common/token-types.enum';
import { Roles } from '../../../utility/common/roles-enum';
import { JwtPayload } from '../interface/jwt-payload.interface';
import { isUUID } from 'class-validator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(OwnerAccount) private readonly owners: Repository<OwnerAccount>) {
    const config = authConfig();
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.cookies?.[config.cookieName] || null,
      ]),
      secretOrKey: config.jwt.secret,
      ignoreExpiration: false,
      algorithms: ['HS256'],
      issuer: config.jwt.signOptions.issuer,
      audience: config.jwt.signOptions.audience,
    });
  }

  async validate(payload: any): Promise<JwtPayload> {
    if (
      payload.type !== TokenTypes.ACCESS ||
      !isUUID(payload.sub) ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1
    ) {
      throw new UnauthorizedException();
    }
    if (payload.scope !== 'owner' || payload.roles !== Roles.ADMIN) throw new ForbiddenException();
    const owner = await this.owners.findOneBy({ id: payload.sub, active: true });
    if (!owner || owner.sessionVersion !== payload.sessionVersion) throw new UnauthorizedException();
    return {
      id: owner.id,
      email: owner.email,
      roles: Roles.ADMIN,
      userType: Roles.ADMIN,
      type: TokenTypes.ACCESS,
      sessionVersion: owner.sessionVersion,
    };
  }
}
