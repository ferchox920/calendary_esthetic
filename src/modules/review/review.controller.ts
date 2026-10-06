import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@ApiTags('Review')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @ApiOperation({
    summary: 'Crear una reseña (pendiente de implementación)',
    description:
      'Endpoint provisional: actualmente devuelve un mensaje de demostración y no consulta ni modifica reseñas persistidas.',
  })
  @Post()
  create(@Body() createReviewDto: CreateReviewDto) {
    return this.reviewService.create(createReviewDto);
  }

  @ApiOperation({
    summary: 'Listar reseñas (pendiente de implementación)',
    description:
      'Endpoint provisional: actualmente devuelve un mensaje de demostración y no consulta ni modifica reseñas persistidas.',
  })
  @Get()
  findAll() {
    return this.reviewService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar una reseña (pendiente de implementación)',
    description:
      'Endpoint provisional: actualmente devuelve un mensaje de demostración y no consulta ni modifica reseñas persistidas.',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewService.findOne(+id);
  }

  @ApiOperation({
    summary: 'Actualizar una reseña (pendiente de implementación)',
    description:
      'Endpoint provisional: actualmente devuelve un mensaje de demostración y no consulta ni modifica reseñas persistidas.',
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReviewDto: UpdateReviewDto) {
    return this.reviewService.update(+id, updateReviewDto);
  }

  @ApiOperation({
    summary: 'Eliminar una reseña (pendiente de implementación)',
    description:
      'Endpoint provisional: actualmente devuelve un mensaje de demostración y no consulta ni modifica reseñas persistidas.',
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reviewService.remove(+id);
  }
}
