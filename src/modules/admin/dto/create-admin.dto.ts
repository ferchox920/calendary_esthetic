import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({ description: 'Name of the admin', example: 'John Doe' })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  name: string;

  @ApiProperty({ description: 'DNI of the admin', example: '12345678A' })
  @IsString({ message: 'DNI must be a string' })
  @IsNotEmpty({ message: 'DNI cannot be empty' })
  DNI: string;

  @ApiProperty({ description: 'Email of the admin', example: 'admin@example.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;

  @ApiProperty({ description: 'Password of the admin', example: 'password123' })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password cannot be empty' })
  password: string;

  @ApiProperty({ description: 'Key of the admin', example: 'adminkey' })
  @IsString({ message: 'Key must be a string' })
  @IsNotEmpty({ message: 'Key cannot be empty' })
  key: string;
}
