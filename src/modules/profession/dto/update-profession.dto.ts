import { IntersectionType } from '@nestjs/mapped-types';
import { CreateProfessionDto } from './create-profession.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfessionDto extends IntersectionType(CreateProfessionDto) {
  @ApiProperty({ description: 'Name of the profession', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Description of the profession', maxLength: 300 })
  @IsString()
  @MaxLength(300)
  description: string;
}
