import { Module } from '@nestjs/common';
import { ProfessionalService } from './professional.service';
import { ProfessionalController } from './professional.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalEntity } from './entities/professional.entity';
import { ProfessionEntity } from '../profession/entities/profession.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalEntity, ProfessionEntity])],
  controllers: [ProfessionalController],
  providers: [ProfessionalService],
  exports:[ProfessionalService]
})
export class ProfessionalModule {}
