import { createAnalyzeHandler } from '@/lib/analyze-handler';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = createAnalyzeHandler();
