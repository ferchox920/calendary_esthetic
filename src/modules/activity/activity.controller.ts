import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post()
  create(@Body() createActivityDto: CreateActivityDto, professionId: string) {
    return this.activityService.createActivity(createActivityDto, professionId);
  }

  @Get()
  findAll() {
    return this.activityService.getAllActivities();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityService.getActivityById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateActivityDto: UpdateActivityDto) {
    return this.activityService.updateActivity(updateActivityDto, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.activityService.deleteActivity(id);
  }
}
