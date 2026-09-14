import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI();

export async function POST(request: Request) {
  try {
    const { sgf, userQuestion, level = '중급자' } = await request.json();

    const systemInstruction = `
너는 친절하고 명확한 전문 바둑 AI 튜터야.
사용자 실력: '${level}'
제공된 SGF 기보를 분석하여 사용자 질문에 맞는 알기 쉬운 해설을 제공해줘.
정답을 바로 알려주기보다 원리와 힌트 위주로 설명해.
`;

    const userPrompt = `
[SGF 기보 데이터]
${sgf}

[사용자 질문]
${userQuestion || '이 대국의 총평과 개선할 핵심 착수를 알려주세요.'}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    return NextResponse.json({ result: response.text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
