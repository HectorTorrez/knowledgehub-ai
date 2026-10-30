import type { CalculationPlan } from '../aggregation/calculation.js';
import type { ConversationTurn } from './answer-prompt.js';

export const CALCULATION_PLANNER = Symbol('CALCULATION_PLANNER');

export interface FieldCatalogEntry {
  field: string;
  fieldLabels: string[];
  currencies: string[];
  units: string[];
  count: number;
}

export type PlannedCalculation =
  | { kind: 'none' }
  | {
      kind: 'calculation';
      plan: Omit<CalculationPlan, 'documentId'>;
      language: 'es' | 'en';
    };

export interface CalculationPlanner {
  plan(input: {
    question: string;
    history: ConversationTurn[];
    fields: FieldCatalogEntry[];
  }): Promise<PlannedCalculation>;
}
