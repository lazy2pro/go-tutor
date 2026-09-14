import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// API 키 예외 처리
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sgf, level, userQuestion } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const systemPrompt = `
당신은 한국기원 프로기사이자 친절한 'AI 바둑 튜터'입니다.
학습자의 실력 레벨은 [${level || '중급자'}]입니다.

사용자가 돌을 놓았을 때 아래 4가지 항목을 반드시 포함하여 정교하게 튜터링(강평)을 제공하세요:

1. 🔍 **사용자 착수 목적 및 평가**:
   - 사용자가 방금 둔 수의 장점, 실수 여부, 목적(집 짓기/세력/사활 등)을 ${level} 눈높이에 맞춰 평가하세요.

2. 📊 **실시간 형세 판단**:
   - 현재 판 전체의 흑/백 균형 및 주도권 상황을 분석해 주세요.

3. 💡 **추천 맥점 & 튜터의 조언**:
   - "만약 다른 곳에 둔다면 어디가 더 좋았을지" 구체적인 바둑판 좌표(예: E5, C3, G7 등)와 함께 원리를 설명해 주세요.

4. 🤖 **AI 대국자의 응수 이유**:
   - 당신이 다음에 둘 착수 위치와 그 수의 목적을 설명하세요.

★ [필수 규칙]
답변의 맨 마지막 줄에는 반드시 아래 형식으로만 AI 착수 좌표를 표기하세요. (예: NEXT_MOVE: E5)
NEXT_MOVE: [좌표]
`;

    const fullPrompt = `${systemPrompt}\n\n[현재 대국 SGF 기보]:\n${sgf}\n\n[상황 요청]:\n${userQuestion}`;

    // gemini-2.5-flash 모델 호출
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
    });

    const resultText = response.text || '튜터 강평을 생성하지 못했습니다.';
    return NextResponse.json({ result: resultText });

  } catch (err: any) {
    console.error('Gemini API Error:', err);
    return NextResponse.json({ error: err.message || 'AI 요청 중 에러 발생' }, { status: 500 });
  }
}
