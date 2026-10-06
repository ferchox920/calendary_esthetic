import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ClientsProjectsService } from './clients-projects.service';
import {
  CreateClientDto,
  CreateProjectDto,
  PageDto,
  UpdateClientDto,
  UpdateProjectDto,
  VersionDto,
} from './agenda.dto';

export type OwnerRequest = Request & { user: { id: string } };

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsProjectsService) {}

  @ApiOperation({
    summary: 'Listar clientes',
    description:
      'Devuelve clientes paginados. Permite buscar por nombre, teléfono o correo y consultar clientes activos o archivados mediante archived; por defecto devuelve activos.',
  })
  @Get() list(@Query() query: PageDto) {
    return this.service.clients(query);
  }
  @ApiOperation({
    summary: 'Consultar un cliente',
    description:
      'Devuelve los datos del cliente identificado por su UUID, incluida su versión actual.',
  })
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.client(id);
  }
  @ApiOperation({
    summary: 'Listar proyectos de un cliente',
    description:
      'Devuelve los proyectos del cliente indicado, con paginación y filtro de archivado. Por defecto devuelve proyectos activos.',
  })
  @Get(':id/projects') projects(@Param('id', ParseUUIDPipe) id: string, @Query() query: PageDto) {
    return this.service.projects(id, query);
  }
  @ApiOperation({
    summary: 'Registrar un cliente',
    description:
      'Crea un cliente con nombre y al menos un medio de contacto: teléfono o correo electrónico.',
  })
  @Post() create(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: CreateClientDto) {
    return this.service.createClient(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Actualizar un cliente',
    description:
      'Modifica los campos enviados y conserva los demás. Requiere la versión actual del cliente y al menos un medio de contacto.',
  })
  @Patch(':id') update(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto
  ) {
    return this.service.updateClient(req.user.id, key, id, dto);
  }
  @ApiOperation({
    summary: 'Archivar un cliente',
    description:
      'Archiva el cliente y conserva su historial. Requiere su versión actual y rechaza la operación si tiene sesiones pendientes o confirmadas que aún no finalizaron.',
  })
  @Post(':id/archive') archive(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto
  ) {
    return this.service.archive(req.user.id, key, 'client', id, dto);
  }
}

@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Obligatorio para las operaciones de escritura. Usa una clave nueva por operación y reutilízala únicamente al reintentar la misma solicitud con el mismo cuerpo; no se requiere para consultas GET.',
})
@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ClientsProjectsService) {}

  @ApiOperation({
    summary: 'Consultar un proyecto',
    description:
      'Devuelve los datos del proyecto identificado por su UUID junto con sus sesiones.',
  })
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.project(id);
  }
  @ApiOperation({
    summary: 'Crear un proyecto',
    description:
      'Registra un proyecto asociado a un cliente existente y activo, con título y descripción opcional.',
  })
  @Post() create(@Req() req: OwnerRequest, @Headers('idempotency-key') key: string, @Body() dto: CreateProjectDto) {
    return this.service.createProject(req.user.id, key, dto);
  }
  @ApiOperation({
    summary: 'Actualizar un proyecto',
    description:
      'Modifica el título o la descripción del proyecto. Requiere la versión actual del registro.',
  })
  @Patch(':id') update(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.service.updateProject(req.user.id, key, id, dto);
  }
  @ApiOperation({
    summary: 'Archivar un proyecto',
    description:
      'Archiva el proyecto y conserva su historial. Requiere su versión actual y rechaza la operación si tiene sesiones pendientes o confirmadas que aún no finalizaron.',
  })
  @Post(':id/archive') archive(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto
  ) {
    return this.service.archive(req.user.id, key, 'project', id, dto);
  }
}
