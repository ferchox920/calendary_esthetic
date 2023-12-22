import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateProfessionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description: string;
}
