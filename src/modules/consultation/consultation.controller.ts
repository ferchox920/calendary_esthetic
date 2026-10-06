import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, GoneException } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Consultation')
@Controller('consultation')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @ApiOperation({
    summary: 'Registrar consulta heredada (retirado)',
    description:
      'Operación retirada: responde con HTTP 410. Las consultas heredadas se conservan para lectura; utiliza /sessions para gestionar las reservas actuales.',
    deprecated: true,
  })
  @ApiBody({ type: CreateConsultationDto })
  @ApiResponse({ status: 410, description: 'Operación retirada. Utiliza /sessions; las consultas heredadas son de solo lectura.' })
  @Post()
  create(@Body() createConsultationDto: CreateConsultationDto) {
    throw new GoneException('Usa /sessions: las consultas heredadas se conservan sólo para lectura');
  }

  @ApiOperation({
    summary: 'Listar consultas heredadas',
    description:
      'Devuelve la lista de las consultas heredadas.',
  })
  @ApiResponse({ status: 200, description: 'Listado de las consultas heredadas.' })
  @Get()
  findAll() {
    return this.consultationService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar consulta heredada por ID',
    description:
      'Devuelve los datos de la consulta heredada cuyo identificador se indica en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la consulta heredada sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 200, description: 'Datos de la consulta heredada.', type: CreateConsultationDto })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultationService.findOne(id);
  }

  @ApiOperation({
    summary: 'Actualizar consulta heredada (retirado)',
    description:
      'Operación retirada: responde con HTTP 410. Las consultas heredadas se conservan para lectura; utiliza /sessions para gestionar las reservas actuales.',
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: 'Identificador de la consulta heredada sobre el que se realiza la operación.', type: 'string' })
  @ApiBody({ type: UpdateConsultationDto })
  @ApiResponse({ status: 410, description: 'Operación retirada. Utiliza /sessions; las consultas heredadas son de solo lectura.' })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateConsultationDto: UpdateConsultationDto) {
    throw new GoneException('Usa los comandos de /sessions: las consultas heredadas se conservan sólo para lectura');
  }

  @ApiOperation({
    summary: 'Eliminar consulta heredada (retirado)',
    description:
      'Operación retirada: responde con HTTP 410. Las consultas heredadas se conservan para lectura; utiliza /sessions para gestionar las reservas actuales.',
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: 'Identificador de la consulta heredada sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 410, description: 'Operación retirada. Utiliza /sessions; las consultas heredadas son de solo lectura.' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    throw new GoneException('Las consultas heredadas se conservan sólo para lectura');
  }
}
