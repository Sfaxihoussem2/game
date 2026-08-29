'use strict';

const { shuffle } = require('./cards');
const KP = require('../data/games/kp');
const WYR = require('../data/games/wyr');
const WHO = require('../data/games/who');
const GUESS = require('../data/games/guess');
const TOR = require('../data/games/tor');
const MISC = require('../data/games/misc');

// ---- كاتالوغ الألعاب ----------------------------------------------------
const GAMES = {
  cards: {
    id: 'cards', emoji: '❤️', name: 'نعرفك قدّاش؟', engine: 'cards',
    desc: 'أسئلة، مواقف وChallenges باش نشوفوا قدّاش تعرفوا بعضكم ❤️',
    dur: '10-20 min', rounds: 0,
  },
  kp: {
    id: 'kp', emoji: '🧠', name: 'شكون يعرف الآخر أكثر؟', engine: 'duel',
    desc: 'واحد يجاوب على روحو والآخر يخمّن. الجوابات مخبّية لين يجاوبو الزوز.',
    dur: '5-10 min', rounds: 6, mode: 'text', asym: true, points: 2,
  },
  wyr: {
    id: 'wyr', emoji: '💭', name: 'تختار شنوّة؟', engine: 'duel',
    desc: 'زوز اختيارات صعاب. جاوبو في نفس الوقت وشوفو كان توافقتو.',
    dur: '5 min', rounds: 8, mode: 'choice', points: 1,
  },
  who: {
    id: 'who', emoji: '😂', name: 'مين فينا؟', engine: 'duel',
    desc: 'شكون فينا يغار أكثر؟ شكون يرقد أكثر؟ جاوبو وشوفو.',
    dur: '5 min', rounds: 8, mode: 'choice', points: 1,
  },
  guess: {
    id: 'guess', emoji: '🔮', name: 'Guess My Answer', engine: 'duel',
    desc: 'سؤال مفتوح: واحد يجاوب بالسرّ والآخر لازم يخمّن الجواب.',
    dur: '5-10 min', rounds: 6, mode: 'text', asym: true, points: 2,
  },
  memories: {
    id: 'memories', emoji: '📸', name: 'Memories Challenge', engine: 'duel',
    desc: 'ذكرياتكم: الزوز يجاوبو ونشوفو كان تتفكّرو كيف كيف.',
    dur: '5-10 min', rounds: 6, mode: 'text', points: 2,
  },
  tor: {
    id: 'tor', emoji: '🎯', name: 'Truth or Challenge', engine: 'tor',
    desc: 'صراحة ولا مهمّة؟ اختار وإنت في دورك.',
    dur: '10 min', rounds: 8,
  },
  speed: {
    id: 'speed', emoji: '⏱️', name: 'Speed Challenge', engine: 'speed',
    desc: 'وقت محدود: أذكر 3 حاجات قبل ما يسالي الtimer!',
    dur: '5 min', rounds: 5,
  },
  puzzle: {
    id: 'puzzle', emoji: '🧩', name: 'Puzzle متاعنا', engine: 'puzzle',
    desc: 'حطّو تصويرة متاعكم وركّبوها مع بعضكم في نفس الوقت.',
    dur: '5-15 min', rounds: 0,
  },
  draw: {
    id: 'draw', emoji: '🎨', name: 'Draw & Guess', engine: 'draw',
    desc: 'واحد يرسم والآخر يخمّن، والرسم يتشاف live.',
    dur: '10 min', rounds: 4,
  },
};

const pick = (arr, used) => {
  const free = arr.map((_, i) => i).filter((i) => !used.includes(i));
  const pool = free.length ? free : arr.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
};

// ---- إنشاء لعبة ---------------------------------------------------------
function createGame(room, id) {
  const meta = GAMES[id];
  if (!meta) return null;
  const g = {
    id, engine: meta.engine, round: 0, rounds: meta.rounds,
    used: [], scores: {}, over: false, log: [],
  };
  room.players.forEach((p) => (g.scores[p.id] = 0));

  if (meta.engine === 'duel') g.turnId = room.players[Math.floor(Math.random() * room.players.length)].id;
  if (meta.engine === 'tor') g.turnId = room.turnId || room.players[0].id;
  if (meta.engine === 'draw') g.drawerId = room.players[Math.floor(Math.random() * room.players.length)].id;
  if (meta.engine === 'puzzle') {
    g.phase = 'setup'; g.image = null; g.size = 3; g.slots = []; g.moves = {}; g.mode = 'coop';
    room.players.forEach((p) => (g.moves[p.id] = 0));
  }
  return g;
}

