'use client';

import { useState, useEffect, useCallback } from 'react';

const PADDING = 24;
const BOARD_PIXEL_MAX = 520;

type Stone = 'B' | 'W' | null;

interface Point {
  x: number;
  y: number;
}

export default function Home() {
  const [boardSize, setBoardSize] = useState<number>(9);
  const [level, setLevel] = useState<string>('입문자');
  const [userColor, setUserColor] = useState<'B' | 'W'>('B');
  const [gameStarted, setGameStarted] = useState<boolean>(false);

  const [board, setBoard] = useState<Stone[][]>([]);
  const [history, setHistory] = useState<{ x: number; y: number; color: 'B' | 'W' }[]>([]);
  const [capturedB, setCapturedB] = useState<number>(0);
  const [capturedW, setCapturedW] = useState<number>(0);

  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [games, setGames] = useState<any[]>([]);

  const cellSize = Math.floor((BOARD_PIXEL_MAX - PADDING * 2) / (boardSize - 1));
  const boardPixelSize = (boardSize - 1) * cellSize + PADDING * 2;

  const getStarPoints = (size: number) => {
    if (size === 19) return [3, 9, 15];
    if (size === 13) return [3, 6, 9];
    if (size === 9) return [2, 4, 6];
    return [];
  };

  // --- 국제 표준 바둑 룰 엔진 (활로/따냄/사활) ---
  const getGroupAndLiberties = (grid: Stone[][], startX: number, startY: number) => {
    const color = grid[startY][startX];
    if (!color) return { group: [], liberties: 0 };

    const group: Point[] = [];
    const libertiesSet = new Set<string>();
    const visited = new Set<string>();
    const queue: Point[] = [{ x: startX, y: startY }];

    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      group.push({ x, y });

      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < boardSize && n.y >= 0 && n.y < boardSize) {
          if (grid[n.y][n.x] === null) {
            libertiesSet.add(`${n.x},${n.y}`);
          } else if (grid[n.y][n.x] === color && !visited.has(`${n.x},${n.y}`)) {
            visited.add(`${n.x},${n.y}`);
            queue.push(n);
          }
        }
      }
    }

    return { group, liberties: libertiesSet.size };
  };

  const playMove = (currentBoard: Stone[][], x: number, y: number, color: 'B' | 'W') => {
    if (currentBoard[y][x] !== null) return null;

    const nextBoard = currentBoard.map((row) => [...row]);
    nextBoard[y][x] = color;

    const opponent = color === 'B' ? 'W' : 'B';
    let capturedCount = 0;

    const neighbors = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x >= 0 && n.x < boardSize && n.y >= 0 && n.y < boardSize) {
        if (nextBoard[n.y][n.x] === opponent) {
          const { group, liberties } = getGroupAndLiberties(nextBoard, n.x, n.y);
          if (liberties === 0) {
            group.forEach((p) => {
              nextBoard[p.y][p.x] = null;
              capturedCount++;
            });
          }
        }
      }
    }

    const { liberties: myLiberties } = getGroupAndLiberties(nextBoard, x, y);
    if (myLiberties === 0 && capturedCount === 0) {
      return null; // 금수수
    }

    return { newBoard: nextBoard, capturedCount };
  };

  const getValidEmptyCells = (currentBoard: Stone[][], color: 'B' | 'W') => {
    const valids: Point[] = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (currentBoard[y][x] === null) {
          const res = playMove(currentBoard, x, y, color);
          if (res !== null) valids.push({ x, y });
        }
      }
    }
    return valids;
  };

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

  const handleStartGame = () => {
    const newBoard: Stone[][] = Array(boardSize)
      .fill(null)
      .map(() => Array(boardSize).fill(null));
    setBoard(newBoard);
    setHistory([]);
    setCapturedB(0);
    setCapturedW(0);
    setAiExplanation('대국이 시작되었습니다. 바둑판 교차점에 착수하시면 4단계 튜터 코칭 강평이 출력됩니다.');
    setGameStarted(true);
  };

  const triggerAiMove = useCallback(
    async (currentBoard: Stone[][], currentHistory: typeof history, promptText: string) => {
      setIsAiThinking(true);
      const aiColor = userColor === 'B' ? 'W' : 'B';

      try {
        const res = await fetch('/api/go-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgf: generateSgf(currentHistory),
            level,
            userQuestion: promptText,
          }),
        });

        const data = await res.json();
        let targetX: number | null = null;
        let targetY: number | null = null;

        if (res.ok && data.result) {
          setAiExplanation(data.result);
          const match = data.result.match(/NEXT_MOVE\s*:\s*([A-T])\s*(1[0-9]|[1-9])/i);

          if (match) {
            const colChar = match[1].toUpperCase();
            const rowNum = parseInt(match[2], 10);
            let code = colChar.charCodeAt(0) - 65;
            if (code > 8) code -= 1;
            const calcY = boardSize - rowNum;

            if (code >= 0 && code < boardSize && calcY >= 0 && calcY < boardSize) {
              const testRes = playMove(currentBoard, code, calcY, aiColor);
              if (testRes !== null) {
                targetX = code;
                targetY = calcY;
              }
            }
          }
        } else {
          setAiExplanation('AI 튜터 해설을 가져오는 중 오류가 발생하여 예비 착수를 계속합니다.');
        }

        if (targetX === null || targetY === null) {
          const valids = getValidEmptyCells(currentBoard, aiColor);
          if (valids.length > 0) {
            const randomValid = valids[Math.floor(Math.random() * valids.length)];
            targetX = randomValid.x;
            targetY = randomValid.y;
          }
        }

        if (targetX !== null && targetY !== null) {
          const moveRes = playMove(currentBoard, targetX, targetY, aiColor);
          if (moveRes) {
            setBoard(moveRes.newBoard);
            if (aiColor === 'B') setCapturedW((prev) => prev + moveRes.capturedCount);
            else setCapturedB((prev) => prev + moveRes.capturedCount);

            setHistory([...currentHistory, { x: targetX, y: targetY, color: aiColor }]);
          }
        } else {
          setAiExplanation('더 이상 둘 수 있는 유효한 위치가 없습니다. 대국이 종료되었습니다.');
        }
      } catch (err) {
        console.error(err);
        setAiExplanation('통신 오류가 발생했습니다. 대국 진행을 위해 예비 착수를 적용합니다.');
      } finally {
        setIsAiThinking(false);
      }
    },
    [userColor, level, boardSize]
  );

  useEffect(() => {
    if (gameStarted && userColor === 'W' && history.length === 0 && !isAiThinking) {
      const prompt = `당신은 ${boardSize}x${boardSize} 바둑판의 흑(선공) 대국자이자 전문 AI 튜터입니다. 첫 수를 착수하고 포석 가치를 설명해 주세요. 마지막 줄에 "NEXT_MOVE: [좌표]"를 표기하세요.`;
      triggerAiMove(board, history, prompt);
    }
  }, [gameStarted, userColor, history, isAiThinking, board, boardSize, triggerAiMove]);

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

    const moveRes = playMove(board, x, y, userColor);
    if (!moveRes) {
      alert('이미 돌이 존재하거나 금수수(자충수) 위치입니다.');
      return;
    }

    setBoard(moveRes.newBoard);
    if (userColor === 'B') setCapturedW((prev) => prev + moveRes.capturedCount);
    else setCapturedB((prev) => prev + moveRes.capturedCount);

    const userMove = { x, y, color: userColor };
    const updatedHistory = [...history, userMove];
    setHistory(updatedHistory);

    const colName = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
    const coordStr = `${colName}${boardSize - y}`;

    const prompt = `
사용자가 방금 [${coordStr}] 위치에 ${userColor === 'B' ? '흑' : '백'}으로 착수했습니다.
지정된 4가지 강평 항목(착수 평가, 형세 판단, 추천 맥점, AI 응수 이유)을 완성해 주세요.
`;

    triggerAiMove(moveRes.newBoard, updatedHistory, prompt);
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
        alert('대국 기록과 튜터 코칭 내용이 보관함에 저장되었습니다!');
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
      <h1>🎓 AI 바둑 튜터 대국실 (국제 표준 룰 적용)</h1>
      <p style={{ color: '#666' }}>원하는 규격과 실력 레벨을 선택하고 바둑을 두면 프로기사 수준의 실시간 튜터링이 제공됩니다.</p>

      {/* 컨트롤 패널 */}
      <div style={{ background: '#f0f4f8', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            <strong>바둑판 규격: </strong>
            <select
              value={boardSize}
              onChange={(e) => { setBoardSize(Number(e.target.value)); setGameStarted(false); }}
              disabled={gameStarted}
              style={{ padding: '6px 10px' }}
            >
              <option value={19}>19 x 19 (정식 규격)</option>
              <option value={13}>13 x 13 (속진용)</option>
              <option value={9}>9 x 9 (입문/사활 연습)</option>
            </select>
          </label>

          <label>
            <strong>레벨: </strong>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={gameStarted}
              style={{ padding: '6px 10px' }}
            >
              <option value="입문자">입문자 (기초 단수/사활)</option>
              <option value="초급자">초급자 (기초 행마법)</option>
              <option value="중급자">중급자 (실전 포석/전투)</option>
              <option value="고급자">고급자 (심화 수읽기)</option>
            </select>
          </label>

          <label>
            <strong>흑/백: </strong>
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
              {saving ? '저장 중...' : '기보 저장'}
            </button>
          )}
        </div>

        {gameStarted && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '20px', fontSize: '14px', fontWeight: 'bold' }}>
            <span style={{ color: isUserTurn ? '#0066cc' : '#d97706' }}>
              {isUserTurn ? '👉 당신의 차례입니다' : '🤖 AI 튜터 코칭 및 착수 분석 중...'} (총 수순: {history.length}수)
            </span>
            <span style={{ color: '#334155' }}>
              사석(따낸 돌) - 흑 따냄: {capturedW}개 | 백 따냄: {capturedB}개
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
        {/* 바둑판 */}
        <div style={{ background: '#DC9D40', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', opacity: gameStarted ? 1 : 0.6 }}>
          <svg
            width={boardPixelSize}
            height={boardPixelSize}
            onClick={handleBoardClick}
            style={{ cursor: isUserTurn ? 'pointer' : 'not-allowed', display: 'block' }}
          >
            {Array.from({ length: boardSize }).map((_, i) => (
              <g key={i}>
                <line x1={PADDING} y1={PADDING + i * cellSize} x2={PADDING + (boardSize - 1) * cellSize} y2={PADDING + i * cellSize} stroke="#000" strokeWidth="1" />
                <line x1={PADDING + i * cellSize} y1={PADDING} x2={PADDING + i * cellSize} y2={PADDING + (boardSize - 1) * cellSize} stroke="#000" strokeWidth="1" />
              </g>
            ))}

            {starPoints.map((x) =>
              starPoints.map((y) => (
                <circle key={`${x}-${y}`} cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r="3.5" fill="#000" />
              ))
            )}

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

        {/* AI 튜터 코칭 패널 */}
        <div style={{ flex: '1', minWidth: '320px' }}>
          <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '8px', backgroundColor: '#ffffff', minHeight: '380px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>🤖 AI 튜터 실시간 강평 및 분석</h3>
            {!gameStarted ? (
              <p style={{ color: '#64748b', fontSize: '14px', marginTop: '20px' }}>
                상단 패널에서 바둑판 규격과 난이도를 지정한 후 <strong>[대국 시작하기]</strong> 버튼을 누르세요.
              </p>
            ) : isAiThinking ? (
              <p style={{ color: '#d97706', fontWeight: 'bold', marginTop: '20px' }}>
                AI 튜터가 수순의 목적, 형세 판단, 추천 맥점을 종합 분석 중입니다...
              </p>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', fontSize: '14px', color: '#1e293b', marginTop: '10px', maxHeight: '450px', overflowY: 'auto' }}>
                {aiExplanation}
              </div>
            )}
          </div>

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
