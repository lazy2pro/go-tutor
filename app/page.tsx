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
type TutorialLesson = {
  id: number;
  title: string;
  shortTitle: string;
  concept: string;
  instruction: string;
  successText: string;
  initialStones: Move[];
  targetPoints: Point[];
  hintPoints: Point[];
  player: Color;
};
type TutorialCourse = {
  id: 'beginner' | 'elementary' | 'intermediate' | 'advanced';
  label: string;
  title: string;
  description: string;
  boardSize: 9 | 13 | 19;
  lessons: TutorialLesson[];
  units: CurriculumUnit[];
};
type CurriculumUnit = {
  title: string;
  goal: string;
  lessonIds: number[];
  checkpoint: string;
};

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

const BEGINNER_LESSONS: TutorialLesson[] = [
  {
    id: 1, shortTitle: '첫 착수', title: '교차점에 돌을 놓아요', concept: '바둑돌은 선 위가 아니라 선과 선이 만나는 교차점에 둡니다.',
    instruction: '가운데의 E5 교차점을 눌러 흑돌을 놓아 보세요.', successText: '좋아요! 바둑은 이렇게 교차점에 돌을 놓으며 시작합니다.',
    initialStones: [], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
  {
    id: 2, shortTitle: '활로', title: '돌이 숨 쉴 곳, 활로', concept: '돌의 상하좌우에 있는 빈 교차점을 활로라고 합니다.',
    instruction: '가운데 흑돌의 활로 중 하나에 흑돌을 놓아 연결해 보세요.', successText: '맞습니다. 빈 교차점이 있어 돌무리는 살아 있을 수 있습니다.',
    initialStones: [{ x: 4, y: 4, color: 'B' }], targetPoints: [{ x: 4, y: 3 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 5 }], hintPoints: [{ x: 4, y: 3 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 5 }], player: 'B',
  },
  {
    id: 3, shortTitle: '따내기', title: '활로를 모두 막으면 따낼 수 있어요', concept: '상대 돌의 활로를 모두 막으면 그 돌을 바둑판에서 걷어냅니다.',
    instruction: '백 E5의 마지막 활로인 E6에 흑돌을 놓아 백돌을 따내 보세요.', successText: '따냈습니다! 상대 돌의 활로가 0개가 되면 돌이 바둑판에서 사라집니다.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
  {
    id: 4, shortTitle: '연결', title: '내 돌을 단단히 연결해요', concept: '상하좌우로 맞닿은 같은 색 돌은 하나의 돌무리로 연결됩니다.',
    instruction: '떨어진 두 흑돌 사이 E5에 흑돌을 놓아 연결해 보세요.', successText: '연결 성공! 이제 두 돌은 활로를 함께 쓰는 하나의 돌무리입니다.',
    initialStones: [{ x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
  {
    id: 5, shortTitle: '탈출', title: '단수에 걸린 돌을 살려요', concept: '활로가 하나만 남은 상태를 단수라고 합니다.',
    instruction: '단수에 걸린 흑돌을 살릴 수 있는 E6에 흑돌을 놓아 보세요.', successText: '잘 살렸어요! 단수일 때는 먼저 활로를 늘릴 수 있는지 찾아보세요.',
    initialStones: [{ x: 4, y: 4, color: 'B' }, { x: 3, y: 4, color: 'W' }, { x: 5, y: 4, color: 'W' }, { x: 4, y: 5, color: 'W' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
  {
    id: 6, shortTitle: '집', title: '돌로 빈 공간을 감싸요', concept: '내 돌로 둘러싼 빈 공간은 대국이 끝났을 때 집이 됩니다.',
    instruction: '흑돌로 둘러싸인 빈칸 E5에 놓아 공간을 완성해 보세요.', successText: '좋습니다. 이렇게 돌로 공간을 확보하는 것이 바둑의 목표입니다.',
    initialStones: [{ x: 4, y: 3, color: 'B' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
  {
    id: 7, shortTitle: '패', title: '같은 모양을 바로 되풀이할 수 없어요', concept: '방금 잡힌 자리를 곧바로 되따내어 같은 판을 반복하는 것은 패 규칙으로 막습니다.',
    instruction: 'E6에 흑돌을 놓아 백돌을 잡아 보세요. 실제 대국에서는 바로 되따낼 수 없습니다.', successText: '좋아요. 방금 생긴 모양을 즉시 되풀이하지 못하게 하는 것이 패 규칙입니다.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
];

const ELEMENTARY_LESSONS: TutorialLesson[] = [
  {
    id: 1, shortTitle: '단수 만들기', title: '상대 돌의 활로를 하나로 줄여요', concept: '상대 돌의 남은 활로가 하나가 되면 다음 수에 따낼 위협이 생깁니다.',
    instruction: '백 E5의 활로를 하나만 남기도록 E4에 흑돌을 놓아 보세요.', successText: '좋습니다. 백돌은 이제 E6 한 곳만 남아 단수입니다.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }], targetPoints: [{ x: 4, y: 5 }], hintPoints: [{ x: 4, y: 5 }], player: 'B',
  },
  {
    id: 2, shortTitle: '한 칸 뜀', title: '돌을 너무 붙이지 않고 전진해요', concept: '한 칸 뜀은 돌 사이에 한 칸을 두고 넓게 전진하는 기본 모양입니다.',
    instruction: 'D5의 흑돌에서 한 칸 뛰는 F5에 흑돌을 놓아 보세요.', successText: '좋아요. 너무 붙지 않고도 돌의 세력을 넓힐 수 있습니다.',
    initialStones: [{ x: 3, y: 4, color: 'B' }], targetPoints: [{ x: 5, y: 4 }], hintPoints: [{ x: 5, y: 4 }], player: 'B',
  },
  {
    id: 3, shortTitle: '모서리', title: '모서리는 적은 돌로 감싸기 쉬워요', concept: '바둑판의 가장자리는 바깥쪽을 이미 판이 막아주므로 공간을 만들기 좋습니다.',
    instruction: '좌상귀의 C7에 흑돌을 놓아 모서리에서 시작해 보세요.', successText: '좋습니다. 초반에는 모서리부터 공간을 확보하는 생각을 할 수 있습니다.',
    initialStones: [], targetPoints: [{ x: 2, y: 2 }], hintPoints: [{ x: 2, y: 2 }], player: 'B',
  },
  {
    id: 4, shortTitle: '지키기', title: '약한 돌을 먼저 안정시켜요', concept: '상대에게 둘러싸인 돌은 공격보다 활로를 늘려 안전하게 만드는 편이 좋습니다.',
    instruction: '단수인 E5 흑돌을 살리는 E6에 흑돌을 놓아 보세요.', successText: '정확합니다. 위험한 돌을 먼저 지키면 이후에 더 편하게 둘 수 있습니다.',
    initialStones: [{ x: 4, y: 4, color: 'B' }, { x: 3, y: 4, color: 'W' }, { x: 5, y: 4, color: 'W' }, { x: 4, y: 5, color: 'W' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
];

const INTERMEDIATE_LESSONS: TutorialLesson[] = [
  {
    id: 1, shortTitle: '끊기', title: '상대의 연결을 약하게 만들어요', concept: '상대 돌 사이의 빈 교차점에 두면 연결을 방해할 수 있습니다.',
    instruction: '백 D5와 F5 사이의 E5에 흑돌을 놓아 연결을 막아 보세요.', successText: '좋습니다. 상대 돌이 한 덩어리가 되지 못하게 하는 것이 끊기입니다.',
    initialStones: [{ x: 3, y: 4, color: 'W' }, { x: 5, y: 4, color: 'W' }], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
  {
    id: 2, shortTitle: '두 눈', title: '살아 있는 돌의 모양을 만들어요', concept: '상대가 모두 막을 수 없는 두 개의 빈 공간이 있으면 돌무리는 보통 살아 있습니다.',
    instruction: '흑돌 사이의 E5를 메워 첫 번째 눈 모양을 완성해 보세요.', successText: '좋아요. 실제 사활에서는 눈이 몇 개인지와 상대가 막을 수 있는지를 함께 살펴야 합니다.',
    initialStones: [{ x: 4, y: 3, color: 'B' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
  {
    id: 3, shortTitle: '선수', title: '상대가 답해야 하는 수를 찾아요', concept: '상대가 대응하지 않으면 돌을 잃는 수는 주도권을 잡는 데 도움이 됩니다.',
    instruction: '백 E5를 바로 잡는 E6에 흑돌을 놓아 보세요.', successText: '따내는 수는 상대가 반드시 확인해야 하는 강한 위협이 될 수 있습니다.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
  {
    id: 4, shortTitle: '끝내기', title: '경계 한 칸도 점수가 됩니다', concept: '전투가 잦아든 뒤에는 내 집을 넓히고 상대 집을 줄이는 작은 수가 중요합니다.',
    instruction: '아래쪽 경계를 넓히는 E3에 흑돌을 놓아 보세요.', successText: '좋습니다. 작은 한 칸도 대국 막바지에는 승패를 바꿀 수 있습니다.',
    initialStones: [{ x: 3, y: 6, color: 'B' }, { x: 4, y: 6, color: 'B' }, { x: 5, y: 6, color: 'B' }], targetPoints: [{ x: 4, y: 6 - 1 }], hintPoints: [{ x: 4, y: 5 }], player: 'B',
  },
];

const ADVANCED_LESSONS: TutorialLesson[] = [
  {
    id: 1, shortTitle: '수상전', title: '서로의 활로 수를 비교해요', concept: '서로 잡으려는 돌무리에서는 누가 더 많은 활로를 남겼는지 먼저 세어야 합니다.',
    instruction: '백 E5의 마지막 활로 E6을 막아 수상전을 끝내 보세요.', successText: '좋습니다. 수상전은 감으로 두기보다 양쪽 활로를 세는 것이 먼저입니다.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
  {
    id: 2, shortTitle: '패싸움', title: '패를 활용할 때는 큰 위협이 필요해요', concept: '패를 다시 따내기 전에 상대가 응답해야 할 충분히 큰 위협을 만드는 것이 핵심입니다.',
    instruction: '우선 백돌을 잡는 E6에 흑돌을 놓아 패의 출발 모양을 확인해 보세요.', successText: '이제 백이 즉시 되따낼 수 없는 패 규칙을 떠올려 보세요.',
    initialStones: [{ x: 4, y: 4, color: 'W' }, { x: 3, y: 4, color: 'B' }, { x: 5, y: 4, color: 'B' }, { x: 4, y: 5, color: 'B' }], targetPoints: [{ x: 4, y: 3 }], hintPoints: [{ x: 4, y: 3 }], player: 'B',
  },
  {
    id: 3, shortTitle: '방향', title: '강한 돌보다는 약한 돌을 향해요', concept: '상대의 이미 단단한 돌을 더 강하게 만들기보다 약한 돌을 압박하는 방향을 찾습니다.',
    instruction: '좌측의 약한 백돌 쪽 D5에 흑돌을 놓아 압박해 보세요.', successText: '좋습니다. 수의 방향은 돌 하나보다 전체 돌무리의 강약을 보고 정합니다.',
    initialStones: [{ x: 2, y: 4, color: 'W' }, { x: 6, y: 4, color: 'W' }, { x: 7, y: 4, color: 'W' }, { x: 6, y: 5, color: 'W' }], targetPoints: [{ x: 3, y: 4 }], hintPoints: [{ x: 3, y: 4 }], player: 'B',
  },
  {
    id: 4, shortTitle: '형세 판단', title: '판 전체를 보고 큰 곳을 찾습니다', concept: '한 곳의 싸움에만 몰입하지 않고, 아직 아무도 차지하지 않은 넓은 곳을 함께 봅니다.',
    instruction: '가장 넓게 남은 중앙 E5에 흑돌을 놓아 큰 곳을 선점해 보세요.', successText: '좋습니다. 다음 수를 고를 때는 국지전뿐 아니라 판 전체의 빈 공간도 비교해 보세요.',
    initialStones: [{ x: 1, y: 1, color: 'B' }, { x: 7, y: 1, color: 'W' }, { x: 1, y: 7, color: 'W' }, { x: 7, y: 7, color: 'B' }], targetPoints: [{ x: 4, y: 4 }], hintPoints: [{ x: 4, y: 4 }], player: 'B',
  },
];

const TUTORIAL_COURSES: TutorialCourse[] = [
  {
    id: 'beginner', label: '입문', title: '9×9 첫 대국을 위한 기초 코스', description: '한 문제씩 건너뛰는 목록이 아니라, 규칙부터 첫 대국까지 이어지는 필수 코스입니다.', boardSize: 9, lessons: BEGINNER_LESSONS,
    units: [
      { title: '1단원 · 돌의 생명', goal: '교차점·활로·따내기를 직접 해 봅니다.', lessonIds: [1, 2, 3], checkpoint: '상대 돌의 마지막 활로를 찾아 따낼 수 있나요?' },
      { title: '2단원 · 내 돌 살리기', goal: '연결과 단수 탈출로 내 돌을 안전하게 만듭니다.', lessonIds: [4, 5], checkpoint: '공격하기 전, 내 돌의 활로부터 확인할 수 있나요?' },
      { title: '3단원 · 바둑의 목표', goal: '집과 패 규칙을 알고 9×9 한 판을 시작합니다.', lessonIds: [6, 7], checkpoint: '돌을 많이 잡는 것보다 안전한 집을 만드는 이유를 설명할 수 있나요?' },
    ],
  },
  {
    id: 'elementary', label: '초급', title: '첫 승리를 위한 9×9 실전 코스', description: '상대를 급히 잡으려 하지 않고, 내 돌을 살리며 모서리부터 넓히는 훈련입니다.', boardSize: 9, lessons: ELEMENTARY_LESSONS,
    units: [
      { title: '1단원 · 위험을 읽기', goal: '단수와 약한 돌을 먼저 발견합니다.', lessonIds: [1, 4], checkpoint: '한 수를 두기 전에 양쪽 돌의 활로를 셀 수 있나요?' },
      { title: '2단원 · 넓고 안전하게', goal: '모서리와 한 칸 뜀으로 안정적으로 확장합니다.', lessonIds: [2, 3], checkpoint: '돌을 붙이기보다 넓게 둘 자리를 찾을 수 있나요?' },
    ],
  },
  {
    id: 'intermediate', label: '중급', title: '싸움과 끝내기를 잇는 코스', description: '돌의 강약을 보고 끊기·사활·선수·끝내기를 순서대로 연습합니다.', boardSize: 9, lessons: INTERMEDIATE_LESSONS,
    units: [
      { title: '1단원 · 싸움의 기본', goal: '끊기와 두 눈의 의미를 구분합니다.', lessonIds: [1, 2], checkpoint: '상대의 연결과 내 돌의 삶 중 무엇이 급한지 판단할 수 있나요?' },
      { title: '2단원 · 주도권과 점수', goal: '선수와 끝내기의 가치를 비교합니다.', lessonIds: [3, 4], checkpoint: '지금 당장 답해야 하는 수와 큰 곳을 구분할 수 있나요?' },
    ],
  },
  {
    id: 'advanced', label: '고급', title: '전체 판을 읽는 심화 코스', description: '정답 암기가 아니라 활로 계산, 패의 가치, 수의 방향과 전체 형세를 연결합니다.', boardSize: 9, lessons: ADVANCED_LESSONS,
    units: [
      { title: '1단원 · 계산과 패', goal: '싸움에서 활로 수와 패의 대가를 먼저 봅니다.', lessonIds: [1, 2], checkpoint: '패를 시작하기 전에 대가가 충분한지 설명할 수 있나요?' },
      { title: '2단원 · 전체 판의 방향', goal: '강한 돌이 아니라 약한 돌과 큰 곳을 향합니다.', lessonIds: [3, 4], checkpoint: '국지전보다 큰 곳이 우선인 순간을 찾을 수 있나요?' },
    ],
  },
];

export default function Home() {
  const [appMode, setAppMode] = useState<'learn' | 'play'>('learn');
  const [selectedCourseId, setSelectedCourseId] = useState<TutorialCourse['id']>('beginner');
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [lessonFeedback, setLessonFeedback] = useState('');
  const [completedLessonKeys, setCompletedLessonKeys] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState(9);
  const [level, setLevel] = useState('입문자');
  const [analysisInterval, setAnalysisInterval] = useState<1 | 2 | 3>(2);
  const [userColor, setUserColor] = useState<Color>('B');
  const [gameStarted, setGameStarted] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<Color>('B');
  const [passStreak, setPassStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameEndMessage, setGameEndMessage] = useState('');
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

  const selectedCourse = useMemo(
    () => TUTORIAL_COURSES.find((course) => course.id === selectedCourseId) ?? TUTORIAL_COURSES[0],
    [selectedCourseId],
  );
  const activeLesson = useMemo(
    () => selectedCourse.lessons.find((lesson) => lesson.id === activeLessonId) ?? null,
    [activeLessonId, selectedCourse],
  );
  const courseLessonSequence = selectedCourse.units.flatMap((unit) => unit.lessonIds)
    .map((id) => selectedCourse.lessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is TutorialLesson => Boolean(lesson));
  const completedCourseCount = completedLessonKeys.filter((key) => key.startsWith(`${selectedCourseId}-`)).length;
  const nextLesson = courseLessonSequence.find(
    (lesson) => !completedLessonKeys.includes(`${selectedCourse.id}-${lesson.id}`),
  ) ?? null;
  const isLessonUnlocked = (lesson: TutorialLesson) => {
    const lessonIndex = courseLessonSequence.findIndex((item) => item.id === lesson.id);
    if (lessonIndex <= 0) return true;
    const previous = courseLessonSequence[lessonIndex - 1];
    return completedLessonKeys.includes(`${selectedCourse.id}-${previous.id}`);
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('go-tutor-completed-lessons');
      if (saved) setCompletedLessonKeys(JSON.parse(saved) as string[]);
    } catch {
      // 학습 진행 저장이 불가능한 환경에서도 튜토리얼은 정상적으로 진행한다.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('go-tutor-completed-lessons', JSON.stringify(completedLessonKeys));
    } catch {
      // 저장 권한이 없으면 현재 화면의 진행 상태만 유지한다.
    }
  }, [completedLessonKeys]);

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

  const getValidMoves = useCallback((grid: Stone[][], color: Color, positions: string[], difficulty = level) => {
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
        const standardScore = move.capturedCount * 100 + liberties * 4 + adjacentOpponent * 6
          + Math.min(edgeDistance, 3) * 1.5 + openingSpread + Math.random() * 2;
        // 입문 연습 AI는 따내기와 접촉전을 의도적으로 피하고, 넓고 안전한 자리를 우선한다.
        // 따라서 강한 엔진처럼 사용자의 돌을 바로 공격하지 않는다.
        const beginnerScore = Math.min(liberties, 5) * 5
          + Math.min(edgeDistance, 2) * 3
          + openingSpread * 1.8
          - move.capturedCount * 180
          - adjacentOpponent * 7
          + Math.random() * 18;
        const score = difficulty === '입문자' ? beginnerScore : standardScore;
        valid.push({ x, y, score });
      }
    }
    return valid.sort((a, b) => b.score - a.score);
  }, [boardSize, getGroupAndLiberties, level, playMove]);

  const generateSgf = useCallback((moves = history) => {
    const nodes = moves
      .map((move) => `;${move.color}[${String.fromCharCode(97 + move.x)}${String.fromCharCode(97 + move.y)}]`)
      .join('');
    return `(;GM[1]FF[4]SZ[${boardSize}]KM[6.5]RU[Japanese]${nodes})`;
  }, [boardSize, history]);

  const startLesson = (lesson: TutorialLesson) => {
    if (soundEnabled) void ensureAudio();
    aiRequestRef.current?.abort();
    const lessonBoard = emptyBoard(selectedCourse.boardSize);
    lesson.initialStones.forEach((stone) => { lessonBoard[stone.y][stone.x] = stone.color; });
    setAppMode('learn');
    setBoardSize(selectedCourse.boardSize);
    setUserColor(lesson.player);
    setBoard(lessonBoard);
    setHistory(lesson.initialStones);
    setPositionHistory([serializeBoard(lessonBoard)]);
    setCapturedB(0);
    setCapturedW(0);
    setGeminiCalls(0);
    setCurrentTurn('B');
    setPassStreak(0);
    setGameOver(false);
    setGameEndMessage('');
    setAiExplanation(`${selectedCourse.label} · ${lesson.title}\n${lesson.concept}\n\n${lesson.instruction}`);
    setLessonFeedback('');
    setLessonComplete(false);
    setActiveLessonId(lesson.id);
    setIsAiThinking(false);
    setGameStarted(true);
  };

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
    setCurrentTurn('B');
    setPassStreak(0);
    setGameOver(false);
    setGameEndMessage('');
    setAppMode('play');
    setActiveLessonId(null);
    setLessonComplete(false);
    setLessonFeedback('');
    setAiExplanation(level === '입문자'
      ? '입문 연습 대국입니다. AI는 Gemini를 사용하지 않고, 따내기와 강한 공격을 피하며 둡니다.'
      : '바둑판의 교차점을 눌러 착수하세요. AI는 응수와 네 가지 짧은 강평을 함께 제공합니다.');
    setIsAiThinking(false);
    setGameStarted(true);
  };

  const stopGame = () => {
    aiRequestRef.current?.abort();
    setIsAiThinking(false);
    setGameStarted(false);
    setGameOver(false);
    setGameEndMessage('');
    setActiveLessonId(null);
    setLessonComplete(false);
  };

  const finishGame = useCallback((message: string) => {
    aiRequestRef.current?.abort();
    setIsAiThinking(false);
    setGameStarted(false);
    setGameOver(true);
    setGameEndMessage(message);
    setHoverPoint(null);
    setAiExplanation(`${message}\n\n현재 앱은 집 계산을 구현하지 않아 승패를 추정하지 않습니다. 기보를 저장해 복기할 수 있습니다.`);
  }, []);

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
    setCurrentTurn(aiColor === 'B' ? 'W' : 'B');
    setPassStreak(0);
    void playStoneSound();
    if (aiColor === 'B') setCapturedW((value) => value + move.capturedCount);
    else setCapturedB((value) => value + move.capturedCount);
    return true;
  }, [playMove, playStoneSound]);

  const handleAiPass = useCallback((grid: Stone[][], aiColor: Color, message: string) => {
    const userMoves = getValidMoves(grid, aiColor === 'B' ? 'W' : 'B', positionHistory, level);
    if (passStreak >= 1 || userMoves.length === 0) {
      finishGame('종국 · 양쪽 모두 둘 수 있는 합법적인 수가 없어 대국을 종료했습니다.');
      return;
    }
    setCurrentTurn(aiColor === 'B' ? 'W' : 'B');
    setPassStreak(1);
    setAiExplanation(`${message}\nAI가 둘 수 있는 합법적인 착수점이 없어 패스했습니다. 당신의 차례입니다.`);
  }, [finishGame, getValidMoves, level, passStreak, positionHistory]);

  const playLocalAiMove = useCallback((
    grid: Stone[][],
    moves: Move[],
    positions: string[],
    aiColor: Color,
    message: string,
  ) => {
    const candidates = getValidMoves(grid, aiColor, positions, level);
    // 입문자는 상위 후보 중 하나를 무작위로 선택해 예측 가능한 최선수를 피한다.
    const fallback = level === '입문자'
      ? candidates[Math.floor(Math.random() * Math.min(8, candidates.length))]
      : candidates[0];
    if (!fallback) {
      handleAiPass(grid, aiColor, message);
      return true;
    }
    if (!applyAiMove(grid, moves, positions, aiColor, fallback)) return false;
    setAiExplanation(
      `${message}\n규칙 엔진 응수 · ${coordinateName(fallback.x, fallback.y, boardSize)}\n${level === '입문자' ? '입문 연습 AI는 따내기와 강한 공격을 피하면서 둡니다.' : '이 수는 Gemini 분석이 아닌 합법적인 빠른 응수입니다.'}`
    );
    return true;
  }, [applyAiMove, boardSize, getValidMoves, handleAiPass, level]);

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
        if (!fallback) {
          handleAiPass(grid, aiColor, 'AI가 둘 수 있는 합법적인 착수점을 찾지 못했습니다.');
          return;
        }
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
  }, [applyAiMove, boardSize, generateSgf, getValidMoves, handleAiPass, level, playLocalAiMove, userColor]);

  useEffect(() => {
    if (gameStarted && !activeLesson && userColor === 'W' && currentTurn === 'B' && history.length === 0 && board.length === boardSize && !isAiThinking) {
      const timer = window.setTimeout(() => {
        if (level === '입문자') {
          playLocalAiMove(board, history, positionHistory, 'B', '입문 연습 AI가 첫 수를 두었습니다.');
        } else {
          void triggerAiMove(board, history, positionHistory, '');
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeLesson, board, boardSize, currentTurn, gameStarted, history, isAiThinking, level, playLocalAiMove, positionHistory, triggerAiMove, userColor]);

  useEffect(() => () => {
    aiRequestRef.current?.abort();
    void audioContextRef.current?.close();
  }, []);

  const handleBoardPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!gameStarted || isAiThinking) return;
    if (!activeLesson) {
      if (currentTurn !== userColor) return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (boardPixelSize / rect.width);
    const svgY = (event.clientY - rect.top) * (boardPixelSize / rect.height);
    const x = Math.round((svgX - PADDING) / cellSize);
    const y = Math.round((svgY - PADDING) / cellSize);
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return;

    if (activeLesson) {
      if (lessonComplete) return;
      const isTarget = activeLesson.targetPoints.some((point) => point.x === x && point.y === y);
      if (!isTarget) {
        setLessonFeedback(`여기는 이번 연습의 답이 아닙니다. ${activeLesson.instruction}`);
        return;
      }
      const lessonMove = playMove(board, x, y, activeLesson.player);
      if (!lessonMove) {
        setLessonFeedback('이 자리는 지금 둘 수 없습니다. 파란색으로 표시된 교차점을 다시 확인해 보세요.');
        return;
      }
      const nextHistory = [...history, { x, y, color: activeLesson.player }];
      setBoard(lessonMove.newBoard);
      setHistory(nextHistory);
      setPositionHistory([serializeBoard(lessonMove.newBoard)]);
      void playStoneSound();
      if (activeLesson.player === 'B') setCapturedW((value) => value + lessonMove.capturedCount);
      else setCapturedB((value) => value + lessonMove.capturedCount);
      const lessonKey = `${selectedCourse.id}-${activeLesson.id}`;
      setCompletedLessonKeys((keys) => keys.includes(lessonKey) ? keys : [...keys, lessonKey]);
      setLessonComplete(true);
      setLessonFeedback('');
      setAiExplanation(`완료 · ${activeLesson.shortTitle}\n\n${activeLesson.successText}`);
      return;
    }

    const move = playMove(board, x, y, userColor);
    if (!move) return window.alert('이미 돌이 있거나 자충수인 자리입니다.');
    const signature = serializeBoard(move.newBoard);
    if (positionHistory.includes(signature)) return window.alert('패 규칙으로 지금은 그 자리에 둘 수 없습니다.');

    const nextHistory = [...history, { x, y, color: userColor }];
    const nextPositions = [...positionHistory, signature];
    setBoard(move.newBoard);
    setHistory(nextHistory);
    setPositionHistory(nextPositions);
    setCurrentTurn(userColor === 'B' ? 'W' : 'B');
    setPassStreak(0);
    void playStoneSound();
    if (userColor === 'B') setCapturedW((value) => value + move.capturedCount);
    else setCapturedB((value) => value + move.capturedCount);
    const userMoveCount = nextHistory.filter((playedMove) => playedMove.color === userColor).length;
    const shouldUseGemini = level !== '입문자' && (analysisInterval === 1 || (userColor === 'B'
      ? (userMoveCount - 1) % analysisInterval === 0
      : userMoveCount % analysisInterval === 0));
    if (shouldUseGemini) {
      void triggerAiMove(move.newBoard, nextHistory, nextPositions, coordinateName(x, y, boardSize));
    } else {
      const aiColor: Color = userColor === 'B' ? 'W' : 'B';
      if (!playLocalAiMove(
        move.newBoard,
        nextHistory,
        nextPositions,
        aiColor,
        level === '입문자'
          ? '입문 연습 AI가 다음 수를 두었습니다.'
          : `Gemini 사용량 절약을 위해 ${analysisInterval}수 간격으로 분석합니다.`,
      )) {
        setAiExplanation('규칙 엔진이 둘 수 있는 합법적인 착수점을 찾지 못했습니다.');
      }
    }
  };

  const passTurn = () => {
    if (!gameStarted || activeLesson || !isUserTurn) return;
    const aiColor: Color = userColor === 'B' ? 'W' : 'B';
    if (getValidMoves(board, aiColor, positionHistory, level).length === 0) {
      finishGame('종국 · 당신과 AI가 연속으로 패스해 대국을 종료했습니다.');
      return;
    }
    setCurrentTurn(aiColor);
    setPassStreak(1);
    setAiExplanation('당신이 패스했습니다. AI의 응수를 확인합니다.');
    if (level === '입문자') {
      playLocalAiMove(board, history, positionHistory, aiColor, '당신이 패스한 뒤 입문 연습 AI가 응수합니다.');
    } else {
      void triggerAiMove(board, history, positionHistory, '패스');
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
    const isLessonTarget = !activeLesson || activeLesson.targetPoints.some((point) => point.x === x && point.y === y);
    if (nearIntersection && isLessonTarget && x >= 0 && x < boardSize && y >= 0 && y < boardSize && board[y]?.[x] === null) {
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
    (activeLesson ? !lessonComplete : currentTurn === userColor);
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

      <nav className="mode-switch" aria-label="학습 모드 선택">
        <button className={appMode === 'learn' ? 'selected' : ''} onClick={() => { stopGame(); setAppMode('learn'); }}>처음 배우기</button>
        <button className={appMode === 'play' ? 'selected' : ''} onClick={() => { stopGame(); setAppMode('play'); }}>자유 대국</button>
      </nav>

      {appMode === 'learn' && !gameStarted ? (
        <section className="lesson-home" aria-label="바둑 기초 튜토리얼">
          <div className="lesson-home-intro">
            <p className="eyebrow">STEP BY STEP</p>
            <h2>{selectedCourse.title}</h2>
            <p>{selectedCourse.description} 각 단계는 앞 수업을 마친 뒤 열리며, 마지막에는 같은 난이도의 실전으로 이어집니다. 튜토리얼에서는 AI 응수나 Gemini 호출이 없습니다.</p>
            <div className="lesson-progress"><b>{completedCourseCount}</b><span>/ {selectedCourse.lessons.length} 수업 완료</span></div>
          </div>
          <div className="course-content">
            <div className="course-tabs" role="tablist" aria-label="튜토리얼 레벨">
              {TUTORIAL_COURSES.map((course) => (
                <button key={course.id} className={selectedCourse.id === course.id ? 'selected' : ''} onClick={() => setSelectedCourseId(course.id)} role="tab" aria-selected={selectedCourse.id === course.id}>{course.label}</button>
              ))}
            </div>
            <div className="curriculum-list">
              {selectedCourse.units.map((unit, unitIndex) => {
                const unitLessons = unit.lessonIds.map((id) => selectedCourse.lessons.find((lesson) => lesson.id === id)).filter((lesson): lesson is TutorialLesson => Boolean(lesson));
                const done = unitLessons.filter((lesson) => completedLessonKeys.includes(`${selectedCourse.id}-${lesson.id}`)).length;
                return <section className="curriculum-unit" key={unit.title}>
                  <div className="unit-heading"><span>UNIT {String(unitIndex + 1).padStart(2, '0')}</span><div><h3>{unit.title}</h3><p>{unit.goal}</p></div><b>{done}/{unitLessons.length}</b></div>
                  <div className="lesson-grid">
                    {unitLessons.map((lesson) => {
                      const complete = completedLessonKeys.includes(`${selectedCourse.id}-${lesson.id}`);
                      const unlocked = isLessonUnlocked(lesson);
                      return <button className={`lesson-card ${!unlocked ? 'locked' : ''}`} key={lesson.id} disabled={!unlocked} onClick={() => startLesson(lesson)}>
                        <span className="lesson-number">{String(lesson.id).padStart(2, '0')} · {complete ? '완료' : unlocked ? '수업' : '잠김'}</span>
                        <strong>{lesson.shortTitle}</strong>
                        <small>{lesson.title}</small>
                        <i>{complete ? '다시 연습하기 →' : unlocked ? '이 수업 시작 →' : '앞 수업을 마치면 열려요'}</i>
                      </button>;
                    })}
                  </div>
                  <p className="unit-checkpoint">확인: {unit.checkpoint}</p>
                </section>;
              })}
              <button className={`lesson-card final-lesson ${nextLesson ? 'locked' : ''}`} disabled={Boolean(nextLesson)} onClick={() => { setAppMode('play'); setBoardSize(9); setLevel('입문자'); setUserColor('B'); }}>
                <span className="lesson-number">PRACTICE GAME</span>
                <strong>{selectedCourse.label} 실전 연습</strong>
                <small>{nextLesson ? `다음 수업 “${nextLesson.shortTitle}”을 마치면 열립니다.` : '입문 AI와 9×9 한 판을 끝까지 두고, 배운 내용을 확인해요.'}</small>
                <i>{nextLesson ? '수업 진행 중' : '실전 시작 →'}</i>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>

      <section className="control-card" aria-label={activeLesson ? '튜토리얼 진행' : '대국 설정'}>
        {activeLesson ? (
          <div className="lesson-control" aria-live="polite">
            <div><span className="lesson-kicker">{selectedCourse.label} · LESSON {String(activeLesson.id).padStart(2, '0')} / {selectedCourse.lessons.length}</span><h2>{activeLesson.title}</h2></div>
            <p>{lessonComplete ? activeLesson.successText : activeLesson.instruction}</p>
            {lessonFeedback && <p className="lesson-feedback">{lessonFeedback}</p>}
            <div className="lesson-actions">
              {lessonComplete && courseLessonSequence.findIndex((lesson) => lesson.id === activeLesson.id) < courseLessonSequence.length - 1 && (
                <button className="button primary" onClick={() => {
                  const nextIndex = courseLessonSequence.findIndex((lesson) => lesson.id === activeLesson.id) + 1;
                  startLesson(courseLessonSequence[nextIndex]);
                }}>다음 수업</button>
              )}
              {lessonComplete && courseLessonSequence.findIndex((lesson) => lesson.id === activeLesson.id) === courseLessonSequence.length - 1 && (
                <button className="button primary" onClick={() => { stopGame(); setAppMode('play'); setBoardSize(9); setLevel('입문자'); setUserColor('B'); }}>9 × 9 첫 대국 준비</button>
              )}
              <button className="button secondary" onClick={stopGame}>목록으로</button>
              <button className="button sound" aria-pressed={soundEnabled} onClick={() => { setSoundEnabled((enabled) => !enabled); if (!soundEnabled) void ensureAudio(); }}>
                {soundEnabled ? '🔊 착수음' : '🔇 음소거'}
              </button>
            </div>
          </div>
        ) : (
          <>
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
          {gameStarted && !activeLesson && <button className="button secondary" disabled={!isUserTurn} onClick={passTurn}>패스</button>}
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
              <span>{level === '입문자' ? '입문 연습 AI · Gemini 미사용' : `이번 대국 Gemini 호출 ${geminiCalls}회`}</span>
            </div>
          </div>
        )}
        {gameOver && (
          <div className="game-end-notice" role="status"><strong>대국 종료</strong><span>{gameEndMessage}</span><button className="button primary" onClick={startGame}>새 대국</button></div>
        )}
          </>
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
            {activeLesson && !lessonComplete && activeLesson.hintPoints.map(({ x, y }) => (
              <g key={`hint-${x}-${y}`} className="tutorial-target" aria-hidden="true">
                <circle cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r={cellSize * .22} />
                <circle cx={PADDING + x * cellSize} cy={PADDING + y * cellSize} r={cellSize * .085} />
              </g>
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
            <div className="card-heading"><span>{activeLesson ? String(activeLesson.id).padStart(2, '0') : 'AI'}</span><h2>{activeLesson ? '이번 단계 안내' : '실시간 강평'}</h2></div>
            {!gameStarted
              ? <p className="muted">설정을 고른 뒤 대국을 시작하세요.</p>
              : isAiThinking
                ? <div className="thinking"><i /><span>현재 판을 분석하고 응수를 고르고 있습니다.</span></div>
                : <div className="analysis-text">{aiExplanation}</div>}
          </article>
          <article className="archive-card">
            <div className="card-heading"><span>{activeLesson ? 'TIP' : '棋'}</span><h2>{activeLesson ? '기억할 점' : '저장한 기보'}</h2></div>
            {activeLesson
              ? <p className="muted">{activeLesson.concept}</p>
              : games.length === 0
                ? <p className="muted">저장된 기보가 없습니다.</p>
                : <ul>{games.map((game) => <li key={game.id}><strong>{game.title}</strong><small>{new Date(game.created_at).toLocaleDateString()}</small></li>)}</ul>}
          </article>
        </div>
      </section>
        </>
      )}
    </main>
  );
}
