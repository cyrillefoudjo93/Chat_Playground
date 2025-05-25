import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public() // Allow public access to this endpoint
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public() // Allow public access to this endpoint
  getHealth(): { status: string; timestamp: string; version: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
    };
  }
}
