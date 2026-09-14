'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PADDING = 24;
const BOARD_MAX = 520;

type Color = 'B' | 'W';
type Stone = Color | null;
type Point = { x: number; y: number };
type Move = Point & { color: Color };
type SavedGame = { id: string; title: string; created_at: string };

function emptyBoard(size: number): Stone[][] {
  return Array.from({ length: size }, () => Array<Stone>(size).fill(null));
}

function starPoints(size: number) {
  if (size === 19) return [3, 9, 15];
  if (size === 13) return [3, 6, 9];
  return [2, 4, 6];
}

export default function Home() {
  const [boardSize, setBoardSize] = useState(9);
  const [level, setLevel] = useState('입문자');
  const [userColor, setUserColor] = useState<Color>('B');
  const [started, setStarted] = useState(false);
  const [board, setBoard] = useState<Stone[][]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [capturedBlack, setCapturedBlack] = useState(0);
  const [capturedWhite, setCapturedWhite] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [games, setGames] = useState<SavedGame[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const cellSize = Math.floor((BOARD_MAX - PADDING * 2) / (boardSize - 1));
  const boardPixels = (boardSize - 1) * cellSize + PADDING * 2;
  const turn: Color = history.length % 2 === 0 ? 'B' : 'W';
  const userTurn = started && !thinking && turn === userColor;

  const group = useCallback(
    (grid: Stone[][], startX: number, startY: number) => {
      const color = grid[startY]?.[startX];
      if (!color) return { stones: [] as Point[], liberties: 0 };

      const stones: Point[] = [];
      const queue: Point[] = [{ x: startX, y: startY }];
      const seen = new Set([`${startX},${startY}`]);
      const liberties = new Set<string>();

      for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i];
        stones.push({ x, y });

        for (const next of [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ]) {
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
          if (stone === color && !seen.has(key)) {
            seen.add(key);
            queue.push(next);
          }
        }
      }

      return { stones, liberties: liberties.size };
    },
    [boardSize]
  );

  const playMove = useCallback(
    (current: Stone[][], x: number, y: number, color: Color) => {
      if (!current[y] || current[y][x] !== null) return null;

      const next = current.map((row) => [...row]);
      next[y][x] = color;
      const opponent: Color = color === 'B' ? 'W' : 'B';
      let captured = 0;

      for (const near of [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ]) {
        if (
          near.x < 0 ||
          near.y < 0 ||
          near.x >= boardSize ||
          near.y >= boardSize ||
          next[near.y][near.x] !== opponent
        ) {
          continue;
        }

        const enemy = group(next, near.x, near.y);
        if (enemy.liberties === 0) {
          enemy.stones.forEach((stone) => {
            next[stone.y][stone.x] = null;
            captured++;
          });
        }
      }

      if (group(next, x, y).liberties === 0 && captured === 0) return null;
      return { board: next, captured };
    },
    [boardSize, group]
  );

  const sgf = useCallback(
    (moves: Move[]) =>
      `(;GM[1]FF[4]SZ[${boardSize}]KM[6.5]RU[Japanese]${moves
        .map(
          ({ x, y, color }) =>
            `;${color}[${String.fromCharCode(97 + x)}${String.fromCharCode(
              97 + y
            )}]`
        )
        .join('')})`,
    [boardSize]
  );

  const validMoves = useCallback(
    (current: Stone[][], color: Color) => {
      const values: Point[] = [];
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          if (playMove(current, x, y, color)) values.push({ x, y });
        }
      }
      return values;
    },
    [boardSize, playMove]
  );

  const requestAi = useCallback(
    async (current: Stone[][], moves: Move[], prompt: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setThinking(true);

      const aiColor: Color = userColor === 'B' ? 'W' : 'B';

      try {
        const response = await fetch('/api/go-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sgf: sgf(moves),
            level,
            userQuestion: prompt,
          }),
        });

        const data = await response.json();
        let target: Point | null = null;

        if (response.ok && typeof data.result === 'string') {
          setExplanation(data.result);
          const match = data.result.match(
            /NEXT_MOVE\s*:\s*([A-T])\s*(1[0-9]|[1-9])/i
          );

          if (match) {
            let x = match[1].toUpperCase().charCodeAt(0) - 65;
            if (x > 8) x--; // I 열 제외
            const y = boardSize - Number(match[2]);

            if (playMove(current, x, y, aiColor)) target = { x, y };
          }
        } else {
          setExplanation(`AI 오류: ${data.error || '연결 실패'}`);
        }

        if (!target) {
          const candidates = validMoves(current, aiColor);
          target = candidates[Math.floor(Math.random() * candidates.length)] ?? null;
        }

        if (target) {
          const result = playMove(current, target.x, target.y, aiColor);
          if (result) {
            setBoard(result.board);
            setHistory([...moves, { ...target, color: aiColor }]);
            if (aiColor === 'B') setCapturedWhite((v) => v + result.captured);
            else setCapturedBlack((v) => v + result.captured);
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setExplanation('AI 튜터 연결에 실패했습니다. 다시 시도해 주세요.');
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setThinking(false);
        }
      }
    },
    [level, playMove, sgf, userColor, validMoves, boardSize]
  );

  const startGame = () => {
    abortRef.current?.abort();
    setBoard(emptyBoard(boardSize));
    setHistory([]);
    setCapturedBlack(0);
    setCapturedWhite(0);
    setExplanation('대국이 시작되었습니다.');
    setStarted(true);
  };

  useEffect(() => {
    if (started && userColor === 'W' && history.length === 0 && !thinking) {
      void requestAi(board, [], '흑의 첫 수와 간단한 이유를 설명해 주세요.');
    }
  }, [started, userColor, history.length, thinking, board, requestAi]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const clickBoard = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!userTurn) return;

    const rect = event.currentTarget.getBoundingClientRect();

    // CSS 표시 크기와 SVG 내부 좌표계의 차이를 보정한다.
    const svgX = (event.clientX - rect.left) * (boardPixels / rect.width);
    const svgY = (event.clientY - rect.top) * (boardPixels / rect.height);
    const x = Math.round((svgX - PADDING) / cellSize);
    const y = Math.round((svgY - PADDING) / cellSize);

    if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return;

    // 교차점에서 너무 먼 클릭은 무시한다.
    const pointX = PADDING + x * cellSize;
    const pointY = PADDING + y * cellSize;
    if (Math.hypot(svgX - pointX, svgY - pointY) > cellSize * 0.48) return;

    const result = playMove(board, x, y, userColor);
    if (!result) {
      alert('이미 돌이 있거나 자충수인 자리입니다.');
      return;
    }

    const nextHistory = [...history, { x, y, color: userColor }];
    setBoard(result.board);
    setHistory(nextHistory);

    if (userColor === 'B') setCapturedWhite((v) => v + result.captured);
    else setCapturedBlack((v) => v + result.captured);

    const column = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
    void requestAi(
      result.board,
      nextHistory,
      `사용자가 ${column}${boardSize - y}에 착수했습니다. 4단계 강평과 AI 응수를 제공하세요.`
    );
  };

  const loadGames = useCallback(async () => {
    try {
      const response = await fetch('/api/games');
      const data = await response.json();
      if (response.ok) setGames(data.games ?? []);
    } catch {
      // 저장 목록 실패는 대국을 막지 않는다.
    }
  }, []);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  const saveGame = async () => {
    if (!history.length) return alert('대국을 진행한 후 저장해 주세요.');
    setSaving(true);

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `AI 튜터링 (${boardSize}x${boardSize} / ${level})`,
          sgf: sgf(history),
          user_level: level,
          ai_summary: explanation,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '저장 실패');

      alert('기보를 저장했습니다.');
      void loadGames();
    } catch (error) {
      alert(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ maxWidth: 1150, margin: '0 auto', padding: 20 }}>
      <h1>🎓 AI 바둑 튜터 대국실</h1>

      <section
        style={{
          background: '#f0f4f8',
          padding: 16,
          borderRadius: 10,
          marginBottom: 24,
        }}
      >
        <select
          value={boardSize}
          disabled={started}
          onChange={(e) => setBoardSize(Number(e.target.value))}
        >
          <option value={9}>9 × 9</option>
          <option value={13}>13 × 13</option>
          <option value={19}>19 × 19</option>
        </select>{' '}

        <select
          value={level}
          disabled={started}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option>입문자</option>
          <option>초급자</option>
          <option>중급자</option>
          <option>고급자</option>
        </select>{' '}

        <select
          value={userColor}
          disabled={started}
          onChange={(e) => setUserColor(e.target.value as Color)}
        >
          <option value="B">⚫ 흑 (선공)</option>
          <option value="W">⚪ 백 (후공)</option>
        </select>{' '}

        <button onClick={started ? () => setStarted(false) : startGame}>
          {started ? '설정 변경 / 재시작' : '대국 시작'}
        </button>{' '}

        {started && (
          <button disabled={saving} onClick={saveGame}>
            {saving ? '저장 중...' : '기보 저장'}
          </button>
        )}

        {started && (
          <p>
            {thinking
              ? '🤖 AI가 분석 중입니다.'
              : userTurn
                ? '👉 당신의 차례입니다.'
                : '🤖 AI 차례입니다.'}
            {' '}총 {history.length}수 · 흑 따냄 {capturedWhite} · 백 따냄{' '}
            {capturedBlack}
          </p>
        )}
      </section>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div
          style={{
            background: '#dc9d40',
            padding: 12,
            borderRadius: 8,
            width: 'min(100%, 544px)',
          }}
        >
          <svg
            viewBox={`0 0 ${boardPixels} ${boardPixels}`}
            width="100%"
            role="grid"
            aria-label={`${boardSize} x ${boardSize} 바둑판`}
            onClick={clickBoard}
            style={{
              display: 'block',
              cursor: userTurn ? 'pointer' : 'not-allowed',
              touchAction: 'manipulation',
            }}
          >
            {Array.from({ length: boardSize }, (_, i) => (
              <g key={i}>
                <line
                  x1={PADDING}
                  y1={PADDING + i * cellSize}
                  x2={PADDING + (boardSize - 1) * cellSize}
                  y2={PADDING + i * cellSize}
                  stroke="black"
                />
                <line
                  x1={PADDING + i * cellSize}
                  y1={PADDING}
                  x2={PADDING + i * cellSize}
                  y2={PADDING + (boardSize - 1) * cellSize}
                  stroke="black"
                />
              </g>
            ))}

            {starPoints(boardSize).flatMap((x) =>
              starPoints(boardSize).map((y) => (
                <circle
                  key={`${x}-${y}`}
                  cx={PADDING + x * cellSize}
                  cy={PADDING + y * cellSize}
                  r={3}
                />
              ))
            )}

            {board.map((row, y) =>
              row.map((stone, x) => {
                if (!stone) return null;
                const last = history.at(-1);
                const isLast = last?.x === x && last?.y === y;

                return (
                  <g key={`${x}-${y}`}>
                    <circle
                      cx={PADDING + x * cellSize}
                      cy={PADDING + y * cellSize}
                      r={cellSize / 2 - 1}
                      fill={stone === 'B' ? '#111' : '#fafafa'}
                      stroke={stone === 'B' ? '#000' : '#bbb'}
                    />
                    {isLast && (
                      <circle
                        cx={PADDING + x * cellSize}
                        cy={PADDING + y * cellSize}
                        r={4}
                        fill={stone === 'B' ? '#f44' : '#c00'}
                      />
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        <aside style={{ flex: 1, minWidth: 320 }}>
          <section
            style={{
              minHeight: 360,
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
            }}
          >
            <h3>🤖 AI 튜터 실시간 강평 및 분석</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {thinking ? 'AI가 분석 중입니다…' : explanation}
            </div>
          </section>

          <section
            style={{
              marginTop: 20,
              padding: 16,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
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
