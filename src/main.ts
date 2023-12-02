import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Establecer el prefijo global
  app.setGlobalPrefix('api/v1');

  // Configurar tubería de validación global
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  // Iniciar la aplicación y escuchar en el puerto especificado
  await app.listen(process.env.PORT);

  // Mostrar un mensaje en la consola cuando la aplicación se inicia correctamente
  Logger.log(`App listening on port ${process.env.PORT}`);
}

bootstrap();

