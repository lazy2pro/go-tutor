# AI Go Tutor

Next.js 기반 AI 바둑 튜터입니다.

## 실행

1. `.env.local`에 `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정합니다.
2. `npm install`
3. `npm run dev`

Supabase에는 `games` 테이블이 필요합니다. 환경변수가 없으면 화면은 열리지만 AI 분석 및 기보 저장 API는 명확한 오류를 반환합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```
