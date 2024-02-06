import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProfessionService } from './profession.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Profession')
@Controller('profession')
export class ProfessionController {
  constructor(private readonly professionService: ProfessionService) {}

  @ApiOperation({ summary: 'Create a new profession' })
  @ApiBody({ type: CreateProfessionDto })
  @ApiResponse({ status: 201, description: 'Profession created successfully' })
  @Post()
  create(@Body() createProfessionDto: CreateProfessionDto) {
    return this.professionService.createProfession(createProfessionDto);
  }

  @ApiOperation({ summary: 'Get all professions' })
  @ApiResponse({ status: 200, description: 'Return all professions', type: CreateProfessionDto, isArray: true })
  @Get()
  findAll() {
    return this.professionService.getAllProfessions();
  }

  @ApiOperation({ summary: 'Get a profession by ID' })
  @ApiParam({ name: 'id', description: 'Profession ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return a profession by ID', type: CreateProfessionDto })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.professionService.getProfessionById(id);
  }

  @ApiOperation({ summary: 'Update a profession by ID' })
  @ApiParam({ name: 'id', description: 'Profession ID', type: 'string' })
  @ApiBody({ type: UpdateProfessionDto })
  @ApiResponse({ status: 200, description: 'Profession updated successfully', type: CreateProfessionDto })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProfessionDto: UpdateProfessionDto) {
    return this.professionService.updateProfession(id, updateProfessionDto);
  }


  @ApiOperation({ summary: 'Delete a profession by ID' })
  @ApiParam({ name: 'id', description: 'Profession ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Profession deleted successfully' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.professionService.deleteProfession(id);
  }
}

