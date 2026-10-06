import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { authConfig } from './modules/auth/auth-config';

export function setupApp(app: NestExpressApplication) {
  const config = authConfig();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: config.origin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );
}
