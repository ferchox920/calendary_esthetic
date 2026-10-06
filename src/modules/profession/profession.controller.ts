import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProfessionService } from './profession.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Profession')
@Controller('profession')
export class ProfessionController {
  constructor(private readonly professionService: ProfessionService) {}

  @ApiOperation({
    summary: 'Registrar profesión',
    description:
      'Registra la profesión con los datos enviados en el cuerpo de la solicitud.',
  })
  @ApiBody({ type: CreateProfessionDto })
  @ApiResponse({ status: 201, description: 'Registro creado correctamente.' })
  @Post()
  create(@Body() createProfessionDto: CreateProfessionDto) {
    return this.professionService.createProfession(createProfessionDto);
  }

  @ApiOperation({
    summary: 'Listar profesiones',
    description:
      'Devuelve la lista de las profesiones.',
  })
  @ApiResponse({ status: 200, description: 'Listado de las profesiones.', type: CreateProfessionDto, isArray: true })
  @Get()
  findAll() {
    return this.professionService.getAllProfessions();
  }

  @ApiOperation({
    summary: 'Consultar profesión por ID',
    description:
      'Devuelve los datos de la profesión cuyo identificador se indica en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la profesión sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 200, description: 'Datos del registro solicitado.', type: CreateProfessionDto })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.professionService.getProfessionById(id);
  }

  @ApiOperation({
    summary: 'Actualizar profesión',
    description:
      'Actualiza los datos de la profesión mediante su identificador y los valores enviados en el cuerpo de la solicitud.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la profesión sobre el que se realiza la operación.', type: 'string' })
  @ApiBody({ type: UpdateProfessionDto })
  @ApiResponse({ status: 200, description: 'Registro actualizado correctamente.', type: CreateProfessionDto })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProfessionDto: UpdateProfessionDto) {
    return this.professionService.updateProfession(id, updateProfessionDto);
  }


  @ApiOperation({
    summary: 'Eliminar profesión',
    description:
      'Elimina el registro de la profesión mediante el identificador indicado en la ruta.',
  })
  @ApiParam({ name: 'id', description: 'Identificador de la profesión sobre el que se realiza la operación.', type: 'string' })
  @ApiResponse({ status: 204, description: 'Registro eliminado correctamente.' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.professionService.deleteProfession(id);
  }
}

