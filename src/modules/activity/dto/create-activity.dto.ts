import { IsNotEmpty, IsString, IsOptional, MaxLength, IsNumber, IsPositive } from 'class-validator';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  price: number;
}
