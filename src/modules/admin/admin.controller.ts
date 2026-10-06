import { Controller, Get, Post, Param, Body, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminEntity } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({
    summary: 'Listar administradores',
    description:
      'Devuelve la lista de los administradores.',
  })
  @ApiResponse({ status: 200, description: 'Listado de los administradores.', type: AdminEntity, isArray: true })
  @Get()
  async findAll(): Promise<AdminEntity[]> {
    return await this.adminService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar administrador por ID',
    description:
      'Devuelve los datos del administrador cuyo identificador se indica en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador del administrador sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 200, description: 'Datos del registro solicitado.', type: AdminEntity })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminEntity> {
    return this.adminService.findOne(id);
  }

  @ApiOperation({
    summary: 'Registrar administrador',
    description:
      'Registra el administrador con los datos enviados en el cuerpo de la solicitud.',
  })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({ status: 201, description: 'Registro creado correctamente.', type: AdminEntity })
  @Post()
  create(@Body() createAdminDto: CreateAdminDto): Promise<AdminEntity> {
    return this.adminService.create(createAdminDto);
  }

  @ApiOperation({
    summary: 'Actualizar administrador',
    description:
      'Actualiza los datos del administrador mediante su identificador y los valores enviados en el cuerpo de la solicitud.',
  })
  @ApiParam({ name: 'id', description: 'Identificador del administrador sobre el que se realiza la operación.', type: 'string' })
  @ApiBody({ type: AdminEntity })
  @ApiResponse({ status: 200, description: 'Registro actualizado correctamente.', type: AdminEntity })
  @Put(':id')
  update(@Param('id') id: string, @Body() admin: Partial<AdminEntity>): Promise<AdminEntity> {
    return this.adminService.update(id, admin);
  }

  @ApiOperation({
    summary: 'Eliminar administrador',
    description:
      'Elimina el registro del administrador mediante el identificador indicado en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador del administrador sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 204, description: 'Registro eliminado correctamente.' })
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.adminService.remove(id);
  }
}
