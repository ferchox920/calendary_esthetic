import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { OwnerAccount } from './entities/owner-account.entity';
import { OwnerLoginDto } from './dto/owner-login.dto';
import { TokenTypes } from '../../utility/common/token-types.enum';
import { Roles } from '../../utility/common/roles-enum';
import { JwtPayload } from './interface/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(OwnerAccount) private readonly owners: Repository<OwnerAccount>,
    private readonly jwt: JwtService
  ) {}

  async validateCredentials(email: string, password: string) {
    if (typeof email !== 'string' || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const owner = await this.owners
      .createQueryBuilder('owner')
      .addSelect('owner.passwordHash')
      .where('owner.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
    // Equal bcrypt work for unknown accounts; the hash is not a credential.
    const hash = owner?.passwordHash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
    const matches = await bcrypt.compare(password, hash);
    if (!owner?.active || !matches) throw new UnauthorizedException('Credenciales inválidas');
    return owner;
  }

  async login(dto: OwnerLoginDto) {
    const owner = await this.validateCredentials(dto.email, dto.password);
    const access_token = this.jwt.sign({
      sub: owner.id,
      scope: 'owner',
      type: TokenTypes.ACCESS,
      sessionVersion: owner.sessionVersion,
      roles: Roles.ADMIN,
    });
    const decoded = this.jwt.decode(access_token) as { exp: number };
    return {
      profile: { id: owner.id, name: owner.name, email: owner.email },
      credential: { access_token, expirationTime: new Date(decoded.exp * 1000).toISOString() },
    };
  }

  async getProfile(id: string) {
    const owner = await this.owners.findOneBy({ id, active: true });
    if (!owner) throw new UnauthorizedException();
    return { id: owner.id, name: owner.name, email: owner.email };
  }

  async logout(user: JwtPayload) {
    // Logging out invalidates every existing session of the single owner.
    await this.owners
      .createQueryBuilder()
      .update()
      .set({ sessionVersion: () => '"sessionVersion" + 1' })
      .where('id = :id AND "sessionVersion" = :version', { id: user.id, version: user.sessionVersion })
      .execute();
  }
}
