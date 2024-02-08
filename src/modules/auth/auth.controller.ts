import {
  Controller,
  ClassSerializerInterceptor,
  Get,
  Post,
  HttpException,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from 'src/modules/auth/guards/local-auth.guard';
import { JwtPayload } from './interface/jwt-payload.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { LoginDto } from '../users/dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',

  })
  @UseGuards(LocalAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @Post('login')
  async login(@Req() req: Request & { user: JwtPayload }) {
    try {
      const result = await this.authService.login(req.user);
      return result;
    } catch (ex: any) {
      throw new HttpException(ex.message, HttpStatus.BAD_REQUEST);
    }
  }

  @ApiOperation({ summary: 'Get user profile' })
  @ApiBearerAuth() // Secure the endpoint with JWT authorization
  @ApiResponse({
    status: 200,
    description: 'Return user profile',

  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @Get('profile')
  async getProfile(@Req() req: Request & { user: JwtPayload }) {
    try {
      const result = await this.authService.getProfile(req.user.id);
      return result;
    } catch (ex: any) {
      throw new HttpException(ex.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Uncomment this section if you want to document the refreshToken endpoint
  /*
  @ApiOperation({ summary: 'Refresh user token' })
  @ApiBearerAuth() // Secure the endpoint with JWT authorization
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: JwtPayload,
  })
  @UseGuards(JwtAuthGuard, SignatureGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @Get('refreshToken')
  async refreshToken(
    @Req()
    req: Request & {
      user: JwtPayload;
    }
  ) {
    try {
      const user = await this.authService.refreshToken(req.user.id);
      return user;
    } catch (ex: any) {
      throw new HttpException(ex.message, HttpStatus.BAD_REQUEST);
    }
  }
  */
}
