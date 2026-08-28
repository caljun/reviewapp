import { z } from 'zod';

export const inputSchema = z.object({
  appName: z.string().max(200).optional(),
  focus: z.string().max(1000).optional(),
  reviews: z.array(z.object({
    id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    text: z.string().min(1).max(2000).refine(v => v.trim().length > 0),
    rating: z.number().int().min(1).max(5).optional(),
  }).strict()).min(1).max(50),
}).strict().superRefine((data, ctx) => {
  if (new Set(data.reviews.map(r => r.id)).size !== data.reviews.length)
    ctx.addIssue({ code: 'custom', message: 'レビューIDが重複しています' });
  if (data.reviews.reduce((n, r) => n + r.text.length, 0) > 50000)
    ctx.addIssue({ code: 'custom', message: 'レビュー本文の合計は50,000文字までです' });
});

const text = z.string().min(1).max(2000);
const indexes = z.array(z.number().int().nonnegative()).min(1).max(50);
export const outputSchema = z.object({
  overallInsight: text,
  sentimentByReview: z.array(z.object({
    reviewIndex: z.number().int().nonnegative(),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
  })).min(1).max(50),
  topPriority: z.object({ title: text, reason: text, recommendedAction: text, expectedEffect: text }),
  issues: z.array(z.object({
    title: text,
    category: z.enum(['bug', 'feature_request', 'usability', 'pricing', 'ads', 'performance', 'account', 'notification', 'design', 'other']),
    reviewIndexes: indexes,
    severity: z.enum(['high', 'medium', 'low']),
  })).max(100),
  positivePoints: z.array(z.object({ title: text, reviewIndexes: indexes })).max(50),
});

export type AnalysisInput = z.infer<typeof inputSchema>;
export type ModelAnalysis = z.infer<typeof outputSchema>;
export const categoryLabels: Record<ModelAnalysis['issues'][number]['category'], string> = {
  bug: '不具合', feature_request: '機能要望', usability: '操作性', pricing: '価格・課金', ads: '広告',
  performance: 'パフォーマンス', account: 'アカウント・ログイン', notification: '通知', design: 'デザイン', other: 'その他',
};

// Defense in depth: no invalid ID or duplicate ever contributes to a count.
export function validIndexes(values: number[], allowed: Set<number>) {
  return [...new Set(values.filter(id => Number.isSafeInteger(id) && allowed.has(id)))];
}

export function parseAnalysis(raw: string, input: AnalysisInput): ModelAnalysis {
  const value = outputSchema.parse(JSON.parse(raw));
  const allowed = new Set(input.reviews.map(r => r.id));
  const sentiments = value.sentimentByReview.map(s => s.reviewIndex);
  if (sentiments.some(id => !allowed.has(id)) || new Set(sentiments).size !== sentiments.length || sentiments.length !== allowed.size)
    throw new Error('sentimentByReview must contain every input id exactly once');
  for (const group of [...value.issues, ...value.positivePoints]) {
    const valid = validIndexes(group.reviewIndexes, allowed);
    if (!valid.length || group.reviewIndexes.some(id => !allowed.has(id)))
      throw new Error('reviewIndexes must only contain existing input ids');
    group.reviewIndexes = valid;
  }
  const strings = [value.overallInsight, ...Object.values(value.topPriority), ...value.issues.map(i => i.title), ...value.positivePoints.map(p => p.title)];
  if (strings.some(s => !s.trim())) throw new Error('Text and topPriority must not be blank');
  return value;
}

export function aggregateAnalysis(value: ModelAnalysis, input: AnalysisInput) {
  const allowed = new Set(input.reviews.map(r => r.id));
  const total = allowed.size;
  const percentage = (count: number) => Math.round(count / total * 1000) / 10;
  const sentiment = (kind: 'positive' | 'neutral' | 'negative') => {
    const count = validIndexes(value.sentimentByReview.filter(s => s.sentiment === kind).map(s => s.reviewIndex), allowed).length;
    return { count, percentage: percentage(count) };
  };
  return {
    ...value, total,
    ratedCount: input.reviews.filter(r => r.rating !== undefined).length,
    sentiment: { positive: sentiment('positive'), neutral: sentiment('neutral'), negative: sentiment('negative') },
    issues: value.issues.map(i => {
      const reviewIndexes = validIndexes(i.reviewIndexes, allowed);
      return { ...i, reviewIndexes, count: reviewIndexes.length, percentage: percentage(reviewIndexes.length) };
    }).filter(i => i.count > 0).sort((a, b) => b.count - a.count),
    positivePoints: value.positivePoints.map(p => {
      const reviewIndexes = validIndexes(p.reviewIndexes, allowed);
      return { ...p, reviewIndexes, count: reviewIndexes.length };
    }).filter(p => p.count > 0),
  };
}
export type AnalysisResult = ReturnType<typeof aggregateAnalysis>;
