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
import { CommonService } from 'src/utility/common/services/common.service';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    AdminModule,
    TypeOrmModule.forFeature([UserEntity, AdminEntity]),
    JwtModule.register({
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy,CommonService],
})
export class AuthModule {}
