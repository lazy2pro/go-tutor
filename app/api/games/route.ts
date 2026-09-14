import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 기보 저장 API
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, sgf, player_black, player_white, user_level, ai_summary, tags } = body;

    if (!title || !sgf) {
      return NextResponse.json({ error: '제목과 SGF 기보는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('games')
      .insert([{ title, sgf, player_black, player_white, user_level, ai_summary, tags }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, game: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 저장된 기보 목록 불러오기 API
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ games: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
