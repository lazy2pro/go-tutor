import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: '올바른 JSON 요청이 필요합니다.' },
        { status: 400 }
      );
    }

    const { sgf, level, userQuestion } = body;

    if (
      typeof sgf !== 'string' ||
      !sgf.startsWith('(;GM[1]') ||
      sgf.length > 50_000
    ) {
      return NextResponse.json(
        { error: '유효한 SGF 기보가 필요합니다.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
당신은 친절한 한국어 AI 바둑 튜터입니다.
학습자 레벨: ${typeof level === 'string' ? level : '입문자'}

현재 기보:
${sgf}

상황:
${typeof userQuestion === 'string' ? userQuestion : ''}

다음 형식으로 350자 이내의 짧은 강평만 작성하세요.

1. 착수 평가: 한 문장
2. 형세: 한 문장
3. 다음 학습 포인트: 한 문장
4. AI 응수 의도: 한 문장

마크다운 표, 긴 서론, NEXT_MOVE 좌표는 쓰지 마세요.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.4,
        maxOutputTokens: 450,
      },
    });

    return NextResponse.json({
      result: response.text || '강평을 생성하지 못했습니다.',
    });
  } catch (error: unknown) {
    console.error('Gemini API error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'AI 분석 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
