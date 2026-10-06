import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @ApiOperation({
    summary: 'Registrar actividad',
    description:
      'Registra una actividad y la asocia a la profesión indicada por professionId en la ruta.',
  })
  @ApiBody({ type: CreateActivityDto })
  @ApiParam({ name: 'professionId', description: 'Identificador de la profesión a la que se asociará la actividad.', type: 'string' })
  @ApiResponse({ status: 201, description: 'Registro creado correctamente.', type: CreateActivityDto })
  @Post(':professionId')
  create(@Param('professionId') professionId: string, @Body() createActivityDto: CreateActivityDto) {
    return this.activityService.createActivity(createActivityDto, professionId);
  }

  @ApiOperation({
    summary: 'Listar actividades',
    description:
      'Devuelve la lista de las actividades.',
  })
  @ApiResponse({ status: 200, description: 'Listado de las actividades.', type: CreateActivityDto, isArray: true })
  @Get()
  findAll() {
    return this.activityService.getAllActivities();
  }

  @ApiOperation({
    summary: 'Consultar actividad por ID',
    description:
      'Devuelve los datos de la actividad cuyo identificador se indica en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la actividad sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 200, description: 'Datos del registro solicitado.', type: CreateActivityDto })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityService.getActivityById(id);
  }

  @ApiOperation({
    summary: 'Actualizar actividad',
    description:
      'Actualiza los datos de la actividad mediante su identificador y los valores enviados en el cuerpo de la solicitud.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la actividad sobre el que se realiza la operación.', type: 'string' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({ status: 200, description: 'Registro actualizado correctamente.', type: CreateActivityDto })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateActivityDto: UpdateActivityDto) {
    return this.activityService.updateActivity(updateActivityDto, id);
  }

  @ApiOperation({
    summary: 'Eliminar actividad',
    description:
      'Elimina el registro de la actividad mediante el identificador indicado en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la actividad sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 204, description: 'Registro eliminado correctamente.' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.activityService.deleteActivity(id);
  }
}
