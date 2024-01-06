// activity.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ProfessionEntity } from '../profession/entities/profession.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ProfessionEntity)
    private readonly professionRepository: Repository<ProfessionEntity>
  ) {}

  async createActivity(createActivityDto: CreateActivityDto, professionId: string): Promise<ActivityEntity> {
    const { name, description, price } = createActivityDto;
  
    const profession = await this.professionRepository.findOne({
      where: {
        id: professionId,
      },
    });
    if (!profession) {
      throw new NotFoundException(`Profession with ID ${professionId} not found`);
    }
  
    const activity = this.activityRepository.create({ name, description, price, profession });
  
    return await this.activityRepository.save(activity);
  }
  

  async getActivityById(id: string): Promise<ActivityEntity> {
    const activity = await this.activityRepository.findOne({
      where: {
        id,
      },
      relations: ['profession'],
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    return activity;
  }

  async getAllActivities(): Promise<ActivityEntity[]> {
    return await this.activityRepository.find({ relations: ['profession'] });
  }

  async updateActivity(updateActivityDto: UpdateActivityDto, id: string): Promise<ActivityEntity> {
    const { name, description } = updateActivityDto;
    const activity = await this.getActivityById(id);

    activity.name = name;
    activity.description = description;

    return await this.activityRepository.save(activity);
  }

  async deleteActivity(id: string): Promise<void> {
    const activity = await this.getActivityById(id);

    await this.activityRepository.remove(activity);
  }
}
