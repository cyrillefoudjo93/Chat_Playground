import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import * as session from 'express-session';

async function bootstrap() {
  // Create NestJS application
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Set global prefix
  app.setGlobalPrefix('/api');
  
  // Enable CORS
  app.enableCors({
    // Use true to reflect request origin or specify explicit origins
    origin: configService.get('ALLOWED_ORIGINS', '*') === '*' ? true : configService.get('ALLOWED_ORIGINS').split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  });
  
  // Use security middlewares
  app.use(helmet());
  app.use(cookieParser());
  app.use(compression());
  
  // Configure session for OAuth2
  app.use(session({
    secret: configService.get('SESSION_SECRET', 'your-session-secret-change-in-production'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: configService.get('NODE_ENV') === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
  
  // Configure global validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  
  // Get port from config or use default
  const port = configService.get<number>('PORT', 3000);
  
  // Start the server
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap().catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
