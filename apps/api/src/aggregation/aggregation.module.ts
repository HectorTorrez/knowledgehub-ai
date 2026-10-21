import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FactsModule } from '../facts/facts.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AggregationController } from './aggregation.controller.js';
import { AggregationService } from './aggregation.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, FactsModule],
  controllers: [AggregationController],
  providers: [AggregationService],
  exports: [AggregationService],
})
export class AggregationModule {}
