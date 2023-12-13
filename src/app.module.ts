import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './modules/users/users.module';
import { dataSourceOptions } from 'db/data-source';
import { ProfessionalModule } from './modules/professional/professional.module';
import { JwtAuthModule } from './modules/jwt/jwt.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    UsersModule,
    ProfessionalModule,
    JwtAuthModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
