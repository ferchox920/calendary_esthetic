import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/users.entity';
import { Roles } from 'src/utility/common/roles-enum';
import { AuthorizeGuard } from 'src/modules/auth/guards/authorization.guard';
import { RegisterUserDto } from './dto/register-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/register')
  async signUp(@Body() registerUserDto: RegisterUserDto): Promise<{
    user: Partial<UserEntity>;
    credential: Record<string, string>;
  }> {
    const result = await this.usersService.register(registerUserDto);
    return result;
  }

  //TODO: Tipear
  @Get('generate-otp/:email')
  async generateOTP(@Param('email') email: string): Promise<any> {
    const otp = await this.usersService.generateOTP(email.toLowerCase().trim());
    return otp;
  }

  //TODO: Tipear
  @Get('validate-otp/:email/:otp')
  async validateOTP(@Param('email') email: string, @Param('otp') otp: string): Promise<any> {
    const result = await this.usersService.verifyEmail(otp, email.toLowerCase().trim());
    return result;
  }

  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get('/all')
  async findAll(): Promise<UserEntity[]> {
    return await this.usersService.findAll();
  }

  @Get('single/:id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOneById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.usersService.remove(id);
  }
}
