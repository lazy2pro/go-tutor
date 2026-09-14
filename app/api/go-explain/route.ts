import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST(request: Request) {
  try {
    const { sgf, level, userQuestion } = await request.json();

    const systemInstruction = `
당신은 한국기원 9단 프로기사이자 친절하고 정교한 'AI 전문 바둑 튜터'입니다.
학습자의 실력 레벨은 [${level || '중급자'}]입니다.

사용자의 착수마다 반드시 아래 4가지 항목을 명확히 구분하여 상세히 강평해 주어야 합니다.

[강평 양식]
1. 🔍 **사용자 착수 평가**:
   - 학습자가 방금 둔 수의 장점과 약점, 목적(집 짓기, 세력 확장, 사활, 전투 등)을 ${level} 눈높이에 맞춰 평가하세요.
2. 📊 **실시간 형세 판단**:
   - 현재 판 전체의 흑/백 균형 및 주도권 상황을 분석해 주세요.
3. 💡 **추천 맥점 & 튜터의 조언**:
   - "만약 다른 곳에 둔다면 어디가 더 좋았을지" 구체적인 좌표(예: K10, D4)와 함께 그 자리가 왜 맥점인지 이유를 설명해 주세요.
4. 🤖 **AI의 응수 이유**:
   - 당신이 다음에 둘 착수 위치와 그 수의 목적을 설명하세요.

★ 중요: 문장 맨 마지막 줄에는 반드시 아래 형식으로만 AI 착수 좌표를 표기하세요.
NEXT_MOVE: [좌표]
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemInstruction}\n\n[현재 대국 SGF 데이터]:\n${sgf}\n\n[추가 질문 및 상황]:\n${userQuestion}`,
            },
          ],
        },
      ],
    });

    const resultText = response.text || '튜터 분석을 불러오지 못했습니다.';
    return NextResponse.json({ result: resultText });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
