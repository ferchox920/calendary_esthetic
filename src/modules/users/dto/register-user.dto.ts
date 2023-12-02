import { IsNotEmpty, IsString, IsEmail, MinLength, Length, IsNumber } from 'class-validator';

export class RegisterUserDto {
  @IsNotEmpty({ message: 'Email can not be null' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsNotEmpty({ message: 'Password can not be null' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsNotEmpty({ message: 'Name can not be null' })
  @IsString({ message: 'Name must be a string' })
  @Length(2, 50, { message: 'Name must be between 2 and 50 characters long' })
  name: string;

  @IsNotEmpty({ message: 'Number can not be null' })
  @IsString({ message: 'Number must be a string' })
  number: string;

  @IsNotEmpty({ message: 'Address 1 can not be null' })
  @IsString({ message: 'Address 1 must be a string' })
  addr1: string;

  @IsNotEmpty({ message: 'Address 2 can not be null' })
  @IsString({ message: 'Address 2 must be a string' })
  addr2: string;

  @IsNotEmpty({ message: 'City can not be null' })
  @IsString({ message: 'City must be a string' })
  city: string;

  @IsNotEmpty({ message: 'State can not be null' })
  @IsString({ message: 'State must be a string' })
  state: string;

  @IsNotEmpty({ message: 'Country can not be null' })
  @IsString({ message: 'Country must be a string' })
  country: string;

  @IsNotEmpty({ message: 'ZIP can not be null' })
  @IsNumber({}, { message: 'ZIP must be a number' })
  zip: number;
}
