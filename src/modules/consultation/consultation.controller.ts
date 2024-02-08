import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Consultation')
@Controller('consultation')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @ApiOperation({ summary: 'Create a new consultation' })
  @ApiBody({ type: CreateConsultationDto })
  @ApiResponse({ status: 201, description: 'Consultation created successfully', type: CreateConsultationDto })
  @Post()
  create(@Body() createConsultationDto: CreateConsultationDto) {
    return this.consultationService.create(createConsultationDto);
  }

  @ApiOperation({ summary: 'Get all consultations' })
  @ApiResponse({ status: 200, description: 'Return all consultations' })
  @Get()
  findAll() {
    return this.consultationService.findAll();
  }

  @ApiOperation({ summary: 'Get a specific consultation by ID' })
  @ApiParam({ name: 'id', description: 'Consultation ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return the specified consultation', type: CreateConsultationDto })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultationService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a consultation by ID' })
  @ApiParam({ name: 'id', description: 'Consultation ID', type: 'string' })
  @ApiBody({ type: UpdateConsultationDto })
  @ApiResponse({ status: 200, description: 'Consultation updated successfully', type: CreateConsultationDto })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateConsultationDto: UpdateConsultationDto) {
    return this.consultationService.update(id, updateConsultationDto);
  }

  @ApiOperation({ summary: 'Delete a consultation by ID' })
  @ApiParam({ name: 'id', description: 'Consultation ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Consultation deleted successfully' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultationService.remove(id);
  }
}
