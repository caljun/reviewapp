import { analyzeInputSchema, type AnalyzeInput } from '../analyze-input';
import { ApiError, authenticate, errorResponse } from './api-error';
import type { Quota } from './quota';

type Dependencies = {
  verify: (token: string) => Promise<{ uid: string; email?: string; name?: string }>;
  quota: Quota;
  generate: (input: AnalyzeInput) => Promise<unknown>;
};

async function readInput(request: Request) {
  // Bound streamed bytes too; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_INPUT', '入力内容がありません。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 700000) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = analyzeInputSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (!result.success) throw new Error('input');
    return result.data;
  } catch { throw new ApiError(400, 'INVALID_INPUT', 'レビューは1〜50件、各2,000文字、合計50,000文字、アプリ名100文字、観点500文字までです。入力形式も確認してください。'); }
  finally { reader.releaseLock(); }
}

export function createProtectedAnalysis(deps: Dependencies) {
  return async function POST(request: Request) {
    try {
      const identity = await authenticate(request, deps.verify);
      const uid = identity.uid;
      const input = await readInput(request);
      await deps.quota.usage(uid, { email: identity.email ?? '', displayName: identity.name ?? null });
      await deps.quota.reserve(uid, input.requestId, input.reviews.length);
      let result: unknown;
      try { result = await deps.generate(input); }
      catch (error) {
        try { await deps.quota.settle(uid, input.requestId, 'refunded'); }
        catch { throw new ApiError(503, 'REFUND_PENDING', '分析に失敗し、利用枠を戻せませんでした。再分析せず、管理者へお問い合わせください。'); }
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'ANALYSIS_FAILED', 'Geminiによる分析に失敗しました。利用枠は戻りました。再試行してください。');
      }
      try { await deps.quota.settle(uid, input.requestId, 'completed'); }
      catch { throw new ApiError(503, 'COMPLETION_PENDING', '分析の完了を記録できませんでした。再分析せず、管理者へお問い合わせください。'); }
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(error); }
  };
}
