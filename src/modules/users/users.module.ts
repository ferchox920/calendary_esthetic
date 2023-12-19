import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/users.entity';
import { EmailModule } from '../email/email.module';
import { EmailAdminitrationEnum } from 'src/utility/common/email-adminitration-enum';

import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({
      global: true,
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      signOptions: { expiresIn: process.env.JWT_EXPIRATION_TIME },
    }),
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
    EmailModule.forRoot([
      {
        tokenGmail: process.env.TOKEN_GMAIL,
        emailNodemail: process.env.EMAIL_NODEMAIL,
        key: EmailAdminitrationEnum.NOTIFICATION,
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
