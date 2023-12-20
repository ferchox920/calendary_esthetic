import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';

import { AdminEntity } from '../admin/entities/admin.entity';
import { UserEntity } from '../users/entities/users.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';
import { LocalStrategy } from './strategy/local.strategy';
import { JwtStrategy } from './strategy/jwt.strategy';
import { CommonService } from 'src/utility/middleware/services/common.service';
import { ProfessionalEntity } from '../professional/entities/professional.entity';
import { ProfessionalModule } from '../professional/professional.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    AdminModule,
    ProfessionalModule,
    TypeOrmModule.forFeature([UserEntity, AdminEntity,ProfessionalEntity]),
    JwtModule.register({
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy,CommonService],
})
export class AuthModule {}
