import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProfessionService } from './profession.service';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';

@Controller('profession')
export class ProfessionController {
  constructor(private readonly professionService: ProfessionService) {}

  @Post()
  create(@Body() createProfessionDto: CreateProfessionDto) {
    return this.professionService.createProfession(createProfessionDto);
  }

  @Get()
  findAll() {
    return this.professionService.getAllProfessions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.professionService.getProfessionById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProfessionDto: CreateProfessionDto) {
    return this.professionService.updateProfession(id, updateProfessionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.professionService.deleteProfession(id);
  }
}
