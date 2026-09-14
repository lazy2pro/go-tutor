'use client';

import { useState, useEffect } from 'react';

const BOARD_SIZE = 19;
const CELL_SIZE = 28; // 셀 크기 (px)
const PADDING = 20;   // 바둑판 여백 (px)
const BOARD_PIXEL_SIZE = (BOARD_SIZE - 1) * CELL_SIZE + PADDING * 2;

export default function Home() {
  const [board, setBoard] = useState<(string | null)[][]>(
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [turn, setTurn] = useState<'B' | 'W'>('B');
  const [history, setHistory] = useState<{ x: number; y: number; color: 'B' | 'W' }[]>([]);
  
  const [level, setLevel] = useState('중급자');
  const [aiExplanation, setAiExplanation] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [games, setGames] = useState<any[]>([]);

  // SGF 변환
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

  // 바둑판 착수 (교차점 클릭)
  const handleBoardClick = async (event: React.MouseEvent<SVGSVGElement>) => {
    if (loadingAi) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left - PADDING;
    const clickY = event.clientY - rect.top - PADDING;

    const x = Math.round(clickX / CELL_SIZE);
    const y = Math.round(clickY / CELL_SIZE);

    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    if (board[y][x] !== null) return;

    // 돌 착수
    const newBoard = board.map((row) => [...row]);
    newBoard[y][x] = turn;
    setBoard(newBoard);

    const newStep = { x, y, color: turn };
    const newHistory = [...history, newStep];
    setHistory(newHistory);

    const currentTurn = turn;
    setTurn(turn === 'B' ? 'W' : 'B');

    // AI 실시간 분석 호출
    setLoadingAi(true);
    const coordStr = `${String.fromCharCode(65 + (x >= 8 ? x + 1 : x))}${19 - y}`;

    try {
      const res = await fetch('/api/go-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sgf: generateSgf(),
          level,
          userQuestion: `방금 ${currentTurn === 'B' ? '흑' : '백'}이 [${coordStr}] 자리에 두었습니다. 이 수의 목적과 이점, 그리고 다음에 둘 만한 추천 착수 지점을 짧게 설명해 주세요.`,
        }),
      });
      const data = await res.json();
      if (res.ok) setAiExplanation(data.result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleReset = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setHistory([]);
    setTurn('B');
    setAiExplanation('');
  };

  const handleSaveGame = async () => {
    if (history.length === 0) return alert('돌을 1수 이상 놓은 뒤 저장해 주세요.');
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `실시간 대국 (${new Date().toLocaleDateString()})`,
          sgf: generateSgf(),
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      if (res.ok) {
        alert('기보가 성공적으로 저장되었습니다!');
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

  // 화점 위치 (0-indexed)
  const starPoints = [3, 9, 15];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1100px', margin: '0 auto' }}>
      <h1>실시간 AI 바둑 튜터</h1>
      <p style={{ color: '#666' }}>바둑판의 교차점을 클릭하여 돌을 놓으면 Gemini Pro가 실시간 코칭을 제공합니다.</p>

      <div style={{ marginBottom: '15px' }}>
        <button onClick={handleReset} style={{ padding: '8px 16px', marginRight: '10px', cursor: 'pointer' }}>새 대국 시작</button>
        <button onClick={handleSaveGame} disabled={saving} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          {saving ? '저장 중...' : '기보 저장'}
        </button>
        <span style={{ marginLeft: '20px', fontWeight: 'bold' }}>
          현재 차례: {turn === 'B' ? '⚫ 흑' : '⚪ 백'} | 수순: {history.length}수
        </span>
      </div>

      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        {/* SVG 선명한 바둑판 */}
        <div style={{ background: '#DC9D40', padding: '10px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
          <svg
            width={BOARD_PIXEL_SIZE}
            height={BOARD_PIXEL_SIZE}
            onClick={handleBoardClick}
            style={{ cursor: 'pointer', display: 'block' }}
          >
            {/* 격자선 */}
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
              <g key={i}>
                {/* 가로선 */}
                <line
                  x1={PADDING}
                  y1={PADDING + i * CELL_SIZE}
                  x2={PADDING + (BOARD_SIZE - 1) * CELL_SIZE}
                  y2={PADDING + i * CELL_SIZE}
                  stroke="#000"
                  strokeWidth="1"
                />
                {/* 세로선 */}
                <line
                  x1={PADDING + i * CELL_SIZE}
                  y1={PADDING}
                  x2={PADDING + i * CELL_SIZE}
                  y2={PADDING + (BOARD_SIZE - 1) * CELL_SIZE}
                  stroke="#000"
                  strokeWidth="1"
                />
              </g>
            ))}

            {/* 화점 (Star Points) */}
            {starPoints.map((x) =>
              starPoints.map((y) => (
                <circle
                  key={`${x}-${y}`}
                  cx={PADDING + x * CELL_SIZE}
                  cy={PADDING + y * CELL_SIZE}
                  r="3.5"
                  fill="#000"
                />
              ))
            )}

            {/* 바둑돌 렌더링 */}
            {board.map((row, y) =>
              row.map((cell, x) => {
                if (!cell) return null;
                const isLast =
                  history.length > 0 &&
                  history[history.length - 1].x === x &&
                  history[history.length - 1].y === y;

                return (
                  <g key={`${x}-${y}`}>
                    <circle
                      cx={PADDING + x * CELL_SIZE}
                      cy={PADDING + y * CELL_SIZE}
                      r={CELL_SIZE / 2 - 1}
                      fill={cell === 'B' ? '#111' : '#f9f9f9'}
                      stroke={cell === 'B' ? '#000' : '#ccc'}
                      strokeWidth="1"
                    />
                    {isLast && (
                      <circle
                        cx={PADDING + x * CELL_SIZE}
                        cy={PADDING + y * CELL_SIZE}
                        r="4"
                        fill={cell === 'B' ? '#ff4d4d' : '#cc0000'}
                      />
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* AI 해설 창 */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>🤖 Gemini 실시간 튜터</h3>
              <select value={level} onChange={(e) => setLevel(e.target.value)} style={{ padding: '4px' }}>
                <option value="입문자">입문자</option>
                <option value="초급자">초급자</option>
                <option value="중급자">중급자</option>
                <option value="고급자">고급자</option>
              </select>
            </div>

            {loadingAi ? (
              <p style={{ color: '#0066cc' }}>Gemini가 착수를 분석하는 중입니다...</p>
            ) : aiExplanation ? (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px' }}>{aiExplanation}</div>
            ) : (
              <p style={{ color: '#888' }}>바둑판 교차점을 클릭해 돌을 놓으면 실시간 해설이 시작됩니다.</p>
            )}
          </div>

          <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>📁 저장된 대국 목록</h4>
            {games.length === 0 ? (
              <p style={{ color: '#888', fontSize: '13px' }}>저장된 기보가 없습니다.</p>
            ) : (
              <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px' }}>
                {games.map((game) => (
                  <li key={game.id} style={{ marginBottom: '5px' }}>
                    <strong>{game.title}</strong> ({new Date(game.created_at).toLocaleDateString()})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
