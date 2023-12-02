import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

import { UserEntity } from './entities/users.entity';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from 'src/utility/decorators/current-user.decorator';
import { AuthenticationGuard } from 'src/utility/guards/authentification.guard';
import { Roles } from 'src/utility/commons/roles-enum';
import { AuthorizeGuard } from 'src/utility/guards/authorization.guard';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/register')
  async signUp(
    @Body() registerUserDto: RegisterUserDto,
  ): Promise<{
    user: Partial<UserEntity>;
    credential: Record<string, string>;
  }> {
    const result = await this.usersService.register(registerUserDto);
    return result;
  }

  @Post('/login')
  async logiu(@Body() loginDto: LoginDto): Promise<{ accessToken: any; user: UserEntity }> {
    const user = await this.usersService.login(loginDto);
    const accessToken = await this.usersService.accessToken(user); 
    return { accessToken, user };
  }

    //TODO: Tipear
  @Get('generate-otp/:email')
  async generateOTP(@Param('email') email: string): Promise<any> {
   const otp = await this.usersService.generateOTP(email.toLowerCase().trim());
     return otp
  }

  //TODO: Tipear
  @Get('validate-otp/:email/:otp')
  async validateOTP(
    @Param('email') email: string,
    @Param('otp') otp: string,
  ): Promise<any> {
    const result = await this.usersService.verifyEmail(
      otp,
      email.toLowerCase().trim(),
    );
    return result;
  }

  @UseGuards(AuthenticationGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get('/all')
  async findAll(): Promise<UserEntity[]> {
    return await this.usersService.findAll();
  }

  @Get('single/:id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOneById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }

  @UseGuards(AuthenticationGuard)
  @Get('me')
  getProfile(@CurrentUser() currentUser: UserEntity) {
    return currentUser;
  }
}
