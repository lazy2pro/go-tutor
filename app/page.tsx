'use client';

import { useState, useEffect } from 'react';

const BOARD_SIZE = 19;

// 바둑판 좌표 생성
const boardIndices = Array.from({ length: BOARD_SIZE }, (_, i) => i);

export default function Home() {
  // 19x19 판 상태 (null: 빈칸, 'B': 흑, 'W': 백)
  const [board, setBoard] = useState<(string | null)[][]>(
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [turn, setTurn] = useState<'B' | 'W'>('B');
  const [history, setHistory] = useState<{ x: number; y: number; color: 'B' | 'W' }[]>([]);
  
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('중급자');
  const [aiExplanation, setAiExplanation] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [games, setGames] = useState<any[]>([]);

  // 히스토리를 SGF 포맷으로 변환
  const generateSgf = () => {
    let sgf = `(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]`;
    history.forEach((step) => {
      const col = String.fromCharCode(97 + step.x);
      const row = String.fromCharCode(97 + step.y);
      sgf += `;${step.color}[${col}${row}]`;
    });
    sgf += `)`;
    return sgf;
  };

  // 착수 처리 및 실시간 AI 튜터링 호출
  const handleCellClick = async (x: number, y: number) => {
    if (board[y][x] !== null || loadingAi) return;

    // 판 업데이트
    const newBoard = board.map((row) => [...row]);
    newBoard[y][x] = turn;
    setBoard(newBoard);

    const newStep = { x, y, color: turn };
    const newHistory = [...history, newStep];
    setHistory(newHistory);

    const nextTurn = turn === 'B' ? 'W' : 'B';
    setTurn(nextTurn);

    // 실시간 Gemini AI 분석 호출
    setLoadingAi(true);
    const coordStr = `${String.fromCharCode(65 + x)}${19 - y}`;
    const sgfData = generateSgf();

    try {
      const res = await fetch('/api/go-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sgf: sgfData,
          level,
          userQuestion: `사용자가 방금 ${turn === 'B' ? '흑' : '백'}으로 [${coordStr}] 자리에 두었습니다. 이 수의 의도, 이점 또는 더 좋은 추천 착수 지점이 있는지 실시간으로 해설해 주세요.`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiExplanation(data.result);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  // 판 초기화 (새 대국)
  const handleReset = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setHistory([]);
    setTurn('B');
    setAiExplanation('');
  };

  // DB에 대국 저장
  const handleSaveGame = async () => {
    if (history.length === 0) {
      alert('최소 1수 이상 둔 후 저장해 주세요.');
      return;
    }
    const saveTitle = title || `실시간 대국 (${new Date().toLocaleDateString()})`;
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: saveTitle,
          sgf: generateSgf(),
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      if (res.ok) {
        alert('대국 기보가 저장되었습니다!');
        fetchGames();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const fetchGames = async () => {
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      if (res.ok) setGames(data.games || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-amber-400">실시간 AI 바둑 튜터</h1>
            <p className="text-slate-400 text-sm mt-1">
              바둑판에 돌을 놓으면 Gemini Pro가 착수마다 실시간 코칭을 해드립니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
            >
              새 대국 시작
            </button>
            <button
              onClick={handleSaveGame}
              disabled={saving}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-sm transition disabled:opacity-50"
            >
              {saving ? '저장 중...' : '기보 저장'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 인터랙티브 바둑판 영역 (Left) */}
          <section className="lg:col-span-7 flex flex-col items-center bg-amber-100/10 p-6 rounded-xl border border-slate-700 shadow-xl">
            <div className="mb-4 flex justify-between w-full max-w-[500px] text-sm font-semibold">
              <span className="text-amber-300">현재 차례: {turn === 'B' ? '⚫ 흑' : '⚪ 백'}</span>
              <span className="text-slate-400">총 수순: {history.length}수</span>
            </div>

            {/* 19x19 바둑판 */}
            <div className="relative bg-[#e3ac57] p-4 rounded shadow-2xl border-4 border-[#b88230]">
              <div className="grid grid-cols-19 gap-0 border border-slate-800 bg-[#e3ac57]">
                {boardIndices.map((y) => (
                  <div key={y} className="flex">
                    {boardIndices.map((x) => {
                      const cell = board[y][x];
                      const isLastMove =
                        history.length > 0 &&
                        history[history.length - 1].x === x &&
                        history[history.length - 1].y === y;

                      return (
                        <button
                          key={x}
                          onClick={() => handleCellClick(x, y)}
                          className="w-7 h-7 sm:w-8 sm:h-8 relative flex items-center justify-center hover:bg-black/10 focus:outline-none"
                        >
                          {/* 격자선 */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-[1px] bg-slate-900/60"></div>
                            <div className="h-full w-[1px] bg-slate-900/60 absolute"></div>
                          </div>

                          {/* 화점 (Star points) */}
                          {[3, 9, 15].includes(x) && [3, 9, 15].includes(y) && (
                            <div className="w-1.5 h-1.5 bg-slate-900 rounded-full z-0 pointer-events-none"></div>
                          )}

                          {/* 바둑돌 */}
                          {cell && (
                            <div
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full z-10 shadow-md flex items-center justify-center ${
                                cell === 'B'
                                  ? 'bg-gradient-to-br from-slate-700 to-black border border-slate-800'
                                  : 'bg-gradient-to-br from-white to-slate-200 border border-slate-400'
                              }`}
                            >
                              {isLastMove && (
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    cell === 'B' ? 'bg-red-500' : 'bg-red-600'
                                  }`}
                                />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* AI 실시간 코칭 & 보관함 (Right) */}
          <section className="lg:col-span-5 space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg min-h-[300px]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold text-amber-300">🤖 Gemini 실시간 튜터</h2>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300"
                >
                  <option value="입문자">입문자</option>
                  <option value="초급자">초급자</option>
                  <option value="중급자">중급자</option>
                  <option value="고급자">고급자</option>
                </select>
              </div>

              {loadingAi ? (
                <div className="flex items-center justify-center h-40 text-amber-400 text-sm animate-pulse">
                  Gemini가 수순을 분석 중입니다...
                </div>
              ) : aiExplanation ? (
                <div className="bg-slate-900 p-4 rounded text-sm text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-700 max-h-[350px] overflow-y-auto">
                  {aiExplanation}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">
                  좌측 바둑판에 돌을 놓아보세요. 놓는 즉시 Gemini AI가 수순 분석 및 코칭을 시작합니다.
                </p>
              )}
            </div>

            {/* 기보 보관함 */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
              <h2 className="text-lg font-semibold text-amber-300 mb-3">📁 저장된 대국 목록</h2>
              {games.length === 0 ? (
                <p className="text-slate-500 text-sm">저장된 기보가 없습니다.</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {games.map((game) => (
                    <div
                      key={game.id}
                      className="p-2.5 bg-slate-900 hover:bg-slate-700/50 rounded border border-slate-700/60 text-xs flex justify-between items-center"
                    >
                      <span className="font-semibold text-amber-400">{game.title}</span>
                      <span className="text-slate-500">
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
