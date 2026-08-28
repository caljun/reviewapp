import { z } from 'zod';

export const reviewInputSchema = z.object({
  appName: z.string().max(100).optional(),
  focus: z.string().max(500).optional(),
  reviews: z.array(z.object({
    id: z.number().int().nonnegative().optional(),
    text: z.string().min(1).max(2000).refine(text => text.trim().length > 0),
    rating: z.number().int().min(1).max(5).optional(),
  })).min(1).max(50),
}).refine(input => input.reviews.reduce((sum, review) => sum + review.text.length, 0) <= 50000);

export const analyzeInputSchema = reviewInputSchema.and(z.object({ requestId: z.uuid() }));
export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;
export type Usage = { freeAnalysisUsed: boolean; remainingCredits: number };