// ---- DUEL ---------------------------------------------------------------
function duelNext(room, g) {
  const meta = GAMES[g.id];
  g.round += 1;
  if (g.rounds && g.round > g.rounds) { g.over = true; g.current = null; return; }

  const [p1, p2] = room.players;
  let prompt = '', options = null, subjectId = null;

  if (g.id === 'kp') {
    const i = pick(KP, g.used); g.used.push(i);
    subjectId = g.turnId;
    const subject = room.players.find((p) => p.id === subjectId) || p1;
    prompt = KP[i].replace(/\{p\}/g, subject.name);
  } else if (g.id === 'guess') {
    const i = pick(GUESS, g.used); g.used.push(i);
    subjectId = g.turnId;
    prompt = GUESS[i];
  } else if (g.id === 'memories') {
    const i = pick(MISC.memories, g.used); g.used.push(i);
    prompt = MISC.memories[i];
  } else if (g.id === 'wyr') {
    const i = pick(WYR, g.used); g.used.push(i);
    prompt = 'تختار شنوّة؟';
    options = WYR[i].slice();
  } else if (g.id === 'who') {
    const i = pick(WHO, g.used); g.used.push(i);
    prompt = WHO[i];
    options = [p1 ? p1.name : '1', p2 ? p2.name : '2', 'الزوز ❤️'];
  }

  g.current = {
    prompt, options, subjectId, mode: meta.mode,
    answers: {}, revealed: false, verdict: null, points: meta.points,
  };
  // بعد كل round، الدور يدور (كان اللعبة asymétrique)
  if (meta.asym && p2) g.turnId = g.turnId === p1.id ? p2.id : p1.id;
}

function duelSubmit(room, g, playerId, value) {
  const c = g.current;
  if (!c || c.revealed) return { error: 'الround هذا سالا.' };
  const v = String(value == null ? '' : value).trim().slice(0, 120);
  if (!v) return { error: 'اكتب جواب قبل 🙂' };
  c.answers[playerId] = v;
  if (room.players.every((p) => c.answers[p.id] != null)) {
    c.revealed = true;
    if (c.mode === 'choice') {
      const vals = room.players.map((p) => c.answers[p.id]);
      duelJudge(room, g, vals[0] === vals[1] ? 'same' : 'diff');
    }
  }
  return { ok: true };
}

function duelJudge(room, g, verdict) {
  const c = g.current;
  if (!c || !c.revealed || c.verdict) return { error: 'موش وقتها.' };
  c.verdict = verdict;
  if (verdict === 'same') {
    room.players.forEach((p) => {
      p.score += c.points;
      g.scores[p.id] += c.points;
    });
    room.stats.same += 1;
    if (c.subjectId) room.stats.guesses += 1;
  }
  return { ok: true };
}

// ---- TRUTH OR CHALLENGE -------------------------------------------------
function torPick(room, g, kind) {
  const list = kind === 'truth' ? TOR.truth : TOR.challenge;
  const key = kind === 'truth' ? 'usedT' : 'usedC';
  g[key] = g[key] || [];
  const i = pick(list, g[key]); g[key].push(i);
  g.current = { kind, text: list[i], points: kind === 'truth' ? 1 : 3, phase: 'open' };
  return { ok: true };
}

function torResolve(room, g, playerId, result) {
  const c = g.current;
  if (!c || c.phase !== 'open') return { error: 'ما فماش كارت مفتوح.' };
  const p = room.players.find((x) => x.id === playerId);
  const pts = result === 'fail' ? 0 : c.points;
  p.score += pts; g.scores[p.id] += pts;
  if (c.kind === 'challenge' && pts) room.stats.challenges += 1;
  c.phase = 'done'; c.gained = pts;
  g.round += 1;
  if (g.rounds && g.round >= g.rounds) g.over = true;
  return { ok: true };
}

// ---- SPEED --------------------------------------------------------------
function speedNext(room, g) {
  g.round += 1;
  if (g.rounds && g.round > g.rounds) { g.over = true; g.current = null; return; }
  const i = pick(MISC.speed, g.used); g.used.push(i);
  const [text, secs] = MISC.speed[i];
  g.current = {
    text, secs, startedAt: Date.now(), endsAt: Date.now() + secs * 1000,
    answers: {}, revealed: false,
  };
}

