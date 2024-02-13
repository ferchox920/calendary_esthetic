import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/users.entity';
import { Roles } from 'src/utility/common/roles-enum';
import { AuthorizeGuard } from 'src/modules/auth/guards/authorization.guard';
import { RegisterUserDto } from './dto/register-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Users') // Define Swagger tags for this controller
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterUserDto })
  @ApiResponse({
    status: 200,
    description: 'User registration successful',
  })
  @Post('/register')
  async signUp(@Body() registerUserDto: RegisterUserDto): Promise<{
    user: Partial<UserEntity>;
    credential: Record<string, string>;
  }> {
    const result = await this.usersService.register(registerUserDto);
    return result;
  }

  @ApiOperation({ summary: 'Generate OTP for email' })
  @ApiResponse({
    status: 200,
    description: 'OTP generated successfully',
  })
  @Get('generate-otp/:email')
  async generateOTP(@Param('email') email: string): Promise<any> {
    const otp = await this.usersService.generateOTP(email.toLowerCase().trim());
    return otp;
  }

  @ApiOperation({ summary: 'Validate OTP for email' })
  @ApiResponse({
    status: 200,
    description: 'Email verification successful',
  })
  @Get('validate-otp/:email/:otp')
  async validateOTP(@Param('email') email: string, @Param('otp') otp: string): Promise<any> {
    const result = await this.usersService.verifyEmail(otp, email.toLowerCase().trim());
    return result;
  }

  @ApiOperation({ summary: 'Get all users' })
  @ApiBearerAuth() // Secure the endpoint with JWT authorization
  @ApiResponse({
    status: 200,
    description: 'Return the list of all users',
    type: UserEntity,
    isArray: true,
  })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get('/all')
  async findAll(): Promise<UserEntity[]> {
    return await this.usersService.findAll();
  }

  @ApiOperation({ summary: 'Get a single user by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return the user with the specified ID',
    type: UserEntity,
  })
  @Get('single/:id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOneById(id);
  }

  @ApiOperation({ summary: 'Update a user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserEntity,
  })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.update(id, updateUserDto);
  }

  @ApiOperation({ summary: 'Delete a user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.usersService.remove(id);
  }
}
