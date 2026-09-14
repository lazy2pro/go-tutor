import { NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

// 기보 저장 API
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
    }
    const { title, sgf, player_black, player_white, user_level, ai_summary, tags } = body;

    if (!title || !sgf) {
      return NextResponse.json({ error: '제목과 SGF 기보는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from('games')
      .insert([{ title, sgf, player_black, player_white, user_level, ai_summary, tags }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, game: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

// 저장된 기보 목록 불러오기 API
export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ games: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
