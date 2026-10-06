import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OwnerLoginDto {
  @ApiProperty({ example: 'gabriela@example.test' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
