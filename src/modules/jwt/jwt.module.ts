// jwt.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthService } from './jwt.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.register({
      secret: 'your-secret-key',
      signOptions: {
        expiresIn: '1d',
      },
    }),
    forwardRef(() => UsersModule), // Utiliza forwardRef aquí
  ],
  providers: [JwtAuthService],
  exports: [JwtAuthService],
})
export class JwtAuthModule {}
