import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/users.entity';
import { EmailModule } from '../email/email.module';
import { EmailAdminitrationEnum } from 'src/utility/commons/email-adminitration-enum';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
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
