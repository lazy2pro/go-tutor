'use client';

import { useState, useEffect, useCallback } from 'react';

const PADDING = 24;
const BOARD_PIXEL_MAX = 520; // 바둑판 전체 가로/세로 픽셀 크기

export default function Home() {
  // 대국 설정 상태
  const [boardSize, setBoardSize] = useState<number>(19);
  const [level, setLevel] = useState<string>('중급자');
  const [userColor, setUserColor] = useState<'B' | 'W'>('B');
  const [gameStarted, setGameStarted] = useState<boolean>(false);

  // 게임 진행 상태
  const [board, setBoard] = useState<(string | null)[][]>([]);
  const [history, setHistory] = useState<{ x: number; y: number; color: 'B' | 'W' }[]>([]);

  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [games, setGames] = useState<any[]>([]);

  // 셀 크기 자동 계산
  const cellSize = Math.floor((BOARD_PIXEL_MAX - PADDING * 2) / (boardSize - 1));
  const boardPixelSize = (boardSize - 1) * cellSize + PADDING * 2;

  // 화점 위치 계산
  const getStarPoints = (size: number) => {
    if (size === 19) return [3, 9, 15];
    if (size === 13) return [3, 6, 9];
    if (size === 9) return [2, 4, 6];
    return [];
  };

  // SGF 생성
  const generateSgf = (hist = history) => {
    let sgf = `(;GM[1]FF[4]SZ[${boardSize}]KM[6.5]RU[Japanese]`;
    hist.forEach((step) => {
      const col = String.fromCharCode(97 + step.x);
      const row = String.fromCharCode(97 + step.y);
      sgf += `;${step.color}[${col}${row}]`;
    });
    sgf += `)`;
    return sgf;
  };

  const getRandomEmptyCell = (currentBoard: (string | null)[][]) => {
    const emptyCells: { x: number; y: number }[] = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (currentBoard[y] && currentBoard[y][x] === null) emptyCells.push({ x, y });
      }
    }
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  };

  // 새 대국 시작 (판 초기화)
  const handleStartGame = () => {
    const newBoard = Array(boardSize)
      .fill(null)
      .map(() => Array(boardSize).fill(null));
    setBoard(newBoard);
    setHistory([]);
    setAiExplanation('대국이 시작되었습니다. 바둑판에 첫 수를 놓으시면 AI 튜터의 심층 분석이 시작됩니다.');
    setGameStarted(true);
  };

  // AI 튜터링 및 착수 실행
  const triggerAiMove = useCallback(
    async (currentBoard: (string | null)[][], currentHistory: typeof history, promptText: string) => {
      setIsAiThinking(true);
      const aiColor = userColor === 'B' ? 'W' : 'B';

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch('/api/go-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgf: generateSgf(currentHistory),
            level,
            userQuestion: promptText,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        let targetX: number | null = null;
        let targetY: number | null = null;

        if (res.ok && data.result) {
          setAiExplanation(data.result);

          // NEXT_MOVE 좌표 파싱
          const match = data.result.match(/NEXT_MOVE\s*:\s*([A-T])\s*(1[0-9]|[1-9])/i);

          if (match) {
            const colChar = match[1].toUpperCase();
            const rowNum = parseInt(match[2], 10);
            let code = colChar.charCodeAt(0) - 65;
            if (code > 8) code -= 1; // 'I'열 오프셋
            const calcY = boardSize - rowNum;

            if (code >= 0 && code < boardSize && calcY >= 0 && calcY < boardSize && currentBoard[calcY][code] === null) {
              targetX = code;
              targetY = calcY;
            }
          }
        }

        // 파싱 실패/타임아웃 시 자동 예비 착수
        if (targetX === null || targetY === null) {
          const fallback = getRandomEmptyCell(currentBoard);
          if (fallback) {
            targetX = fallback.x;
            targetY = fallback.y;
          }
        }

        if (targetX !== null && targetY !== null) {
          const updatedBoard = currentBoard.map((r) => [...r]);
          updatedBoard[targetY][targetX] = aiColor;
          setBoard(updatedBoard);
          setHistory([...currentHistory, { x: targetX, y: targetY, color: aiColor }]);
        }
      } catch (err) {
        console.error('AI 착수 지연으로 예비 착수 실행');
        const fallback = getRandomEmptyCell(currentBoard);
        if (fallback) {
          const updatedBoard = currentBoard.map((r) => [...r]);
          updatedBoard[fallback.y][fallback.x] = aiColor;
          setBoard(updatedBoard);
          setHistory([...currentHistory, { x: fallback.x, y: fallback.y, color: aiColor }]);
          setAiExplanation('AI 해설 요청 시간이 초과되어 착수를 진행했습니다.');
        }
      } finally {
        setIsAiThinking(false);
      }
    },
    [userColor, level, boardSize]
  );

  // AI 선공(흑) 자동 첫 수
  useEffect(() => {
    if (gameStarted && userColor === 'W' && history.length === 0 && !isAiThinking) {
      const prompt = `
당신은 ${boardSize}x${boardSize} 바둑판의 흑(선공) 대국자이자 전문 AI 튜터입니다.
1. 첫 착수를 진행하고 그 자리를 선정한 귀의 포석 이유를 설명하세요.
2. 답변의 맨 마지막 줄에 "NEXT_MOVE: [좌표]" 형식으로 착수 위치를 출력하세요. (예: NEXT_MOVE: D4)
`;
      triggerAiMove(board, history, prompt);
    }
  }, [gameStarted, userColor, history, isAiThinking, board, boardSize, triggerAiMove]);

  // 사용자가 바둑판 클릭 시 착수
  const handleBoardClick = async (event: React.MouseEvent<SVGSVGElement>) => {
    if (!gameStarted || isAiThinking) return;

    const currentTurn = history.length % 2 === 0 ? 'B' : 'W';
    if (currentTurn !== userColor) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left - PADDING;
    const clickY = event.clientY - rect.top - PADDING;

    const x = Math.round(clickX / cellSize);
    const y = Math.round(clickY / cellSize);

    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return;
    if (board[y][x] !== null) return;

    // 사용자 돌 놓기
    const newBoard = board.map((row) => [...row]);
    newBoard[y][x] = userColor;
    setBoard(newBoard);

    const userMove = { x, y, color: userColor };
    const updatedHistory = [...history, userMove];
    setHistory(updatedHistory);

    const colName = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
    const coordStr = `${colName}${boardSize - y}`;

    // 튜터링 전용 프롬프트 구성
    const prompt = `
당신은 세계 최고 수준의 바둑 AI 튜터입니다. (바둑판 규격: ${boardSize}x${boardSize}, 학습자 수준: ${level})
사용자가 방금 [${coordStr}] 위치에 ${userColor === 'B' ? '흑' : '백'}으로 두었습니다.

다음 형태를 갖추어 깊이 있는 튜터링을 제공해 주세요:

1. 🔍 [사용자 착수 의도 및 형세 분석]
   - 사용자가 놓은 [${coordStr}] 수의 목적(세력 확장, 집 집적, 사활 압박 등)을 분석해 주세요.
   - 이 수가 좋은 수인지, 혹은 실수(완착/악수)인지 ${level} 눈높이에 맞추어 평가해 주세요.

2. 💡 [튜터의 핵심 코칭 & 추천 맥점]
   - 지금 국면에서 학습자가 두었어야 할 더 좋은 최선의 수(추천 좌표)가 있다면 이유와 함께 원리를 설명해 주세요.

3. 🤖 [AI 대국자의 응수]
   - 당신의 다음 착수 위치와 이유를 짧게 설명하고, 답변 맨 마지막 줄에 아래 형식으로 좌표를 반드시 명시해 주세요.
   NEXT_MOVE: [좌표]
`;

    triggerAiMove(newBoard, updatedHistory, prompt);
  };

  const handleSaveGame = async () => {
    if (history.length === 0) return alert('대국을 시작한 후 저장해 주세요.');
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `AI 튜터링 (${boardSize}x${boardSize} / ${level}) - ${new Date().toLocaleDateString()}`,
          sgf: generateSgf(),
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      if (res.ok) {
        alert('대국 기보와 튜터 분석 내용이 저장되었습니다!');
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

  const starPoints = getStarPoints(boardSize);
  const isUserTurn = gameStarted && ((history.length % 2 === 0 && userColor === 'B') || (history.length % 2 === 1 && userColor === 'W'));

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1150px', margin: '0 auto' }}>
      <h1>🎓 AI 바둑 튜터 대국실</h1>
      <p style={{ color: '#666' }}>바둑판 규격과 실력 레벨을 선택한 후 대국을 시작하세요. 착수할 때마다 맞춤형 튜터링이 진행됩니다.</p>

      {/* 대국 설정 컨트롤 패널 */}
      <div style={{ background: '#f0f4f8', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            <strong>바둑판 규격: </strong>
            <select
              value={boardSize}
              onChange={(e) => { setBoardSize(Number(e.target.value)); setGameStarted(false); }}
              disabled={gameStarted}
              style={{ padding: '6px 10px', fontWeight: 'bold' }}
            >
              <option value={19}>19 x 19 (국제 정식 규격)</option>
              <option value={13}>13 x 13 (중급/속진용)</option>
              <option value={9}>9 x 9 (입문/사활/포석 연습)</option>
            </select>
          </label>

          <label>
            <strong>내 실력 레벨: </strong>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={gameStarted}
              style={{ padding: '6px 10px' }}
            >
              <option value="입문자">입문자 (기초 단수/집 짓기)</option>
              <option value="초급자">초급자 (기초 사활/행마법)</option>
              <option value="중급자">중급자 (실전 포석/전투 형세)</option>
              <option value="고급자">고급자 (심화 수읽기/개체 득실)</option>
            </select>
          </label>

          <label>
            <strong>흑/백 선택: </strong>
            <select
              value={userColor}
              onChange={(e) => { setUserColor(e.target.value as 'B' | 'W'); setGameStarted(false); }}
              disabled={gameStarted}
              style={{ padding: '6px 10px' }}
            >
              <option value="B">⚫ 흑 (선공)</option>
              <option value="W">⚪ 백 (후공)</option>
            </select>
          </label>

          {!gameStarted ? (
            <button
              onClick={handleStartGame}
              style={{ padding: '8px 20px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              대국 시작하기
            </button>
          ) : (
            <button
              onClick={() => setGameStarted(false)}
              style={{ padding: '8px 16px', background: '#e2e8f0', color: '#333', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}
            >
              설정 변경 / 재시작
            </button>
          )}

          {gameStarted && (
            <button
              onClick={handleSaveGame}
              disabled={saving}
              style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {saving ? '저장 중...' : '기보 & 튜터링 저장'}
            </button>
          )}
        </div>

        {gameStarted && (
          <div style={{ marginTop: '12px', fontWeight: 'bold', color: isUserTurn ? '#0066cc' : '#d97706' }}>
            {isUserTurn ? '👉 당신의 차례입니다. 바둑판 교차점을 클릭하세요.' : '🤖 AI 튜터가 착수를 분석하고 다음 수를 계산 중입니다...'} (총 수순: {history.length}수)
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
        {/* SVG 가변 바둑판 */}
        <div style={{ background: '#DC9D40', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', opacity: gameStarted ? 1 : 0.6 }}>
          <svg
            width={boardPixelSize}
            height={boardPixelSize}
            onClick={handleBoardClick}
            style={{ cursor: isUserTurn ? 'pointer' : 'not-allowed', display: 'block' }}
          >
            {/* 격자선 */}
            {Array.from({ length: boardSize }).map((_, i) => (
              <g key={i}>
                <line x1={PADDING} y1={PADDING + i * cellSize} x2={PADDING + (boardSize - 1) * cellSize} y2={PADDING + i * cellSize} stroke="#000" strokeWidth="1" />
                <line x1={PADDING + i * cellSize} y1={PADDING} x2={PADDING + i * cellSize} y2={PADDING + (boardSize - 1) * cellSize} stroke="#000" strokeWidth="1" />
              </g>
            ))}

            {/* 화점 */}
            {starPoints.map((x) =>
              starPoints.map((y) => (
                <circle key={`${x}-${y}`} cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r="3.5" fill="#000" />
              ))
            )}

            {/* 바둑돌 */}
            {board.map((row, y) =>
              row.map((cell, x) => {
                if (!cell) return null;
                const isLast = history.length > 0 && history[history.length - 1].x === x && history[history.length - 1].y === y;
                return (
                  <g key={`${x}-${y}`}>
                    <circle cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r={cellSize / 2 - 1} fill={cell === 'B' ? '#111' : '#f9f9f9'} stroke={cell === 'B' ? '#000' : '#ccc'} strokeWidth="1" />
                    {isLast && <circle cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r="4" fill={cell === 'B' ? '#ff4d4d' : '#cc0000'} />}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* 튜터 분석 코칭 창 */}
        <div style={{ flex: '1', minWidth: '320px' }}>
          <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '8px', backgroundColor: '#ffffff', minHeight: '320px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>🤖 AI 튜터 실시간 강평 및 분석</h3>
            {!gameStarted ? (
              <p style={{ color: '#64748b', fontSize: '14px', marginTop: '20px' }}>
                상단 패널에서 바둑판 규격(9x9, 13x13, 19x19)과 난이도를 지정한 뒤 <strong>[대국 시작하기]</strong> 버튼을 클릭하세요.
              </p>
            ) : isAiThinking ? (
              <p style={{ color: '#d97706', fontWeight: 'bold', marginTop: '20px' }}>
                AI 튜터가 학습자의 착수 목적을 분석하고 최적의 응수와 함께 코칭 내용을 작성 중입니다...
              </p>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', color: '#334155', marginTop: '10px' }}>
                {aiExplanation}
              </div>
            )}
          </div>

          {/* 기보 보관함 */}
          <div style={{ marginTop: '20px', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', background: '#f8fafc' }}>
            <h4 style={{ marginTop: 0, color: '#334155' }}>📁 복기용 대국 보관함</h4>
            {games.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>저장된 기보가 없습니다.</p>
            ) : (
              <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px', color: '#475569' }}>
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
