import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * Never let a browser cache an API response.
   *
   * These carry who is signed in and what that profile may see, so a cached copy
   * is wrong the moment either changes. It is not academic: Safari revalidated
   * `/api/auth/session` after a successful login, the body was byte-identical to
   * the pre-login one, and the 304 told the app nobody had signed in — so it
   * returned to the profile picker and the viewer could never get past it.
   *
   * Stream payloads set their own headers further down and are unaffected.
   */
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Allow access from any device on the LAN (home computers, TV browsers).
  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
