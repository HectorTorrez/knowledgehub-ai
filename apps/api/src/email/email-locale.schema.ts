import { z } from 'zod';

export const emailLocaleSchema = z.enum(['en', 'es']).default('en');
