import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionEntity } from '../profession/entities/profession.entity';
import { ActivityEntity } from './entities/activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEntity,ProfessionEntity])],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
