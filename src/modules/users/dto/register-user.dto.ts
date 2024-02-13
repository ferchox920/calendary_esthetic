import { IsNotEmpty, IsString, IsEmail, MinLength, Length, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
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

  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50,
  })
  @IsNotEmpty({ message: 'Name can not be null' })
  @IsString({ message: 'Name must be a string' })
  @Length(2, 50, { message: 'Name must be between 2 and 50 characters long' })
  name: string;

  @ApiProperty({
    description: 'User phone number',
    example: '1234567890',
  })
  @IsNotEmpty({ message: 'Number can not be null' })
  @IsString({ message: 'Number must be a string' })
  number: string;

  @ApiProperty({
    description: 'User address line 1',
    example: '123 Main Street',
  })
  @IsNotEmpty({ message: 'Address 1 can not be null' })
  @IsString({ message: 'Address 1 must be a string' })
  addr1: string;

  @ApiProperty({
    description: 'User address line 2',
    example: 'Apt 4B',
  })
  @IsNotEmpty({ message: 'Address 2 can not be null' })
  @IsString({ message: 'Address 2 must be a string' })
  addr2: string;

  @ApiProperty({
    description: 'User city',
    example: 'New York',
  })
  @IsNotEmpty({ message: 'City can not be null' })
  @IsString({ message: 'City must be a string' })
  city: string;

  @ApiProperty({
    description: 'User state',
    example: 'NY',
  })
  @IsNotEmpty({ message: 'State can not be null' })
  @IsString({ message: 'State must be a string' })
  state: string;

  @ApiProperty({
    description: 'User country',
    example: 'USA',
  })
  @IsNotEmpty({ message: 'Country can not be null' })
  @IsString({ message: 'Country must be a string' })
  country: string;

  @ApiProperty({
    description: 'User ZIP code',
    example: 12345,
    type: Number,
  })
  @IsNotEmpty({ message: 'ZIP can not be null' })
  @IsNumber({}, { message: 'ZIP must be a number' })
  zip: number;
}
