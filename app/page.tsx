'use client';

import { useState, useEffect } from 'react';

const BOARD_SIZE = 19;
const CELL_SIZE = 28;
const PADDING = 20;
const BOARD_PIXEL_SIZE = (BOARD_SIZE - 1) * CELL_SIZE + PADDING * 2;

export default function Home() {
  const [board, setBoard] = useState<(string | null)[][]>(
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [history, setHistory] = useState<{ x: number; y: number; color: 'B' | 'W' }[]>([]);
  const [userColor, setUserColor] = useState<'B' | 'W'>('B');
  const [level, setLevel] = useState('중급자');

  const [aiExplanation, setAiExplanation] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [games, setGames] = useState<any[]>([]);

  // SGF 생성
  const generateSgf = (hist = history) => {
    let sgf = `(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]`;
    hist.forEach((step) => {
      const col = String.fromCharCode(97 + step.x);
      const row = String.fromCharCode(97 + step.y);
      sgf += `;${step.color}[${col}${row}]`;
    });
    sgf += `)`;
    return sgf;
  };

  // 사용자 착수 ➔ 분석 및 AI 응수 자동 실행
  const handleBoardClick = async (event: React.MouseEvent<SVGSVGElement>) => {
    if (isAiThinking) return;

    const currentTurn = history.length % 2 === 0 ? 'B' : 'W';
    if (currentTurn !== userColor) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left - PADDING;
    const clickY = event.clientY - rect.top - PADDING;

    const x = Math.round(clickX / CELL_SIZE);
    const y = Math.round(clickY / CELL_SIZE);

    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    if (board[y][x] !== null) return;

    // 1. 사용자 돌 착수
    const newBoard = board.map((row) => [...row]);
    newBoard[y][x] = userColor;
    setBoard(newBoard);

    const userMove = { x, y, color: userColor };
    const updatedHistory = [...history, userMove];
    setHistory(updatedHistory);

    // 2. AI 분석 및 다음 수 요청
    setIsAiThinking(true);
    const coordStr = `${String.fromCharCode(65 + (x >= 8 ? x + 1 : x))}${19 - y}`;

    try {
      const prompt = `
사용자가 ${userColor === 'B' ? '흑' : '백'}으로 [${coordStr}] 자리에 두었습니다. (선택된 AI 난이도: ${level})

1. [사용자 수 분석]: 방금 사용자가 둔 수의 장점, 실수 여부, 원리를 ${level} 눈높이에 맞춰 친절히 해설해 주세요.
2. [AI 대국 응수]: 당신은 ${userColor === 'B' ? '백' : '흑'} 대국 상대입니다. ${level} 수준에 맞는 당신의 다음 착수 위치를 바둑판 좌표(예: K10, D4, R14 등) 형식으로 문장 제일 마지막 줄에 'NEXT_MOVE: [좌표]' 형태로 명시해 주세요. (이미 돌이 있는 곳 제외)
`;

      const res = await fetch('/api/go-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sgf: generateSgf(updatedHistory),
          level,
          userQuestion: prompt,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const text = data.result || '';
        setAiExplanation(text);

        // 3. AI 응수 좌표 파싱 및 착수
        const match = text.match(/NEXT_MOVE:\s*([A-HJ-T])(1[0-9]|[1-9])/i);
        if (match) {
          const colChar = match[1].toUpperCase();
          const rowNum = parseInt(match[2], 10);

          let aiX = colChar.charCodeAt(0) - 65;
          if (aiX > 8) aiX -= 1; // 'I' 좌표 제외 처리
          const aiY = 19 - rowNum;

          if (aiX >= 0 && aiX < 19 && aiY >= 0 && aiY < 19 && newBoard[aiY][aiX] === null) {
            const aiColor = userColor === 'B' ? 'W' : 'B';
            setTimeout(() => {
              const aiBoard = newBoard.map((r) => [...r]);
              aiBoard[aiY][aiX] = aiColor;
              setBoard(aiBoard);
              setHistory([...updatedHistory, { x: aiX, y: aiY, color: aiColor }]);
            }, 600);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleReset = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setHistory([]);
    setAiExplanation('');
  };

  const handleSaveGame = async () => {
    if (history.length === 0) return alert('대국을 진행한 후 저장해 주세요.');
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `AI 대국 (${level}) - ${new Date().toLocaleDateString()}`,
          sgf: generateSgf(),
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      if (res.ok) {
        alert('대국 기록이 성공적으로 저장되었습니다!');
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

  const starPoints = [3, 9, 15];
  const isUserTurn = (history.length % 2 === 0 && userColor === 'B') || (history.length % 2 === 1 && userColor === 'W');

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1150px', margin: '0 auto' }}>
      <h1>AI 대국 & 실시간 분석 튜터</h1>
      <p style={{ color: '#666' }}>원하는 난이도를 선택하고 바둑을 두세요. Gemini AI가 당신의 수를 분석하고 바로 맞수를 둡니다.</p>

      {/* 대국 설정 바 */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', background: '#f0f4f8', padding: '12px', borderRadius: '8px' }}>
        <label>
          <strong>AI 난이도: </strong>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={{ padding: '4px 8px' }}>
            <option value="입문자">입문자 (기초 규칙/쉬운 수)</option>
            <option value="초급자">초급자 (기본 행마/사활)</option>
            <option value="중급자">중급자 (실전 포석/전투)</option>
            <option value="고급자">고급자 (정교한 수읽기)</option>
          </select>
        </label>

        <label>
          <strong>내 흑/백 선택: </strong>
          <select value={userColor} onChange={(e) => { setUserColor(e.target.value as 'B' | 'W'); handleReset(); }} style={{ padding: '4px 8px' }}>
            <option value="B">⚫ 흑 (선공)</option>
            <option value="W">⚪ 백 (후공)</option>
          </select>
        </label>

        <button onClick={handleReset} style={{ padding: '6px 14px', cursor: 'pointer' }}>새 대국 시작</button>
        <button onClick={handleSaveGame} disabled={saving} style={{ padding: '6px 14px', cursor: 'pointer' }}>
          {saving ? '저장 중...' : '대국 저장'}
        </button>

        <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: isUserTurn ? '#0066cc' : '#d97706' }}>
          {isUserTurn ? '👉 당신의 차례입니다' : '🤖 AI 대국자가 생각 중...'} (수순: {history.length}수)
        </span>
      </div>

      <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
        {/* 바둑판 */}
        <div style={{ background: '#DC9D40', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }}>
          <svg width={BOARD_PIXEL_SIZE} height={BOARD_PIXEL_SIZE} onClick={handleBoardClick} style={{ cursor: isUserTurn ? 'pointer' : 'not-allowed', display: 'block' }}>
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
              <g key={i}>
                <line x1={PADDING} y1={PADDING + i * CELL_SIZE} x2={PADDING + (BOARD_SIZE - 1) * CELL_SIZE} y2={PADDING + i * CELL_SIZE} stroke="#000" strokeWidth="1" />
                <line x1={PADDING + i * CELL_SIZE} y1={PADDING} x2={PADDING + i * CELL_SIZE} y2={PADDING + (BOARD_SIZE - 1) * CELL_SIZE} stroke="#000" strokeWidth="1" />
              </g>
            ))}

            {starPoints.map((x) =>
              starPoints.map((y) => (
                <circle key={`${x}-${y}`} cx={PADDING + x * CELL_SIZE} cy={PADDING + y * CELL_SIZE} r="3.5" fill="#000" />
              ))
            )}

            {board.map((row, y) =>
              row.map((cell, x) => {
                if (!cell) return null;
                const isLast = history.length > 0 && history[history.length - 1].x === x && history[history.length - 1].y === y;
                return (
                  <g key={`${x}-${y}`}>
                    <circle cx={PADDING + x * CELL_SIZE} cy={PADDING + y * CELL_SIZE} r={CELL_SIZE / 2 - 1} fill={cell === 'B' ? '#111' : '#f9f9f9'} stroke={cell === 'B' ? '#000' : '#ccc'} strokeWidth="1" />
                    {isLast && <circle cx={PADDING + x * CELL_SIZE} cy={PADDING + y * CELL_SIZE} r="4" fill={cell === 'B' ? '#ff4d4d' : '#cc0000'} />}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* AI 해설 및 대국 보관함 */}
        <div style={{ flex: '1', minWidth: '320px' }}>
          <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', backgroundColor: '#fdfdfd', minHeight: '260px' }}>
            <h3 style={{ marginTop: 0, color: '#1a365d' }}>🤖 실시간 착수 분석 & 코칭</h3>
            {isAiThinking ? (
              <p style={{ color: '#d97706', fontWeight: 'bold' }}>Gemini AI가 수순 분석 및 응수를 계산 중입니다...</p>
            ) : aiExplanation ? (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', color: '#2d3748' }}>{aiExplanation}</div>
            ) : (
              <p style={{ color: '#888' }}>바둑판을 클릭해 첫 수를 놓으세요. 대국 진행과 동시에 수 분석이 출력됩니다.</p>
            )}
          </div>

          <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>📁 대국 보관함</h4>
            {games.length === 0 ? (
              <p style={{ color: '#888', fontSize: '13px' }}>저장된 기보가 없습니다.</p>
            ) : (
              <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px' }}>
                {games.map((game) => (
                  <li key={game.id} style={{ marginBottom: '6px' }}>
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
