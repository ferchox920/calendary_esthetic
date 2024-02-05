import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  const options = new DocumentBuilder()
    .setTitle('esthetic - Back End')
    .setDescription('esthetic - Back End')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);

  app.use(
    bodyParser.json({
      limit: '50mb',
    })
  );

  app.use(
    bodyParser.urlencoded({
      limit: '50mb',
      extended: true,
    })
  );
  //Compress response
  app.use(compression());

  //Activate CORS
  app.enableCors();

  app.use(morgan('dev'));
  app.use(cookieParser());

  // Configurar tubería de validación global
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  // Iniciar la aplicación y escuchar en el puerto especificado
  await app.listen(process.env.PORT, async () => {
    Logger.log(`App listening on port ${process.env.PORT}`, await app.getUrl());
  });
}

bootstrap();

