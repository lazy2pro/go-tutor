'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PADDING = 24;
const BOARD_MAX = 520;

type Color = 'B' | 'W';
type Stone = Color | null;
type Point = { x: number; y: number };
type Move = Point & { color: Color };
type SavedGame = { id: string; title: string; created_at: string };

const createBoard = (size: number): Stone[][] =>
  Array.from({ length: size }, () => Array<Stone>(size).fill(null));

const getStarPoints = (size: number) => {
  if (size === 19) return [3, 9, 15];
  if (size === 13) return [3, 6, 9];
  return [2, 4, 6];
};

export default function Home() {
  const [boardSize, setBoardSize] = useState(9);
  const [level, setLevel] = useState('입문자');
  const [userColor, setUserColor] = useState<Color>('B');
  const [started, setStarted] = useState(false);

  const [board, setBoard] = useState<Stone[][]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [capturedBlack, setCapturedBlack] = useState(0);
  const [capturedWhite, setCapturedWhite] = useState(0);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [saving, setSaving] = useState(false);
  const [games, setGames] = useState<SavedGame[]>([]);

  const analysisAbortRef = useRef<AbortController | null>(null);

  const cellSize = Math.floor((BOARD_MAX - PADDING * 2) / (boardSize - 1));
  const boardPixels = (boardSize - 1) * cellSize + PADDING * 2;
  const turn: Color = history.length % 2 === 0 ? 'B' : 'W';
  const isUserTurn = started && turn === userColor;

  const getGroup = useCallback(
    (grid: Stone[][], startX: number, startY: number) => {
      const color = grid[startY]?.[startX];
      if (!color) return { stones: [] as Point[], liberties: 0 };

      const stones: Point[] = [];
      const queue: Point[] = [{ x: startX, y: startY }];
      const visited = new Set([`${startX},${startY}`]);
      const liberties = new Set<string>();

      for (let index = 0; index < queue.length; index++) {
        const { x, y } = queue[index];
        stones.push({ x, y });

        const neighbors = [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ];

        for (const next of neighbors) {
          if (
            next.x < 0 ||
            next.y < 0 ||
            next.x >= boardSize ||
            next.y >= boardSize
          ) {
            continue;
          }

          const stone = grid[next.y][next.x];
          const key = `${next.x},${next.y}`;

          if (stone === null) liberties.add(key);

          if (stone === color && !visited.has(key)) {
            visited.add(key);
            queue.push(next);
          }
        }
      }

      return { stones, liberties: liberties.size };
    },
    [boardSize]
  );

  const playMove = useCallback(
    (currentBoard: Stone[][], x: number, y: number, color: Color) => {
      if (!currentBoard[y] || currentBoard[y][x] !== null) return null;

      const nextBoard = currentBoard.map((row) => [...row]);
      nextBoard[y][x] = color;

      const opponent: Color = color === 'B' ? 'W' : 'B';
      let captured = 0;

      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];

      for (const next of neighbors) {
        if (
          next.x < 0 ||
          next.y < 0 ||
          next.x >= boardSize ||
          next.y >= boardSize ||
          nextBoard[next.y][next.x] !== opponent
        ) {
          continue;
        }

        const enemyGroup = getGroup(nextBoard, next.x, next.y);

        if (enemyGroup.liberties === 0) {
          enemyGroup.stones.forEach((stone) => {
            nextBoard[stone.y][stone.x] = null;
            captured++;
          });
        }
      }

      if (getGroup(nextBoard, x, y).liberties === 0 && captured === 0) {
        return null;
      }

      return { board: nextBoard, captured };
    },
    [boardSize, getGroup]
  );

  const getSgf = useCallback(
    (moves: Move[]) => {
      const sequence = moves
        .map(
          ({ x, y, color }) =>
            `;${color}[${String.fromCharCode(97 + x)}${String.fromCharCode(
              97 + y
            )}]`
        )
        .join('');

      return `(;GM[1]FF[4]SZ[${boardSize}]KM[6.5]RU[Japanese]${sequence})`;
    },
    [boardSize]
  );

  const getValidMoves = useCallback(
    (currentBoard: Stone[][], color: Color): Point[] => {
      const moves: Point[] = [];

      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          if (playMove(currentBoard, x, y, color)) moves.push({ x, y });
        }
      }

      return moves;
    },
    [boardSize, playMove]
  );

  // API 응답을 기다리지 않고 즉시 둘 수 있는 빠른 AI 수 선택
  const chooseFastAiMove = useCallback(
    (currentBoard: Stone[][], color: Color): Point | null => {
      const valid = getValidMoves(currentBoard, color);
      if (!valid.length) return null;

      const center = (boardSize - 1) / 2;

      return valid
        .map((move) => ({
          move,
          distance: Math.abs(move.x - center) + Math.abs(move.y - center),
        }))
        .sort((a, b) => a.distance - b.distance)[0].move;
    },
    [boardSize, getValidMoves]
  );

  const requestAnalysis = useCallback(
    async (
      currentHistory: Move[],
      userMove: Move,
      aiMove: Move | null
    ) => {
      analysisAbortRef.current?.abort();

      const controller = new AbortController();
      analysisAbortRef.current = controller;
      setIsAnalyzing(true);

      const userColumn = String.fromCharCode(
        65 + (userMove.x >= 8 ? userMove.x + 1 : userMove.x)
      );
      const userCoordinate = `${userColumn}${boardSize - userMove.y}`;

      const aiCoordinate = aiMove
        ? `${String.fromCharCode(
            65 + (aiMove.x >= 8 ? aiMove.x + 1 : aiMove.x)
          )}${boardSize - aiMove.y}`
        : '패스';

      try {
        const response = await fetch('/api/go-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sgf: getSgf(currentHistory),
            level,
            userQuestion: `사용자가 ${userCoordinate}에 착수했고 AI는 ${aiCoordinate}에 응수했습니다. 짧고 이해하기 쉽게 강평해 주세요.`,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'AI 분석 요청 실패');
        }

        if (typeof data.result === 'string') {
          setExplanation(data.result);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setExplanation(
            error instanceof Error
              ? `AI 분석 오류: ${error.message}`
              : 'AI 분석에 실패했습니다.'
          );
        }
      } finally {
        if (analysisAbortRef.current === controller) {
          analysisAbortRef.current = null;
          setIsAnalyzing(false);
        }
      }
    },
    [boardSize, getSgf, level]
  );

  const applyAiMove = useCallback(
    (currentBoard: Stone[][], currentHistory: Move[]) => {
      const aiColor: Color = userColor === 'B' ? 'W' : 'B';
      const target = chooseFastAiMove(currentBoard, aiColor);

      if (!target) {
        setExplanation('AI가 둘 수 있는 자리가 없습니다.');
        return { board: currentBoard, history: currentHistory, move: null };
      }

      const result = playMove(currentBoard, target.x, target.y, aiColor);

      if (!result) {
        return { board: currentBoard, history: currentHistory, move: null };
      }

      const aiMove: Move = { ...target, color: aiColor };
      const nextHistory = [...currentHistory, aiMove];

      setBoard(result.board);
      setHistory(nextHistory);

      if (aiColor === 'B') {
        setCapturedWhite((value) => value + result.captured);
      } else {
        setCapturedBlack((value) => value + result.captured);
      }

      return { board: result.board, history: nextHistory, move: aiMove };
    },
    [chooseFastAiMove, playMove, userColor]
  );

  const startGame = () => {
    analysisAbortRef.current?.abort();

    const newBoard = createBoard(boardSize);
    setBoard(newBoard);
    setHistory([]);
    setCapturedBlack(0);
    setCapturedWhite(0);
    setExplanation('대국이 시작되었습니다.');
    setStarted(true);

    if (userColor === 'W') {
      const aiResult = applyAiMove(newBoard, []);

      if (aiResult.move) {
        void requestAnalysis(
          aiResult.history,
          aiResult.move,
          aiResult.move
        );
      }
    }
  };

  const handleBoardClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isUserTurn) return;

    const rect = event.currentTarget.getBoundingClientRect();

    // 화면에서 보이는 SVG 크기와 내부 바둑판 좌표를 일치시킨다.
    const svgX = (event.clientX - rect.left) * (boardPixels / rect.width);
    const svgY = (event.clientY - rect.top) * (boardPixels / rect.height);

    const x = Math.round((svgX - PADDING) / cellSize);
    const y = Math.round((svgY - PADDING) / cellSize);

    if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return;

    const pointX = PADDING + x * cellSize;
    const pointY = PADDING + y * cellSize;

    // 교차점과 지나치게 먼 클릭은 무시
    if (Math.hypot(svgX - pointX, svgY - pointY) > cellSize * 0.48) return;

    const userResult = playMove(board, x, y, userColor);

    if (!userResult) {
      alert('이미 돌이 있거나 자충수인 자리입니다.');
      return;
    }

    const userMove: Move = { x, y, color: userColor };
    const afterUserHistory = [...history, userMove];

    setBoard(userResult.board);
    setHistory(afterUserHistory);

    if (userColor === 'B') {
      setCapturedWhite((value) => value + userResult.captured);
    } else {
      setCapturedBlack((value) => value + userResult.captured);
    }

    // AI는 즉시 착수한다.
    const aiResult = applyAiMove(userResult.board, afterUserHistory);

    // 강평은 대국 진행을 막지 않고 별도로 생성한다.
    void requestAnalysis(aiResult.history, userMove, aiResult.move);
  };

  const loadGames = useCallback(async () => {
    try {
      const response = await fetch('/api/games');
      const data = await response.json();

      if (response.ok) setGames(data.games ?? []);
    } catch {
      // 기보 목록 오류는 대국 진행을 방해하지 않는다.
    }
  }, []);

  useEffect(() => {
    void loadGames();

    return () => analysisAbortRef.current?.abort();
  }, [loadGames]);

  const saveGame = async () => {
    if (!history.length) {
      alert('대국을 진행한 후 저장해 주세요.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `AI 튜터링 (${boardSize}x${boardSize} / ${level})`,
          sgf: getSgf(history),
          user_level: level,
          ai_summary: explanation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '기보 저장 실패');
      }

      alert('기보를 저장했습니다.');
      void loadGames();
    } catch (error) {
      alert(error instanceof Error ? error.message : '기보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 1150,
        margin: '0 auto',
        padding: 20,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1>🎓 AI 바둑 튜터 대국실</h1>

      <section
        style={{
          background: '#f0f4f8',
          padding: 16,
          borderRadius: 10,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={boardSize}
            disabled={started}
            onChange={(event) => setBoardSize(Number(event.target.value))}
          >
            <option value={9}>9 × 9</option>
            <option value={13}>13 × 13</option>
            <option value={19}>19 × 19</option>
          </select>

          <select
            value={level}
            disabled={started}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="입문자">입문자</option>
            <option value="초급자">초급자</option>
            <option value="중급자">중급자</option>
            <option value="고급자">고급자</option>
          </select>

          <select
            value={userColor}
            disabled={started}
            onChange={(event) => setUserColor(event.target.value as Color)}
          >
            <option value="B">⚫ 흑 (선공)</option>
            <option value="W">⚪ 백 (후공)</option>
          </select>

          <button onClick={started ? () => setStarted(false) : startGame}>
            {started ? '설정 변경 / 재시작' : '대국 시작'}
          </button>

          {started && (
            <button disabled={saving} onClick={saveGame}>
              {saving ? '저장 중…' : '기보 저장'}
            </button>
          )}
        </div>

        {started && (
          <p style={{ marginBottom: 0 }}>
            {isUserTurn ? '👉 당신의 차례입니다.' : '🤖 AI가 응수했습니다.'}
            {' '}총 {history.length}수 · 흑 따냄 {capturedWhite} · 백 따냄{' '}
            {capturedBlack}
          </p>
        )}
      </section>

      <div
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <section
          style={{
            width: 'min(100%, 544px)',
            height: 'fit-content',
            alignSelf: 'flex-start',
            padding: 12,
            borderRadius: 8,
            background: '#dc9d40',
            boxShadow: '0 4px 12px rgba(0,0,0,.2)',
          }}
        >
          <svg
            viewBox={`0 0 ${boardPixels} ${boardPixels}`}
            width={boardPixels}
            height={boardPixels}
            role="grid"
            aria-label={`${boardSize} x ${boardSize} 바둑판`}
            onClick={handleBoardClick}
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              cursor: isUserTurn ? 'pointer' : 'not-allowed',
              touchAction: 'manipulation',
            }}
          >
            {Array.from({ length: boardSize }, (_, index) => (
              <g key={index}>
                <line
                  x1={PADDING}
                  y1={PADDING + index * cellSize}
                  x2={PADDING + (boardSize - 1) * cellSize}
                  y2={PADDING + index * cellSize}
                  stroke="#111"
                />
                <line
                  x1={PADDING + index * cellSize}
                  y1={PADDING}
                  x2={PADDING + index * cellSize}
                  y2={PADDING + (boardSize - 1) * cellSize}
                  stroke="#111"
                />
              </g>
            ))}

            {getStarPoints(boardSize).flatMap((x) =>
              getStarPoints(boardSize).map((y) => (
                <circle
                  key={`${x}-${y}`}
                  cx={PADDING + x * cellSize}
                  cy={PADDING + y * cellSize}
                  r={3}
                  fill="#111"
                />
              ))
            )}

            {board.map((row, y) =>
              row.map((stone, x) => {
                if (!stone) return null;

                const lastMove = history.at(-1);
                const isLastMove =
                  lastMove?.x === x && lastMove?.y === y;

                return (
                  <g key={`${x}-${y}`}>
                    <circle
                      cx={PADDING + x * cellSize}
                      cy={PADDING + y * cellSize}
                      r={cellSize / 2 - 1}
                      fill={stone === 'B' ? '#111' : '#fafafa'}
                      stroke={stone === 'B' ? '#000' : '#bbb'}
                    />
                    {isLastMove && (
                      <circle
                        cx={PADDING + x * cellSize}
                        cy={PADDING + y * cellSize}
                        r={4}
                        fill={stone === 'B' ? '#ff4d4d' : '#cc0000'}
                      />
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </section>

        <aside style={{ flex: 1, minWidth: 320 }}>
          <section
            style={{
              minHeight: 360,
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#fff',
            }}
          >
            <h3>🤖 AI 튜터 실시간 강평 및 분석</h3>
            {isAnalyzing && (
              <p style={{ color: '#b45309' }}>강평을 작성 중입니다…</p>
            )}
            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: 1.7,
                maxHeight: 420,
                overflowY: 'auto',
              }}
            >
              {explanation}
            </div>
          </section>

          <section
            style={{
              marginTop: 20,
              padding: 16,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#f8fafc',
            }}
          >
            <h3>📁 복기용 대국 보관함</h3>
            {games.length ? (
              <ul>
                {games.map((game) => (
                  <li key={game.id}>
                    {game.title} ({new Date(game.created_at).toLocaleDateString()})
                  </li>
                ))}
              </ul>
            ) : (
              <p>저장된 기보가 없습니다.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
