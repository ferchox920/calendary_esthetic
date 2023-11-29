import { IsNotEmpty, IsString, IsEmail, MinLength } from 'class-validator';
import { UserSignIn } from './user-signin.dto';

export class UserSignUp extends UserSignIn {
  @IsNotEmpty({ message: 'Name can not be null' })
  @IsString({ message: 'Name must be a string' })
  name: string;


}
