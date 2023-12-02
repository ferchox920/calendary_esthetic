// jwt.service.ts

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserEntity } from '../users/entities/users.entity';
import { JwtPayload } from 'src/utility/interface/jwt-payload.interface';
import { TokenTypes } from 'src/utility/commons/token-types.enum';
import { Roles } from 'src/utility/commons/roles-enum';

@Injectable()
export class JwtAuthService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(user: UserEntity): string {
    
    const payload: JwtPayload = {
      type: TokenTypes.ACCESS,
      email: user.email,
      id: user.id,
      role: Roles.USER,
    };
    const result = this.jwtService.sign(payload);
    return result
  }

  generateRefreshToken(user: UserEntity): string {
    const payload: JwtPayload = {
      type: TokenTypes.REFRESH,
      email: user.email,
      id: user.id,
      role: Roles.USER,
    };
    return this.jwtService.sign({
      ...payload,
      expireIn: process.env.JWT_EXPIRATION_TIME,
    });
  }

  generateTokens(user: UserEntity): { access_token: string; refresh_token: string } {
    return {
      access_token: this.generateAccessToken(user),
      refresh_token: this.generateRefreshToken(user),
    };
  }
}
