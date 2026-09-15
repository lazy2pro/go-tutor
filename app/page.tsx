'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PADDING = 38;
const BOARD_PIXEL_MAX = 680;
type Stone = 'B' | 'W' | null;
type Color = Exclude<Stone, null>;
type Move = { x: number; y: number; color: Color };
type Point = { x: number; y: number };
type TutorResult = {
  move: string;
  evaluation: string;
  position: string;
  advice: string;
  reason: string;
};
type SavedGame = { id: string; title: string; created_at: string };

const emptyBoard = (size: number): Stone[][] =>
  Array.from({ length: size }, () => Array<Stone>(size).fill(null));

const serializeBoard = (grid: Stone[][]) =>
  grid.map((row) => row.map((stone) => stone ?? '.').join('')).join('/');

const coordinateName = (x: number, y: number, size: number) => {
  const column = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  return `${column}${size - y}`;
};

const parseCoordinate = (coordinate: string, size: number): Point | null => {
  const match = coordinate.trim().toUpperCase().match(/^([A-HJ-T])(1[0-9]|[1-9])$/);
  if (!match) return null;
  let x = match[1].charCodeAt(0) - 65;
  if (x > 8) x -= 1;
  const y = size - Number(match[2]);
  return x >= 0 && x < size && y >= 0 && y < size ? { x, y } : null;
};

