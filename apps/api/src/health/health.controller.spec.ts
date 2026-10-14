import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports an ok status', () => {
    const response = controller.check();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('knowledgehub-api');
    expect(typeof response.timestamp).toBe('string');
  });
});
