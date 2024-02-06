import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProfessionDto {
  @ApiProperty({ description: 'Name of the profession', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Description of the profession', maxLength: 300, required: false })
  @IsString()
  @MaxLength(300)
  description?: string;
}