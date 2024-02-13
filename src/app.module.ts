import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './modules/users/users.module';
import { dataSourceOptions } from 'db/data-source';
import { ProfessionalModule } from './modules/professional/professional.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfessionModule } from './modules/profession/profession.module';
import { ActivityModule } from './modules/activity/activity.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { ReviewModule } from './modules/review/review.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),

    UsersModule,
    ProfessionalModule,
    AdminModule,
    AuthModule,
    ProfessionModule,
    ActivityModule,
    ConsultationModule,
    ReviewModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
