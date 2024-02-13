// add-professions.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AddProfessionsDto {
  @ApiProperty({ example: ['id1', 'id2'], description: 'Array of profession IDs' })
  @IsArray()
  @IsNotEmpty({ message: 'Profession IDs cannot be empty' })
  @IsString({ each: true, message: 'Each element in professionIds must be a string' })
  readonly professionIds: string[];
}