export default function Home() {
  const [boardSize, setBoardSize] = useState(9);
  const [level, setLevel] = useState('입문자');
  const [analysisInterval, setAnalysisInterval] = useState<1 | 2 | 3>(2);
  const [userColor, setUserColor] = useState<Color>('B');
  const [gameStarted, setGameStarted] = useState(false);
  const [board, setBoard] = useState<Stone[][]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [positionHistory, setPositionHistory] = useState<string[]>([]);
  const [capturedB, setCapturedB] = useState(0);
  const [capturedW, setCapturedW] = useState(0);
  const [aiExplanation, setAiExplanation] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [geminiCalls, setGeminiCalls] = useState(0);
  const [games, setGames] = useState<SavedGame[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const aiRequestRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const cellSize = Math.floor((BOARD_PIXEL_MAX - PADDING * 2) / (boardSize - 1));
  const boardPixelSize = (boardSize - 1) * cellSize + PADDING * 2;

  const starPoints = useMemo<Point[]>(() => {
    if (boardSize === 9) {
      return [
        { x: 2, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 4 },
        { x: 2, y: 6 }, { x: 6, y: 6 },
      ];
    }
    const axes = boardSize === 19 ? [3, 9, 15] : [3, 6, 9];
    return axes.flatMap((x) => axes.map((y) => ({ x, y })));
  }, [boardSize]);

  const columnNames = useMemo(
    () => Array.from({ length: boardSize }, (_, x) => String.fromCharCode(65 + (x >= 8 ? x + 1 : x))),
    [boardSize],
  );

  const ensureAudio = useCallback(async () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const playStoneSound = useCallback(async () => {
    if (!soundEnabled) return;
    try {
      const context = await ensureAudio();
      const now = context.currentTime + 0.006;
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 8;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.11;
      master.gain.setValueAtTime(0.92, now);
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      master.connect(compressor).connect(context.destination);

      // 단단한 바둑알이 나무판에 부딪히는 매우 짧은 고주파 충격.
      const stone = context.createOscillator();
      const stoneGain = context.createGain();
      stone.type = 'triangle';
      stone.frequency.setValueAtTime(2100 + Math.random() * 220, now);
      stone.frequency.exponentialRampToValueAtTime(620, now + 0.019);
      stoneGain.gain.setValueAtTime(0.82, now);
      stoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.034);
      stone.connect(stoneGain).connect(master);

      // 실제 접촉음처럼 초반에만 들리는 넓은 대역의 '딱' 소리.
      const noiseLength = Math.floor(context.sampleRate * 0.032);
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) {
        const envelope = Math.exp(-i / (context.sampleRate * 0.0065));
        noiseData[i] = (Math.random() * 2 - 1) * envelope;
      }
      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const noiseGain = context.createGain();
      noise.buffer = noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.value = 2400 + Math.random() * 300;
      filter.Q.value = 0.72;
      noiseGain.gain.setValueAtTime(0.58, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
      noise.connect(filter).connect(noiseGain).connect(master);

      // 두꺼운 목재 판에서 서로 다른 음역으로 울리는 짧은 공명.
      const resonances = [
        { frequency: 168 + Math.random() * 10, gain: 0.34, decay: 0.22 },
        { frequency: 286 + Math.random() * 14, gain: 0.2, decay: 0.16 },
        { frequency: 438 + Math.random() * 18, gain: 0.1, decay: 0.105 },
      ];
      resonances.forEach(({ frequency, gain, decay }) => {
        const oscillator = context.createOscillator();
        const oscillatorGain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillatorGain.gain.setValueAtTime(gain, now);
        oscillatorGain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        oscillator.connect(oscillatorGain).connect(master);
        oscillator.start(now);
        oscillator.stop(now + decay + 0.01);
      });

      // 작은 방에서 들리는 수준의 짧은 초기 반사만 더해 건조한 전자음을 줄인다.
      const impulseLength = Math.floor(context.sampleRate * 0.075);
      const impulse = context.createBuffer(1, impulseLength, context.sampleRate);
      const impulseData = impulse.getChannelData(0);
      for (let i = 0; i < impulseLength; i++) {
        impulseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.016));
      }
      const convolver = context.createConvolver();
      const roomGain = context.createGain();
      convolver.buffer = impulse;
      roomGain.gain.value = 0.075;
      stoneGain.connect(convolver);
      noiseGain.connect(convolver);
      convolver.connect(roomGain).connect(compressor);

      stone.start(now);
      stone.stop(now + 0.04);
      noise.start(now);
      noise.stop(now + 0.035);
      navigator.vibrate?.(12);
    } catch (error) {
      console.warn('착수음을 재생하지 못했습니다.', error);
    }
  }, [ensureAudio, soundEnabled]);

  const getGroupAndLiberties = useCallback((grid: Stone[][], startX: number, startY: number) => {
    const color = grid[startY][startX];
    if (!color) return { group: [] as Point[], liberties: 0 };
    const group: Point[] = [];
    const liberties = new Set<string>();
    const visited = new Set([`${startX},${startY}`]);
    const queue: Point[] = [{ x: startX, y: startY }];

    for (let i = 0; i < queue.length; i++) {
      const point = queue[i];
      group.push(point);
      const neighbors = [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 },
      ];
      for (const neighbor of neighbors) {
        if (neighbor.x < 0 || neighbor.x >= boardSize || neighbor.y < 0 || neighbor.y >= boardSize) continue;
        const neighborColor = grid[neighbor.y][neighbor.x];
        const key = `${neighbor.x},${neighbor.y}`;
        if (neighborColor === null) liberties.add(key);
        if (neighborColor === color && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }
    return { group, liberties: liberties.size };
  }, [boardSize]);

  const playMove = useCallback((grid: Stone[][], x: number, y: number, color: Color) => {
    if (!grid[y] || grid[y][x] !== null) return null;
    const nextBoard = grid.map((row) => [...row]);
    nextBoard[y][x] = color;
    const opponent: Color = color === 'B' ? 'W' : 'B';
    let capturedCount = 0;
    const neighbors = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.x >= boardSize || neighbor.y < 0 || neighbor.y >= boardSize) continue;
      if (nextBoard[neighbor.y][neighbor.x] !== opponent) continue;
      const result = getGroupAndLiberties(nextBoard, neighbor.x, neighbor.y);
      if (result.liberties === 0) {
        result.group.forEach((point) => {
          nextBoard[point.y][point.x] = null;
          capturedCount += 1;
        });
      }
    }

    if (getGroupAndLiberties(nextBoard, x, y).liberties === 0 && capturedCount === 0) return null;
    return { newBoard: nextBoard, capturedCount };
  }, [boardSize, getGroupAndLiberties]);

  const getValidMoves = useCallback((grid: Stone[][], color: Color, positions: string[]) => {
    const valid: Array<Point & { score: number }> = [];
    const stoneCount = grid.flat().filter(Boolean).length;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const move = playMove(grid, x, y, color);
        if (!move || positions.includes(serializeBoard(move.newBoard))) continue;
        const liberties = getGroupAndLiberties(move.newBoard, x, y).liberties;
        const edgeDistance = Math.min(x, y, boardSize - 1 - x, boardSize - 1 - y);
        let nearestStone = boardSize * 2;
        let adjacentOpponent = 0;
        grid.forEach((row, stoneY) => row.forEach((stone, stoneX) => {
          if (!stone) return;
          const distance = Math.abs(stoneX - x) + Math.abs(stoneY - y);
          nearestStone = Math.min(nearestStone, distance);
          if (stone !== color && distance === 1) adjacentOpponent += 1;
        }));
        const openingSpread = stoneCount < 10 ? Math.min(nearestStone, 5) * 2 : 0;
        const score = move.capturedCount * 100 + liberties * 4 + adjacentOpponent * 6
          + Math.min(edgeDistance, 3) * 1.5 + openingSpread + Math.random() * 2;
        valid.push({ x, y, score });
      }
    }
    return valid.sort((a, b) => b.score - a.score);
  }, [boardSize, getGroupAndLiberties, playMove]);

  const generateSgf = useCallback((moves = history) => {
    const nodes = moves
      .map((move) => `;${move.color}[${String.fromCharCode(97 + move.x)}${String.fromCharCode(97 + move.y)}]`)
      .join('');
    return `(;GM[1]FF[4]SZ[${boardSize}]KM[6.5]RU[Japanese]${nodes})`;
  }, [boardSize, history]);

  const startGame = () => {
    if (soundEnabled) void ensureAudio();
    aiRequestRef.current?.abort();
    const freshBoard = emptyBoard(boardSize);
    setBoard(freshBoard);
    setHistory([]);
    setPositionHistory([serializeBoard(freshBoard)]);
    setCapturedB(0);
    setCapturedW(0);
    setGeminiCalls(0);
    setAiExplanation('바둑판의 교차점을 눌러 착수하세요. AI는 응수와 네 가지 짧은 강평을 함께 제공합니다.');
    setIsAiThinking(false);
    setGameStarted(true);
  };

  const stopGame = () => {
    aiRequestRef.current?.abort();
    setIsAiThinking(false);
    setGameStarted(false);
  };

  const applyAiMove = useCallback((
    grid: Stone[][],
    moves: Move[],
    positions: string[],
    aiColor: Color,
    point: Point,
  ) => {
    const move = playMove(grid, point.x, point.y, aiColor);
    if (!move || positions.includes(serializeBoard(move.newBoard))) return false;
    setBoard(move.newBoard);
    setHistory([...moves, { ...point, color: aiColor }]);
    setPositionHistory([...positions, serializeBoard(move.newBoard)]);
    void playStoneSound();
    if (aiColor === 'B') setCapturedW((value) => value + move.capturedCount);
    else setCapturedB((value) => value + move.capturedCount);
    return true;
  }, [playMove, playStoneSound]);

  const playLocalAiMove = useCallback((
    grid: Stone[][],
    moves: Move[],
    positions: string[],
    aiColor: Color,
    message: string,
  ) => {
    const fallback = getValidMoves(grid, aiColor, positions)[0];
    if (!fallback || !applyAiMove(grid, moves, positions, aiColor, fallback)) return false;
    setAiExplanation(
      `${message}\n규칙 엔진 응수 · ${coordinateName(fallback.x, fallback.y, boardSize)}\n이 수는 Gemini 분석이 아닌 합법적인 빠른 응수입니다.`
    );
    return true;
  }, [applyAiMove, boardSize, getValidMoves]);

  const triggerAiMove = useCallback(async (
    grid: Stone[][],
    moves: Move[],
    positions: string[],
    lastMove: string,
  ) => {
    const aiColor: Color = userColor === 'B' ? 'W' : 'B';
    aiRequestRef.current?.abort();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    aiRequestRef.current = controller;
    setIsAiThinking(true);
    setGeminiCalls((count) => count + 1);

    try {
      const response = await fetch('/api/go-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sgf: generateSgf(moves),
          level,
          boardSize,
          aiColor,
          lastMove,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'AI 연결에 실패했습니다.');
      const result = data.result as TutorResult;
      const requested = parseCoordinate(result.move, boardSize);
      let played = requested ? applyAiMove(grid, moves, positions, aiColor, requested) : false;

      if (!played) {
        const fallback = getValidMoves(grid, aiColor, positions)[0];
        if (!fallback) throw new Error('AI가 둘 수 있는 합법적인 착수점이 없습니다.');
        played = applyAiMove(grid, moves, positions, aiColor, fallback);
        result.move = coordinateName(fallback.x, fallback.y, boardSize);
        result.reason = `AI가 제안한 좌표가 둘 수 없어 규칙 엔진이 ${result.move}(으)로 교정했습니다.`;
      }

      if (played) {
        setAiExplanation([
          `AI 응수 · ${result.move}`,
          `1. 착수 평가 · ${result.evaluation}`,
          `2. 형세 판단 · ${result.position}`,
          `3. 다음 계획 · ${result.advice}`,
          `4. 응수 이유 · ${result.reason}`,
        ].join('\n'));
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (aiRequestRef.current === controller) {
          if (!playLocalAiMove(grid, moves, positions, aiColor, 'AI 응답 시간이 초과되었습니다.')) {
            setAiExplanation('AI 응답 시간이 초과되었고 둘 수 있는 대체 착수점이 없습니다.');
          }
        }
        return;
      }
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      const quotaMessage = message.includes('사용량')
        ? 'Gemini 무료 사용량을 모두 사용했습니다.'
        : 'Gemini 연결에 실패했습니다.';
      if (!playLocalAiMove(grid, moves, positions, aiColor, quotaMessage)) {
        setAiExplanation('AI 연결에 실패했고 둘 수 있는 대체 착수점이 없습니다.');
      }
    } finally {
      window.clearTimeout(timeout);
      if (aiRequestRef.current === controller) {
        aiRequestRef.current = null;
        setIsAiThinking(false);
      }
    }
  }, [applyAiMove, boardSize, generateSgf, getValidMoves, level, playLocalAiMove, userColor]);

  useEffect(() => {
    if (gameStarted && userColor === 'W' && history.length === 0 && board.length === boardSize && !isAiThinking) {
      const timer = window.setTimeout(() => {
        void triggerAiMove(board, history, positionHistory, '');
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [board, boardSize, gameStarted, history, isAiThinking, positionHistory, triggerAiMove, userColor]);

  useEffect(() => () => {
    aiRequestRef.current?.abort();
    void audioContextRef.current?.close();
  }, []);

  const handleBoardPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!gameStarted || isAiThinking) return;
    const currentTurn: Color = history.length % 2 === 0 ? 'B' : 'W';
    if (currentTurn !== userColor) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (boardPixelSize / rect.width);
    const svgY = (event.clientY - rect.top) * (boardPixelSize / rect.height);
    const x = Math.round((svgX - PADDING) / cellSize);
    const y = Math.round((svgY - PADDING) / cellSize);
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return;

    const move = playMove(board, x, y, userColor);
    if (!move) return window.alert('이미 돌이 있거나 자충수인 자리입니다.');
    const signature = serializeBoard(move.newBoard);
    if (positionHistory.includes(signature)) return window.alert('패 규칙으로 지금은 그 자리에 둘 수 없습니다.');

    const nextHistory = [...history, { x, y, color: userColor }];
    const nextPositions = [...positionHistory, signature];
    setBoard(move.newBoard);
    setHistory(nextHistory);
    setPositionHistory(nextPositions);
    void playStoneSound();
    if (userColor === 'B') setCapturedW((value) => value + move.capturedCount);
    else setCapturedB((value) => value + move.capturedCount);
    const userMoveCount = nextHistory.filter((playedMove) => playedMove.color === userColor).length;
    const shouldUseGemini = analysisInterval === 1 || (userColor === 'B'
      ? (userMoveCount - 1) % analysisInterval === 0
      : userMoveCount % analysisInterval === 0);
    if (shouldUseGemini) {
      void triggerAiMove(move.newBoard, nextHistory, nextPositions, coordinateName(x, y, boardSize));
    } else {
      const aiColor: Color = userColor === 'B' ? 'W' : 'B';
      if (!playLocalAiMove(
        move.newBoard,
        nextHistory,
        nextPositions,
        aiColor,
        `Gemini 사용량 절약을 위해 ${analysisInterval}수 간격으로 분석합니다.`,
      )) {
        setAiExplanation('규칙 엔진이 둘 수 있는 합법적인 착수점을 찾지 못했습니다.');
      }
    }
  };

  const handleBoardHover = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isUserTurn) return setHoverPoint(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (boardPixelSize / rect.width);
    const svgY = (event.clientY - rect.top) * (boardPixelSize / rect.height);
    const x = Math.round((svgX - PADDING) / cellSize);
    const y = Math.round((svgY - PADDING) / cellSize);
    const nearIntersection = Math.abs(svgX - (PADDING + x * cellSize)) < cellSize * 0.48
      && Math.abs(svgY - (PADDING + y * cellSize)) < cellSize * 0.48;
    if (nearIntersection && x >= 0 && x < boardSize && y >= 0 && y < boardSize && board[y]?.[x] === null) {
      setHoverPoint({ x, y });
    } else {
      setHoverPoint(null);
    }
  };

  const fetchGames = useCallback(async () => {
    try {
      const response = await fetch('/api/games');
      const data = await response.json();
      if (response.ok) setGames(data.games || []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchGames(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchGames]);

  const saveGame = async () => {
    if (history.length === 0) return window.alert('대국을 진행한 후 저장해 주세요.');
    setSaving(true);
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `AI 튜터링 (${boardSize}x${boardSize} / ${level}) - ${new Date().toLocaleDateString()}`,
          sgf: generateSgf(),
          user_level: level,
          ai_summary: aiExplanation,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '서버 오류');
      window.alert('기보와 강평을 저장했습니다.');
      await fetchGames();
    } catch (error: unknown) {
      window.alert(`저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  const isUserTurn = gameStarted && !isAiThinking &&
    ((history.length % 2 === 0 && userColor === 'B') || (history.length % 2 === 1 && userColor === 'W'));
  const lastMove = history.at(-1);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <p className="eyebrow">PRIVATE GO LESSON</p>
            <h1>바둑 한 수</h1>
            <p className="header-copy">처음 배우는 순간부터, 한 수씩 천천히</p>
          </div>
        </div>
        <span className="header-badge"><i /> {gameStarted ? '대국 진행 중' : '연습 준비'}</span>
      </header>

      <section className="control-card" aria-label="대국 설정">
        <div className="settings-grid">
          <label><span>바둑판</span>
            <select value={boardSize} disabled={gameStarted} onChange={(event) => setBoardSize(Number(event.target.value))}>
              <option value={9}>9 × 9</option><option value={13}>13 × 13</option><option value={19}>19 × 19</option>
            </select>
          </label>
          <label><span>난이도</span>
            <select value={level} disabled={gameStarted} onChange={(event) => setLevel(event.target.value)}>
              <option>입문자</option><option>초급자</option><option>중급자</option><option>고급자</option>
            </select>
          </label>
          <label><span>내 돌</span>
            <select value={userColor} disabled={gameStarted} onChange={(event) => setUserColor(event.target.value as Color)}>
              <option value="B">● 흑 · 선공</option><option value="W">○ 백 · 후공</option>
            </select>
          </label>
          <label><span>Gemini 분석 주기</span>
            <select
              value={analysisInterval}
              disabled={gameStarted}
              onChange={(event) => setAnalysisInterval(Number(event.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>매 수 · 품질 우선</option>
              <option value={2}>2수마다 · 균형</option>
              <option value={3}>3수마다 · 절약</option>
            </select>
          </label>
        </div>
        <div className="action-row">
          {!gameStarted
            ? <button className="button primary" onClick={startGame}>대국 시작</button>
            : <button className="button secondary" onClick={stopGame}>설정 변경 · 재시작</button>}
          {gameStarted && <button className="button save" disabled={saving || isAiThinking} onClick={saveGame}>{saving ? '저장 중…' : '기보 저장'}</button>}
          <button
            className="button sound"
            aria-pressed={soundEnabled}
            onClick={() => {
              setSoundEnabled((enabled) => !enabled);
              if (!soundEnabled) void ensureAudio();
            }}
          >
            {soundEnabled ? '🔊 착수음' : '🔇 음소거'}
          </button>
        </div>
        {gameStarted && (
          <div className="status-row" aria-live="polite">
            <div className="move-counter"><small>현재 수순</small><b>{history.length}<em>수</em></b></div>
            <div className="status-details">
              <strong>{isUserTurn ? '당신의 차례' : isAiThinking ? 'AI가 수를 읽는 중…' : 'AI 응수 완료'}</strong>
              {lastMove && <span>마지막 착수 · {lastMove.color === 'B' ? '흑' : '백'} {coordinateName(lastMove.x, lastMove.y, boardSize)}</span>}
              <span>흑 따냄 {capturedW} · 백 따냄 {capturedB}</span>
              <span>이번 대국 Gemini 호출 {geminiCalls}회</span>
            </div>
          </div>
        )}
      </section>

      <section className="game-layout">
        <div className="board-area">
        <div className={`board-card ${gameStarted ? '' : 'disabled'}`}>
          <span className="board-sheen" aria-hidden="true" />
          <svg
            viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
            role="grid"
            aria-label={`${boardSize} x ${boardSize} 바둑판`}
            onPointerUp={handleBoardPointer}
            onPointerMove={handleBoardHover}
            onPointerLeave={() => setHoverPoint(null)}
            className={isUserTurn ? 'board active' : 'board'}
          >
            <defs>
              <linearGradient id="boardWood" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f1ca7f" />
                <stop offset="0.28" stopColor="#e6b35d" />
                <stop offset="0.7" stopColor="#d99a3f" />
                <stop offset="1" stopColor="#bf772a" />
              </linearGradient>
              <radialGradient id="boardLight" cx="30%" cy="18%" r="86%">
                <stop offset="0" stopColor="#fff4ce" stopOpacity=".35" />
                <stop offset=".55" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#6f350d" stopOpacity=".22" />
              </radialGradient>
              <radialGradient id="blackStone" cx="32%" cy="24%" r="72%">
                <stop offset="0" stopColor="#747879" />
                <stop offset="0.12" stopColor="#343839" />
                <stop offset="0.42" stopColor="#151819" />
                <stop offset="0.82" stopColor="#060708" />
                <stop offset="1" stopColor="#020303" />
              </radialGradient>
              <radialGradient id="whiteStone" cx="31%" cy="23%" r="75%">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.23" stopColor="#fdfcf7" />
                <stop offset="0.62" stopColor="#ebe8df" />
                <stop offset="0.88" stopColor="#d2cec3" />
                <stop offset="1" stopColor="#b8b4aa" />
              </radialGradient>
              <linearGradient id="stoneGlint" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".72" />
                <stop offset=".48" stopColor="#fff" stopOpacity=".08" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <filter id="stoneShadow" x="-40%" y="-40%" width="180%" height="190%">
                <feDropShadow dx="2.2" dy="4.6" stdDeviation="3.4" floodColor="#351805" floodOpacity="0.58" />
              </filter>
              <filter id="woodGrain" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.008 0.12" numOctaves="2" seed="18" />
                <feColorMatrix type="saturate" values="0" />
              </filter>
            </defs>
            <rect width={boardPixelSize} height={boardPixelSize} rx="10" fill="url(#boardWood)" />
            <rect width={boardPixelSize} height={boardPixelSize} rx="10" filter="url(#woodGrain)" opacity="0.115" className="wood-texture" />
            <rect width={boardPixelSize} height={boardPixelSize} rx="10" fill="url(#boardLight)" />
            {Array.from({ length: 15 }, (_, i) => (
              <path
                key={`grain-${i}`}
                d={`M 0 ${20 + i * (boardPixelSize / 14)} C ${boardPixelSize * .25} ${12 + i * (boardPixelSize / 14)}, ${boardPixelSize * .62} ${31 + i * (boardPixelSize / 14)}, ${boardPixelSize} ${17 + i * (boardPixelSize / 14)}`}
                className="grain-line"
              />
            ))}
            {Array.from({ length: boardSize }, (_, i) => (
              <g key={i}>
                <line x1={PADDING} y1={PADDING + i * cellSize} x2={boardPixelSize - PADDING} y2={PADDING + i * cellSize} />
                <line x1={PADDING + i * cellSize} y1={PADDING} x2={PADDING + i * cellSize} y2={boardPixelSize - PADDING} />
              </g>
            ))}
            {columnNames.map((column, i) => (
              <g key={`column-${column}`} className="coordinate-labels">
                <text x={PADDING + i * cellSize} y={PADDING - 15}>{column}</text>
                <text x={PADDING + i * cellSize} y={boardPixelSize - PADDING + 21}>{column}</text>
              </g>
            ))}
            {Array.from({ length: boardSize }, (_, i) => (
              <g key={`row-${i}`} className="coordinate-labels">
                <text x={PADDING - 17} y={PADDING + i * cellSize + 3}>{boardSize - i}</text>
                <text x={boardPixelSize - PADDING + 17} y={PADDING + i * cellSize + 3}>{boardSize - i}</text>
              </g>
            ))}
            {starPoints.map(({ x, y }) => (
              <circle key={`${x}-${y}`} cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r={Math.max(3.2, cellSize * .075)} className="star-point" />
            ))}
            {hoverPoint && board[hoverPoint.y]?.[hoverPoint.x] === null && (
              <circle
                cx={PADDING + hoverPoint.x * cellSize}
                cy={PADDING + hoverPoint.y * cellSize}
                r={cellSize * 0.455}
                fill={userColor === 'B' ? 'url(#blackStone)' : 'url(#whiteStone)'}
                className="ghost-stone"
              />
            )}
            {board.flatMap((row, y) => row.map((stone, x) => {
              if (!stone) return null;
              const last = history.at(-1);
              const isLast = last?.x === x && last?.y === y;
              return (
                <g key={`${x}-${y}`} className={isLast ? 'stone-group latest' : 'stone-group'}>
                  <circle
                    cx={PADDING + x * cellSize}
                    cy={PADDING + y * cellSize}
                    r={cellSize * 0.455}
                    fill={stone === 'B' ? 'url(#blackStone)' : 'url(#whiteStone)'}
                    filter="url(#stoneShadow)"
                    className={stone === 'B' ? 'black-stone' : 'white-stone'}
                  />
                  <ellipse
                    cx={PADDING + x * cellSize - cellSize * .12}
                    cy={PADDING + y * cellSize - cellSize * .17}
                    rx={cellSize * .2}
                    ry={cellSize * .1}
                    fill="url(#stoneGlint)"
                    className={stone === 'B' ? 'black-glint' : 'white-glint'}
                  />
                  {isLast && <circle cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r={Math.max(3, cellSize * 0.08)} className={stone === 'B' ? 'last-on-black' : 'last-on-white'} />}
                </g>
              );
            }))}
          </svg>
        </div>
        <div className="board-meta" aria-hidden="true">
          <span>天然木 질감</span><i />
          <strong>{boardSize} × {boardSize}</strong>
        </div>
        </div>

        <div className="side-column">
          <article className="analysis-card" aria-live="polite">
            <div className="card-heading"><span>AI</span><h2>실시간 강평</h2></div>
            {!gameStarted
              ? <p className="muted">설정을 고른 뒤 대국을 시작하세요.</p>
              : isAiThinking
                ? <div className="thinking"><i /><span>현재 판을 분석하고 응수를 고르고 있습니다.</span></div>
                : <div className="analysis-text">{aiExplanation}</div>}
          </article>
          <article className="archive-card">
            <div className="card-heading"><span>棋</span><h2>저장한 기보</h2></div>
            {games.length === 0
              ? <p className="muted">저장된 기보가 없습니다.</p>
              : <ul>{games.map((game) => <li key={game.id}><strong>{game.title}</strong><small>{new Date(game.created_at).toLocaleDateString()}</small></li>)}</ul>}
          </article>
        </div>
      </section>
    </main>
  );
}