function speedSubmit(room, g, playerId, value) {
  const c = g.current;
  if (!c || c.revealed) return { error: 'الوقت سالا.' };
  const items = String(value || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
  c.answers[playerId] = items;
  const p = room.players.find((x) => x.id === playerId);
  const late = Date.now() > c.endsAt + 1500;
  const pts = late ? 0 : Math.min(3, items.length);
  p.score += pts; g.scores[p.id] += pts;
  if (pts >= 3) room.stats.speedWins = (room.stats.speedWins || 0) + 1;
  c[`pts_${playerId}`] = pts;
  if (room.players.every((x) => c.answers[x.id])) c.revealed = true;
  return { ok: true };
}

// ---- PUZZLE -------------------------------------------------------------
function puzzleStart(room, g, image, size, mode) {
  const n = [3, 4, 5, 6].includes(Number(size)) ? Number(size) : 3;
  g.size = n;
  g.image = image;
  g.mode = mode === 'versus' ? 'versus' : 'coop';
  const total = n * n;
  let order;
  do { order = shuffle([...Array(total).keys()]); }
  while (order.every((v, i) => v === i));
  g.slots = order; // slots[i] = رقم القطعة اللي في الخانة i
  g.phase = 'play';
  g.startedAt = Date.now();
  room.players.forEach((p) => (g.moves[p.id] = 0));
  return { ok: true };
}

function puzzleSwap(room, g, playerId, a, b) {
  if (g.phase !== 'play') return { error: 'الpuzzle موش خدّام.' };
  const n = g.slots.length;
  a = Number(a); b = Number(b);
  if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b) return { error: 'حركة غالطة.' };
  const before = (g.slots[a] === a ? 1 : 0) + (g.slots[b] === b ? 1 : 0);
  [g.slots[a], g.slots[b]] = [g.slots[b], g.slots[a]];
  const after = (g.slots[a] === a ? 1 : 0) + (g.slots[b] === b ? 1 : 0);
  const gain = after - before;
  if (gain > 0) g.moves[playerId] = (g.moves[playerId] || 0) + gain;
  const done = g.slots.every((v, i) => v === i);
  if (done) {
    g.phase = 'done';
    g.over = true;
    room.stats.puzzles += 1;
    const total = g.slots.length;
    room.players.forEach((p) => {
      const share = g.moves[p.id] || 0;
      const pts = g.mode === 'coop' ? 3 : Math.max(1, Math.round((share / total) * 5));
      p.score += pts; g.scores[p.id] += pts;
    });
  }
  return { ok: true, gain, done };
}

// ---- DRAW & GUESS -------------------------------------------------------
const norm = (s) => String(s || '').trim().toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[ىي]/g, 'ي')
  .replace(/[\u064B-\u0652]/g, '').replace(/\s+/g, ' ');

function drawNext(room, g) {
  g.round += 1;
  if (g.rounds && g.round > g.rounds) { g.over = true; g.current = null; return; }
  const i = pick(MISC.draw, g.used); g.used.push(i);
  const [p1, p2] = room.players;
  if (g.round > 1 && p2) g.drawerId = g.drawerId === p1.id ? p2.id : p1.id;
  g.strokes = [];
  g.current = {
    word: MISC.draw[i], drawerId: g.drawerId, startedAt: Date.now(),
    endsAt: Date.now() + 60000, guesses: [], found: false, points: 0,
  };
}

function drawGuess(room, g, playerId, text) {
  const c = g.current;
  if (!c || c.found) return { error: 'الround سالا.' };
  if (playerId === c.drawerId) return { error: 'إنت اللي ترسم 🙂' };
  const guess = String(text || '').slice(0, 40);
  const good = norm(guess) === norm(c.word) || norm(guess).includes(norm(c.word));
  c.guesses.push({ playerId, text: guess, good });
  if (c.guesses.length > 30) c.guesses.shift();
  if (good) {
    const secs = (Date.now() - c.startedAt) / 1000;
    const pts = secs < 15 ? 3 : secs < 30 ? 2 : 1;
    c.found = true; c.points = pts; c.secs = Math.round(secs);
    room.players.forEach((p) => { p.score += pts; g.scores[p.id] += pts; });
    room.stats.draws += 1;
  }
  return { ok: true, good };
}

function drawTimeout(room, g) {
  const c = g.current;
  if (!c || c.found) return { error: '' };
  c.found = true; c.points = 0; c.timeout = true;
  return { ok: true };
}

module.exports = {
  GAMES, createGame,
  duelNext, duelSubmit, duelJudge,
  torPick, torResolve,
  speedNext, speedSubmit,
  puzzleStart, puzzleSwap,
  drawNext, drawGuess, drawTimeout,
};
