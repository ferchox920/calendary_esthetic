// jwt.module.ts

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthService } from './jwt.service'; // Ajusta la ruta según la estructura de tu proyecto
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: process.env.JWT_EXPIRATION_TIME },
    }),
    UsersModule, 
  ],
  providers: [JwtAuthService],
  exports: [JwtAuthService, JwtModule], 
})
export class JwtAuthModule {}
