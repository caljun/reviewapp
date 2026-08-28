export type SimpleAnalysis = {
  summary: string;
  topPriority: { title: string; reason: string; action: string };
  issues: { title: string; count: number; severity: 'high' | 'medium' | 'low' }[];
  positivePoints: string[];
};

// Only remove an outer Markdown fence; do not repair or extract partial JSON.
export function parseSimpleAnalysis(raw: string): SimpleAnalysis | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
  try {
    const data = JSON.parse(cleaned);
    // Minimal rendering guards, not a schema validator. Bad shapes use free text.
    if (!data || typeof data.summary !== 'string' || !data.topPriority
      || !['title', 'reason', 'action'].every(k => typeof data.topPriority[k] === 'string')
      || !Array.isArray(data.issues) || !data.issues.every((i: SimpleAnalysis['issues'][number]) => i && typeof i.title === 'string'
        && Number.isInteger(i.count) && i.count > 0 && ['high', 'medium', 'low'].includes(i.severity))
      || !Array.isArray(data.positivePoints) || !data.positivePoints.every((p: unknown) => typeof p === 'string')) return null;
    return { summary: data.summary, topPriority: { title: data.topPriority.title, reason: data.topPriority.reason, action: data.topPriority.action },
      issues: data.issues.map((i: SimpleAnalysis['issues'][number]) => ({ title: i.title, count: i.count, severity: i.severity })).sort((a: SimpleAnalysis['issues'][number], b: SimpleAnalysis['issues'][number]) => b.count - a.count),
      positivePoints: data.positivePoints };
  } catch { return null; }
}
