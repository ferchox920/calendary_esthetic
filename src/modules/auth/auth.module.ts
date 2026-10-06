import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OwnerAccount } from './entities/owner-account.entity';
import { JwtStrategy } from './strategy/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrivateResponseInterceptor } from './private-response.interceptor';
import { authConfig } from './auth-config';

@Module({
  imports: [
    TypeOrmModule.forFeature([OwnerAccount]),
    PassportModule,
    JwtModule.registerAsync({ useFactory: () => authConfig().jwt }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: PrivateResponseInterceptor },
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
