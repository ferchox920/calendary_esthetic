import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminService } from '../admin/admin.service';
import { UserEntity } from '../users/entities/users.entity';
import { AdminEntity } from '../admin/entities/admin.entity';
import { Roles } from 'src/utility/common/roles-enum';
import { TokenTypes } from 'src/utility/common/token-types.enum';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interface/jwt-payload.interface';
import { ProfessionalEntity } from '../professional/entities/professional.entity';
import { ProfessionalService } from '../professional/professional.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(AdminEntity)
    private readonly adminRepository: Repository<AdminEntity>,
    @InjectRepository(ProfessionalEntity)
    private readonly professionalRepository: Repository<ProfessionalEntity>,
    private readonly usersService: UsersService,
    private readonly adminService: AdminService,
    private readonly professionalService: ProfessionalService,
    private readonly jwtService: JwtService,
    private config: ConfigService
  ) {}

  async login(user: JwtPayload) {
    let profile: UserEntity | AdminEntity;

    switch (user.roles) {
      case Roles.USER:
        profile = await this.userRepository.findOne({ where: { id: user.id } });
        break;

      case Roles.ADMIN:
        profile = await this.adminRepository.findOne({
          where: { id: user.id },
        });
        break;
      case Roles.PROFESSIONAL:
        profile = await this.professionalRepository.findOne({
          where: { id: user.id },
        });
        break;

      default:
        throw new Error('Invalid role');
    }

    const credential = await this.authGenericResponse(user);

    return {
      profile,
      credential,
    };
  }

  async authGenericResponse(user: JwtPayload | UserEntity | AdminEntity) {
    return {
      access_token: this.generateToken(user, TokenTypes.ACCESS),
      refresh_token: this.generateToken(user, TokenTypes.REFRESH, {
        expiresIn: this.config.get('JWT_EXPIRATION_TIME_REFRESH'),
      }),
      expirationTime: this.calculateExpirationTime(),
      id: user?.id,
      email: user?.email,
      roles: user?.roles,
    };
  }

  async getProfile(id: string) {
    const user = await this.usersService.findById(id);
    user.password;
    return user;
  }
  private calculateExpirationTime() {
    const expiresIn = this.config.get('JWT_EXPIRATION_TIME').replace(/[^\d.-]/g, '');
    const timeNow = new Date();
    const expirationTokenTime = new Date(timeNow.getTime() + +(1000 * parseInt(expiresIn)));
    return expirationTokenTime;
  }

  private generateToken(
    user: JwtPayload | UserEntity | AdminEntity,
    type: TokenTypes,
    config?: {
      secret?: string;
      expiresIn?: string;
    }
  ) {
    const commonPayload: Object = {
      userType: user.roles,
      type: type,
      email: user.email,
      id: user.id,
      roles: user.roles,
    };

    const options: JwtSignOptions = {
      expiresIn: config?.expiresIn || this.config.get('JWT_EXPIRATION_TIME'),
      secret: config?.secret || this.config.get('JWT_SECRET'),
    };

    return this.jwtService.sign(commonPayload, options);
  }

  async validate(email: string, password: string, type: string): Promise<any> {
    let payload = { email, password, type}
    switch (type) {
      case Roles.USER:
        return await this.usersService.login(payload);
      case Roles.ADMIN:
        return await this.adminService.login(payload);
      case Roles.PROFESSIONAL:
        return await this.professionalService.login(payload);
    }
    throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  async refreshToken(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }
    return this.authGenericResponse(user);
  }
}
