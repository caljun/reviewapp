import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Temporary connection probe. Review analysis is deliberately bypassed.
export async function POST() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: 'こんにちは。接続確認です',
    });
    return Response.json({ text: response.text ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Geminiへの接続確認に失敗しました。' }, { status: 502 });
  }
}
