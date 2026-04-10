import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  getPing() {
    return this.appService.getPing();
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
