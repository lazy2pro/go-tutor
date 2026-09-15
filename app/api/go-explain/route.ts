import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextResponse } from 'next/server';

const BOARD_SIZES = new Set([9, 13, 19]);
const COLORS = new Set(['B', 'W']);

const responseSchema = {
  type: 'object',
  properties: {
    move: { type: 'string', description: 'AI가 지금 둘 좌표. I를 제외한 영문 열과 숫자 행을 사용한다. 예: D4' },
    evaluation: { type: 'string', description: '사용자의 마지막 수 평가 한 문장' },
    position: { type: 'string', description: '현재 형세 판단 한 문장' },
    advice: { type: 'string', description: '학습자를 위한 맥점 또는 다음 계획 한 문장' },
    reason: { type: 'string', description: '선택한 AI 응수의 목적 한 문장' },
  },
  required: ['move', 'evaluation', 'position', 'advice', 'reason'],
  additionalProperties: false,
} as const;

interface TutorResult {
  move: string;
  evaluation: string;
  position: string;
  advice: string;
  reason: string;
}

function isTutorResult(value: unknown): value is TutorResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['move', 'evaluation', 'position', 'advice', 'reason'].every(
    (key) => typeof item[key] === 'string' && item[key].trim().length > 0
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
    }

    const { sgf, level, boardSize, aiColor, lastMove } = body as Record<string, unknown>;
    if (typeof sgf !== 'string' || !sgf.startsWith('(;GM[1]') || sgf.length > 50_000) {
      return NextResponse.json({ error: '유효한 SGF 기보가 필요합니다.' }, { status: 400 });
    }
    if (typeof boardSize !== 'number' || !BOARD_SIZES.has(boardSize)) {
      return NextResponse.json({ error: '지원하지 않는 바둑판 크기입니다.' }, { status: 400 });
    }
    if (typeof aiColor !== 'string' || !COLORS.has(aiColor)) {
      return NextResponse.json({ error: 'AI 돌 색상이 올바르지 않습니다.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Vercel Environment Variables에 GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
당신은 한국어로 가르치는 바둑 프로기사 AI 튜터다.
현재 ${boardSize}x${boardSize} 판이며 학습자 수준은 ${typeof level === 'string' ? level : '입문자'}, AI는 ${aiColor === 'B' ? '흑' : '백'}이다.
SGF를 읽고 지금 AI가 둘 수를 하나 선택하라. 이미 돌이 있는 곳, 판 밖, 자충수는 선택하지 마라.
좌표는 왼쪽에서 A부터 시작하되 I열은 건너뛰고, 아래쪽이 1행이다.
${typeof lastMove === 'string' && lastMove ? `학습자의 마지막 수는 ${lastMove}다.` : 'AI의 첫 수를 선택하는 상황이다.'}
설명은 ${typeof level === 'string' ? level : '입문자'}가 이해하도록 각 항목을 한국어 한 문장으로 짧게 쓴다.

현재 기보:
${sgf}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        temperature: 0.25,
        maxOutputTokens: 700,
      },
    });

    const text = response.text;
    if (!text) throw new Error('Gemini가 빈 응답을 반환했습니다.');
    const result: unknown = JSON.parse(text);
    if (!isTutorResult(result)) throw new Error('Gemini 응답 형식이 올바르지 않습니다.');

    return NextResponse.json({ result });
  } catch (error: unknown) {
    console.error('Gemini API Error:', error);
    const message = error instanceof Error ? error.message : 'AI 인증 또는 통신 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
