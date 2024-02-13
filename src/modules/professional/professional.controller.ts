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

  @ApiOperation({ summary: 'Register a new professional' })
  @ApiBody({ type: CreateProfessionalDto })
  @ApiResponse({ status: 201, description: 'Professional registered successfully' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Post('register')
  async create(@Body() createProfessionalDto: CreateProfessionalDto) {
    return await this.professionalService.create(createProfessionalDto);
  }

  @ApiOperation({ summary: 'Get all professionals' })
  @ApiResponse({ status: 200, description: 'Return all professionals', isArray: true })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get()
  async findAll() {
    return await this.professionalService.findAll();
  }

  @ApiOperation({ summary: 'Add professions to a professional' })
  @ApiParam({ name: 'id', description: 'Professional ID', type: 'string' })
  @ApiBody({ type: AddProfessionsDto })
  @ApiResponse({ status: 200, description: 'Professions added successfully' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Post(':id/professions')
  async addProfessionsToProfessional(
    @Param('id') id: string,
    @Body() addProfessionsDto: AddProfessionsDto
  ): Promise<any> {
    const { professionIds } = addProfessionsDto;
    return this.professionalService.addProfessionsToProfessional(id, professionIds);
  }
  

  @ApiOperation({ summary: 'Get a professional by ID' })
  @ApiResponse({ status: 200, description: 'Return a professional by ID', type: CreateProfessionalDto })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.professionalService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a professional by ID' })
  @ApiBody({ type: UpdateProfessionalDto })
  @ApiResponse({ status: 200, description: 'Professional updated successfully', type: CreateProfessionalDto })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProfessionalDto: UpdateProfessionalDto) {
    return await this.professionalService.update(id, updateProfessionalDto);
  }

  @ApiOperation({ summary: 'Delete a professional by ID' })
  @ApiResponse({ status: 204, description: 'Professional deleted successfully' })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.professionalService.remove(id);
  }
}
