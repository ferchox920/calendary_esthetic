import { IsNotEmpty, IsString, IsOptional, MaxLength, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateActivityDto {
  @ApiProperty({
    description: 'Name of the activity',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(255, { message: 'Name must not exceed 255 characters' })
  name: string;

  @ApiProperty({
    description: 'Description of the activity',
    maxLength: 300,
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(300, { message: 'Description must not exceed 300 characters' })
  description?: string;

  @ApiProperty({
    description: 'Price of the activity',
    type: Number,
    minimum: 0,
    exclusiveMinimum: true,
  })
  @IsNotEmpty({ message: 'Price cannot be empty' })
  @IsNumber({}, { message: 'Price must be a number' })
  @IsPositive({ message: 'Price must be a positive number' })
  price: number;
}
