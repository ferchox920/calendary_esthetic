import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from '../activity/entities/activity.entity';
import { ProfessionalEntity } from '../professional/entities/professional.entity';
import { ConsultationEntity } from './entities/consultation.entity';
import { UserEntity } from '../users/entities/users.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsultationEntity,ActivityEntity,ProfessionalEntity, UserEntity])],
  controllers: [ConsultationController],
  providers: [ConsultationService],
})
export class ConsultationModule {}
