import { Module } from '@nestjs/common';
import { ProfessionService } from './profession.service';
import { ProfessionController } from './profession.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionEntity } from './entities/profession.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionEntity])],
  controllers: [ProfessionController],
  providers: [ProfessionService],
})
export class ProfessionModule {}
