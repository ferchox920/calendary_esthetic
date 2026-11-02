import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { authConfig } from './modules/auth/auth-config';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  app.use(compression());
  // Public shell only; client data remains behind the authenticated API.
  app.useStaticAssets(join(process.cwd(), 'frontend', 'dist'));
  // Development docs only; no public Swagger endpoints in production.
  if (!authConfig().production) {
    const options = new DocumentBuilder().setTitle('Agenda de Gabriela').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, options));
  }
  // Request bodies, credentials, tokens and query parameters are never logged.
  await app.listen(process.env.PORT, process.env.HOST || '0.0.0.0');
  Logger.log(`App listening at ${await app.getUrl()}`);
}

bootstrap();
