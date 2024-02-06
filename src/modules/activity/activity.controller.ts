import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @ApiOperation({ summary: 'Create a new activity' })
  @ApiBody({ type: CreateActivityDto })
  @ApiParam({ name: 'professionId', description: 'ID of the profession associated with the activity', type: 'string' })
  @ApiResponse({ status: 201, description: 'Activity created successfully', type: CreateActivityDto })
  @Post(':professionId')
  create(@Param('professionId') professionId: string, @Body() createActivityDto: CreateActivityDto) {
    return this.activityService.createActivity(createActivityDto, professionId);
  }

  @ApiOperation({ summary: 'Get all activities' })
  @ApiResponse({ status: 200, description: 'Return all activities', type: CreateActivityDto, isArray: true })
  @Get()
  findAll() {
    return this.activityService.getAllActivities();
  }

  @ApiOperation({ summary: 'Get an activity by ID' })
  @ApiParam({ name: 'id', description: 'Activity ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return an activity by ID', type: CreateActivityDto })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityService.getActivityById(id);
  }

  @ApiOperation({ summary: 'Update an activity by ID' })
  @ApiParam({ name: 'id', description: 'Activity ID', type: 'string' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({ status: 200, description: 'Activity updated successfully', type: CreateActivityDto })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateActivityDto: UpdateActivityDto) {
    return this.activityService.updateActivity(updateActivityDto, id);
  }

  @ApiOperation({ summary: 'Delete an activity by ID' })
  @ApiParam({ name: 'id', description: 'Activity ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Activity deleted successfully' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.activityService.deleteActivity(id);
  }
}
