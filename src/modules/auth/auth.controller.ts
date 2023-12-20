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
// import { SignatureGuard } from 'src/utility/middleware/interceptors/signature.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async getProfile(@Req() req: Request & { user: JwtPayload }) {
    try {
      const result = await this.authService.getProfile(req.user.id);
      return result;
    } catch (ex: any) {
      throw new HttpException(ex.message, HttpStatus.BAD_REQUEST);
    }
  }

  // @UseGuards(JwtAuthGuard, SignatureGuard)
  // @UseInterceptors(ClassSerializerInterceptor)
  // @Get('refreshToken')
  // async refreshToken(
  //   @Req()
  //   req: Request & {
  //     user: JwtPayload;
  //   }
  // ) {
  //   try {
  //     const user = await this.authService.refreshToken(req.user.id);
  //     return user;
  //   } catch (ex: any) {
  //     throw new HttpException(ex.message, HttpStatus.BAD_REQUEST);
  //   }
  // }
}
