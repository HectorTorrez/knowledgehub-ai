import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@knowledgehub/shared-types';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'knowledgehub-api',
      timestamp: new Date().toISOString(),
    };
  }
}
