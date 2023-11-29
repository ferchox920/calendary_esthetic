import { IsNotEmpty, IsString, IsEmail, MinLength, Length } from 'class-validator';

export class UserSignIn {
  @IsNotEmpty({ message: 'Email can not be null' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsNotEmpty({ message: 'Password can not be null' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsString()
  @Length(2, 100)
  name: string;
}
