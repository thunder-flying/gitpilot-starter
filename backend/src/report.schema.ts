import { z } from 'zod';

export const ReportSchema = z.object({
  summary: z.string().describe('Concise weekly development summary in Chinese'),
  limitations: z.array(z.string()).describe('Gaps, incomplete coverage, unverifiable claims'),
  items: z.array(z.object({
    title: z.string(),
    category: z.enum(['feature', 'bugfix', 'refactor', 'performance', 'other']),
    module: z.string(),
    technicalApproach: z.string(),
    contribution: z.string(),
    impact: z.string(),
    impactVerified: z.boolean(),
    commitShas: z.array(z.string()),
    resumeSentence: z.string(),
  })),
});

export type Report = z.infer<typeof ReportSchema>;
