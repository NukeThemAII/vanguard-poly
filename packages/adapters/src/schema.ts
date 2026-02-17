import { z } from 'zod';

export const llmAnalysisSchema = z.object({
  sentiment: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  fairProbability: z.number().min(0).max(1),
  rationale: z.string().min(1).max(500),
});

export type LLMAnalysisSchema = z.infer<typeof llmAnalysisSchema>;
