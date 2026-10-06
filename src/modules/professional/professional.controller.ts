import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProfessionalService } from './professional.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Roles } from 'src/utility/common/roles-enum';
import { AuthorizeGuard } from '../auth/guards/authorization.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { AddProfessionsDto } from './dto/add-Professions.dto';

@ApiTags('Professional')
@ApiBearerAuth()
@Controller('professional')
export class ProfessionalController {
  constructor(private readonly professionalService: ProfessionalService) {}

  @ApiOperation({
    summary: 'Registrar profesional',
    description:
      'Registra el profesional con los datos enviados en el cuerpo de la solicitud. Requiere permisos de administrador.',
  })
  @ApiBody({ type: CreateProfessionalDto })
  @ApiResponse({ status: 201, description: 'Registro creado correctamente.' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Post('register')
  async create(@Body() createProfessionalDto: CreateProfessionalDto) {
    return await this.professionalService.create(createProfessionalDto);
  }

  @ApiOperation({
    summary: 'Listar profesionales',
    description:
      'Devuelve la lista de los profesionales. Requiere permisos de administrador.',
  })
  @ApiResponse({ status: 200, description: 'Listado de los profesionales.', isArray: true })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get()
  async findAll() {
    return await this.professionalService.findAll();
  }

  @ApiOperation({
    summary: 'Asociar profesiones a un profesional',
    description:
      'Agrega al profesional las profesiones indicadas por sus identificadores. Requiere permisos de administrador.',
  })
  @ApiParam({ name: 'id', description: 'Identificador del profesional sobre el que se realiza la operación.', type: 'string' })
  @ApiBody({ type: AddProfessionsDto })
  @ApiResponse({ status: 200, description: 'Profesiones asociadas correctamente.' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Post(':id/professions')
  async addProfessionsToProfessional(
    @Param('id') id: string,
    @Body() addProfessionsDto: AddProfessionsDto
  ): Promise<any> {
    const { professionIds } = addProfessionsDto;
    return this.professionalService.addProfessionsToProfessional(id, professionIds);
  }
  

  @ApiOperation({
    summary: 'Consultar profesional por ID',
    description:
      'Devuelve los datos del profesional cuyo identificador se indica en la ruta. Requiere permisos de administrador.',
  })
  @ApiResponse({ status: 200, description: 'Datos del registro solicitado.', type: CreateProfessionalDto })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.professionalService.findOne(id);
  }

  @ApiOperation({
    summary: 'Actualizar profesional',
    description:
      'Actualiza los datos del profesional mediante su identificador y los valores enviados en el cuerpo de la solicitud. Requiere permisos de administrador.',
  })
  @ApiBody({ type: UpdateProfessionalDto })
  @ApiResponse({ status: 200, description: 'Registro actualizado correctamente.', type: CreateProfessionalDto })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProfessionalDto: UpdateProfessionalDto) {
    return await this.professionalService.update(id, updateProfessionalDto);
  }

  @ApiOperation({
    summary: 'Eliminar profesional',
    description:
      'Elimina el registro del profesional mediante el identificador indicado en la ruta. Requiere permisos de administrador.',
  })
  @ApiResponse({ status: 204, description: 'Registro eliminado correctamente.' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.professionalService.remove(id);
  }
}
