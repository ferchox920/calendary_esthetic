import { IsEmail, IsNotEmpty, IsString, IsArray } from 'class-validator';
import { Roles } from 'src/utility/commons/roles-enum';

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  DNI: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  key: string;
}
