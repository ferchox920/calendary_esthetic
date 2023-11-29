import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { dataSourceOptions } from 'db/data-source';
import { ProfessionalModule } from './modules/professional/professional.module';



@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions),UsersModule, ProfessionalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
