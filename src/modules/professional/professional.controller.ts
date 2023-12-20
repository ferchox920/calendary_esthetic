import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProfessionalService } from './professional.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Roles } from 'src/utility/common/roles-enum';
import { AuthorizeGuard } from '../auth/guards/authorization.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('professional')
export class ProfessionalController {
  constructor(private readonly professionalService: ProfessionalService) {}

  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Post('register')
  async create(@Body() createProfessionalDto: CreateProfessionalDto) {
    return await this.professionalService.create(createProfessionalDto);
  }

  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get()
  async findAll() {
    return await this.professionalService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.professionalService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProfessionalDto: UpdateProfessionalDto) {
    return await this.professionalService.update(id, updateProfessionalDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.professionalService.remove(id);
  }
}
