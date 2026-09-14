'use client';

import { useState, useEffect } from 'react';

interface Game {
  id: string;
  title: string;
  sgf: string;
  player_black: string;
  player_white: string;
  user_level: string;
  ai_summary: string;
  created_at: string;
}

export default function Home() {
  const [title, setTitle] = useState('');
  const [sgf, setSgf] = useState('');
  const [playerBlack, setPlayerBlack] = useState('');
  const [playerWhite, setPlayerWhite] = useState('');
  const [level, setLevel] = useState('중급자');
  const [question, setQuestion] = useState('');

  const [aiExplanation, setAiExplanation] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);

  const [games, setGames] = useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  // 저장된 기보 목록 가져오기
  const fetchGames = async () => {
    setLoadingGames(true);
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      if (res.ok) {
        setGames(data.games || []);
      }
    } catch (err) {
      console.error('기보 목록 로딩 실패:', err);
    } finally {
      setLoadingGames(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  // AI 해설 요청
  const handleAskAi = async () => {
    if (!sgf) {
      alert('SGF 기보를 입력해 주세요.');
      return;
    }
    setLoadingAi(true);
    setAiExplanation('');
    try {
      const res = await fetch('/api/go-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sgf, userQuestion: question, level }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiExplanation(data.result);
      } else {
        alert(data.error || 'AI 해설 생성 실패');
      }
    } catch (err) {
      console.error(err);
      alert('오류가 발생했습니다.');
    } finally {
      setLoadingAi(false);
    }
  };

  // DB에 기보 저장
  const handleSaveGame = async () => {
    if (!title || !sgf) {
      alert('제목과 SGF 기보는 필수 입력 항목입니다.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sgf,
          player_black: playerBlack,
          player_white: playerWhite,
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      if (res.ok) {
        alert('기보가 성공적으로 저장되었습니다!');
        fetchGames(); // 목록 갱신
      } else {
        const data = await res.json();
        alert(data.error || '저장 실패');
      }
    } catch (err) {
      console.error(err);
      alert('저장 중 오류 발생');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-700 pb-4">
          <h1 className="text-3xl font-bold text-amber-400">AI 바둑 튜터 (Go Tutor)</h1>
          <p className="text-slate-400 text-sm mt-1">
            기보를 입력하고 Gemini Pro AI의 맞춤형 코칭 및 사활/복기 해설을 받아보세요.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 왼쪽: 기보 입력 및 AI 요청 폼 */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4 shadow-lg">
            <h2 className="text-xl font-semibold text-amber-300">1. 기보 및 질문 입력</h2>
            
            <div>
              <label className="block text-xs text-slate-400 mb-1">기보 제목 *</label>
              <input
                type="text"
                placeholder="예: 2026-09-14 인공지능 복기 대국"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">흑 대국자</label>
                <input
                  type="text"
                  placeholder="흑 플레이어"
                  value={playerBlack}
                  onChange={(e) => setPlayerBlack(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">백 대국자</label>
                <input
                  type="text"
                  placeholder="백 플레이어"
                  value={playerWhite}
                  onChange={(e) => setPlayerWhite(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">사용자 실력 레벨</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              >
                <option value="입문자">입문자 (기초 규칙/기본 사활)</option>
                <option value="초급자">초급자 (행마 및 기초 전투)</option>
                <option value="중급자">중급자 (포석 및 실전 응용)</option>
                <option value="고급자">고급자 (심화 복기 및 수읽기)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">SGF 기보 데이터 *</label>
              <textarea
                rows={5}
                placeholder="(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dp]...)"
                value={sgf}
                onChange={(e) => setSgf(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">AI 튜터에게 할 질문</label>
              <input
                type="text"
                placeholder="예: 초반 우상귀 포석 선택이 맞았는지 설명해주세요."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAskAi}
                disabled={loadingAi}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 rounded text-sm transition disabled:opacity-50"
              >
                {loadingAi ? 'AI 해설 분석 중...' : 'AI 튜터 해설 요청'}
              </button>
              <button
                onClick={handleSaveGame}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded text-sm transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '기보 저장'}
              </button>
            </div>
          </section>

          {/* 오른쪽: AI 해설 결과 및 저장된 기보 목록 */}
          <section className="space-y-6">
            {/* AI 해설 카드 */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg min-h-[220px]">
              <h2 className="text-xl font-semibold text-amber-300 mb-3">2. AI 튜터 코칭 해설</h2>
              {aiExplanation ? (
                <div className="bg-slate-900 p-4 rounded text-sm text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-700 max-h-[300px] overflow-y-auto">
                  {aiExplanation}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">
                  좌측 폼에서 SGF 기보를 입력한 후 'AI 튜터 해설 요청' 버튼을 누르면 이곳에 분석 결과가 표시됩니다.
                </p>
              )}
            </div>

            {/* 저장된 기보 목록 */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
              <h2 className="text-xl font-semibold text-amber-300 mb-3">3. 내 기보 보관함</h2>
              {loadingGames ? (
                <p className="text-slate-400 text-sm">기보 불러오는 중...</p>
              ) : games.length === 0 ? (
                <p className="text-slate-500 text-sm">저장된 기보가 없습니다.</p>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {games.map((game) => (
                    <div
                      key={game.id}
                      onClick={() => {
                        setTitle(game.title);
                        setSgf(game.sgf);
                        setPlayerBlack(game.player_black || '');
                        setPlayerWhite(game.player_white || '');
                        if (game.ai_summary) setAiExplanation(game.ai_summary);
                      }}
                      className="p-3 bg-slate-900 hover:bg-slate-700/50 rounded border border-slate-700/60 cursor-pointer transition flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-amber-400 text-sm">{game.title}</div>
                        <div className="text-xs text-slate-400">
                          {game.player_black || '흑'} vs {game.player_white || '백'} ({game.user_level})
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {new Date(game.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
