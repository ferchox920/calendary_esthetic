import { IsNotEmpty, IsString, IsEmail, MinLength, Length, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginProfessionalDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
    format: 'email',
  })
  @IsNotEmpty({ message: 'Email can not be null' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'Password can not be null' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({ description: 'Key of the admin', example: 'adminkey' })
  @IsString({ message: 'Key must be a string' })
  @IsNotEmpty({ message: 'Key cannot be empty' })
  type: string;
}
