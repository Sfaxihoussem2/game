'use strict';

const crypto = require('crypto');
const { Dealer, CATEGORIES } = require('./cards');
const G = require('./games');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 1000 * 60 * 60 * 6;
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}
const makeId = () => crypto.randomBytes(12).toString('hex');
const cleanName = (n) => String(n || '').trim().slice(0, 18) || 'لاعب';

const ALL_CATS = Object.keys(CATEGORIES);
const DEFAULT_CATS = ALL_CATS.filter((c) => c !== 'bold');

// ---- الشارات ------------------------------------------------------------
const ACHIEVEMENTS = [
  { id: 'perfect_match', emoji: '💘', name: 'Perfect Match', test: (s) => s.same >= 5 },
  { id: 'mind_reader', emoji: '🧠', name: 'Mind Reader', test: (s) => s.guesses >= 3 },
  { id: 'clowns', emoji: '😂', name: 'Duo de Clowns', test: (s) => (s.byGame.who || 0) + (s.byGame.tor || 0) >= 1 },
  { id: 'puzzle_masters', emoji: '🧩', name: 'Puzzle Masters', test: (s) => s.puzzles >= 1 },
  { id: 'artist', emoji: '🎨', name: 'Artist', test: (s) => s.draws >= 3 },
  { id: 'speed_couple', emoji: '⚡', name: 'Speed Couple', test: (s) => (s.speedWins || 0) >= 3 },
  { id: 'love_birds', emoji: '❤️', name: 'Love Birds', test: (s) => s.gamesPlayed >= 3 },
  { id: 'chemistry', emoji: '🔥', name: 'Chemistry', test: (s) => s.same >= 8 },
  { id: 'champion', emoji: '🏆', name: 'Couple Champion', test: (s, total) => total >= 40 },
];

function checkAchievements(room) {
  const total = room.players.reduce((a, p) => a + p.score, 0);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!room.achievements.includes(a.id) && a.test(room.stats, total)) {
      room.achievements.push(a.id);
      fresh.push({ id: a.id, emoji: a.emoji, name: a.name });
    }
  }
  return fresh;
}

// ---- إنشاء / دخول -------------------------------------------------------
function createRoom(name) {
  const code = makeCode();
  const playerId = makeId();
  const room = {
    code, createdAt: Date.now(), lastActivity: Date.now(),
    status: 'lobby', // lobby | hub | playing | result | ended
    hostId: playerId,
    settings: { cats: DEFAULT_CATS.slice(), targetCards: 20 },
    players: [{ id: playerId, name: cleanName(name), score: 0, connected: true, socketIds: [] }],
    proposal: null,
    game: null,
    turnId: playerId, cardsPlayed: 0, multiplier: 1, current: null,
    dealer: new Dealer(DEFAULT_CATS),
    stats: { same: 0, guesses: 0, challenges: 0, puzzles: 0, draws: 0, speedWins: 0, gamesPlayed: 0, byGame: {} },
    achievements: [],
    lastEvent: null, history: [],
  };
  rooms.set(code, room);
  return { room, playerId };
}

const getRoom = (code) => rooms.get(String(code || '').toUpperCase().trim()) || null;
const findPlayer = (room, id) => room.players.find((p) => p.id === id) || null;
const other = (room, id) => room.players.find((p) => p.id !== id) || null;

function joinRoom(code, name) {
  const room = getRoom(code);
  if (!room) return { error: 'ما لقيناش partie بالكود هذا. تثبّت من الحروف.' };
  if (room.players.length >= 2) return { error: 'الـpartie هذي عامرة (زوز لاعبين برك).' };
  const playerId = makeId();
  room.players.push({ id: playerId, name: cleanName(name), score: 0, connected: true, socketIds: [] });
  room.lastActivity = Date.now();
  room.lastEvent = { type: 'join', text: `${room.players[1].name} دخل للـpartie 🎉`, ts: Date.now() };
  return { room, playerId };
}

// ---- الحالة المرسلة (مع إخفاء الأسرار) ---------------------------------
function maskGame(g, viewerId) {
  const out = {
    id: g.id, engine: g.engine, round: g.round, rounds: g.rounds,
    scores: g.scores, over: g.over, turnId: g.turnId, drawerId: g.drawerId,
  };
  if (g.engine === 'duel' && g.current) {
    const c = g.current;
    out.current = {
      prompt: c.prompt, options: c.options, subjectId: c.subjectId, mode: c.mode,
      revealed: c.revealed, verdict: c.verdict, points: c.points,
      answered: Object.keys(c.answers),
      answers: c.revealed ? c.answers : (c.answers[viewerId] != null ? { [viewerId]: c.answers[viewerId] } : {}),
    };
  }
  if (g.engine === 'tor') out.current = g.current || null;
  if (g.engine === 'speed' && g.current) {
    const c = g.current;
    out.current = {
      text: c.text, secs: c.secs, endsAt: c.endsAt, revealed: c.revealed,
      answered: Object.keys(c.answers),
      answers: c.revealed ? c.answers : {},
      pts: c.revealed ? Object.fromEntries(Object.keys(c.answers).map((k) => [k, c[`pts_${k}`] || 0])) : {},
    };
  }
  if (g.engine === 'puzzle') {
    out.phase = g.phase; out.size = g.size; out.image = g.image;
    out.slots = g.slots; out.moves = g.moves; out.mode = g.mode;
  }
  if (g.engine === 'draw' && g.current) {
    const c = g.current;
    out.current = {
      drawerId: c.drawerId, endsAt: c.endsAt, found: c.found, points: c.points,
      secs: c.secs, timeout: c.timeout, guesses: c.guesses,
      word: (viewerId === c.drawerId || c.found) ? c.word : null,
    };
  }
  return out;
}

function publicState(room, viewerId) {
  return {
    code: room.code, status: room.status, hostId: room.hostId, settings: room.settings,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })),
    proposal: room.proposal,
    stats: room.stats, achievements: room.achievements,
    lastEvent: room.lastEvent,
    turnId: room.turnId, cardsPlayed: room.cardsPlayed, multiplier: room.multiplier,
    current: room.current, history: room.history.slice(-12),
    game: room.game ? maskGame(room.game, viewerId) : null,
  };
}

// ---- اللوبي / الهاب -----------------------------------------------------
function updateSettings(room, playerId, settings) {
  if (playerId !== room.hostId) return { error: 'الإعدادات يبدّلهم اللي عمل الـpartie.' };
  if (Array.isArray(settings.cats)) {
    const cats = settings.cats.filter((c) => ALL_CATS.includes(c));
    if (!cats.length) return { error: 'اختار فئة وحدة على الأقل.' };
    room.settings.cats = cats;
  }
  if ([0, 10, 20, 30].includes(Number(settings.targetCards))) room.settings.targetCards = Number(settings.targetCards);
  room.dealer.setCategories(room.settings.cats);
  return { ok: true };
}

function openHub(room, playerId) {
  if (room.players.length < 2) return { error: 'لازم زوز لاعبين.' };
  if (room.status === 'lobby' && playerId !== room.hostId) return { error: 'اللي عمل الـpartie هو اللي يفتح الألعاب.' };
  room.status = 'hub';
  room.game = null; room.proposal = null; room.current = null;
  room.lastEvent = { type: 'hub', text: null, ts: Date.now() };
  return { ok: true };
}

function proposeGame(room, playerId, gameId) {
  if (!G.GAMES[gameId]) return { error: 'اللعبة هذي ما موجودةش.' };
  const me = findPlayer(room, playerId);
  room.proposal = { gameId, byId: playerId, byName: me.name, accepted: false, ready: { [playerId]: false } };
  room.status = 'hub';
  room.lastEvent = { type: 'propose', text: `${me.name} يحب يلعب ${G.GAMES[gameId].name}`, ts: Date.now() };
  return { ok: true };
}

function answerProposal(room, playerId, accept) {
  const pr = room.proposal;
  if (!pr) return { error: 'ما فماش اقتراح.' };
  if (playerId === pr.byId) return { error: 'إنت اللي اقترحت 🙂' };
  if (!accept) { room.proposal = null; return { ok: true, refused: true }; }
  pr.accepted = true;
  pr.ready = { [pr.byId]: false, [playerId]: false };
  return { ok: true };
}

function setReady(room, playerId, val) {
  const pr = room.proposal;
  if (!pr) return { error: 'اختارو لعبة قبل.' };
  if (!pr.accepted) return { error: 'استنّى شريكك يوافق.' };
  pr.ready[playerId] = !!val;
  if (room.players.every((p) => pr.ready[p.id])) return startGame(room, pr.gameId);
  return { ok: true };
}

// ---- بداية / نهاية لعبة -------------------------------------------------
function startGame(room, gameId) {
  const meta = G.GAMES[gameId];
  if (!meta) return { error: 'اللعبة ما موجودةش.' };
  if (room.players.length < 2) return { error: 'لازم زوز لاعبين.' };
  room.proposal = null;
  room.status = 'playing';
  room.stats.gamesPlayed += 1;
  room.stats.byGame[gameId] = (room.stats.byGame[gameId] || 0) + 1;

  if (meta.engine === 'cards') {
    room.game = { id: 'cards', engine: 'cards', round: 0, rounds: 0, scores: {}, over: false };
    room.players.forEach((p) => (room.game.scores[p.id] = 0));
    room.cardsPlayed = 0; room.multiplier = 1; room.current = null;
    room.dealer = new Dealer(room.settings.cats);
    room.turnId = room.players[Math.floor(Math.random() * 2)].id;
  } else {
    room.game = G.createGame(room, gameId);
    if (meta.engine === 'duel') G.duelNext(room, room.game);
    if (meta.engine === 'speed') G.speedNext(room, room.game);
    if (meta.engine === 'draw') G.drawNext(room, room.game);
  }
  room.lastEvent = { type: 'gamestart', text: `${meta.emoji} ${meta.name}`, ts: Date.now() };
  return { ok: true, started: gameId };
}

function endCurrentGame(room) {
  if (room.game) room.game.over = true;
  room.status = 'result';
  room.current = null;
  checkAchievements(room);
  return { ok: true };
}

function endSession(room) {
  room.status = 'ended';
  room.game = null; room.current = null; room.proposal = null;
  checkAchievements(room);
  return { ok: true };
}

function newSession(room) {
  room.players.forEach((p) => (p.score = 0));
  room.stats = { same: 0, guesses: 0, challenges: 0, puzzles: 0, draws: 0, speedWins: 0, gamesPlayed: 0, byGame: {} };
  room.achievements = [];
  room.game = null; room.current = null; room.proposal = null;
  room.status = 'hub';
  return { ok: true };
}

// ---- لعبة الكروت --------------------------------------------------------
function drawCard(room, playerId) {
  if (room.status !== 'playing' || !room.game || room.game.id !== 'cards') return { error: 'اللعبة موش خدّامة.' };
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (room.current) return { error: 'عندك كارت مفتوح، كمّلو قبل.' };

  if (Math.random() < 0.12) {
    const sp = room.dealer.drawSpecial();
    const c = { kind: 'special', effect: sp.effect, title: sp.title, text: sp.text, id: sp.id, phase: 'open', swaps: 0, extra: null, extras: null, points: 0 };
    if (sp.effect === 'couple') { const q = room.dealer.draw(); c.extra = q; c.points = q.points; }
    if (sp.effect === 'chaos') {
      const m1 = room.dealer.draw('mission');
      let m2 = room.dealer.draw('mission');
      if (m2.id === m1.id) m2 = room.dealer.draw('mission');
      c.extras = [m1, m2]; c.points = 3;
    }
    room.current = c;
  } else {
    room.current = { kind: 'card', ...room.dealer.draw(), phase: 'open', swaps: 0 };
  }
  room.lastActivity = Date.now();
  return { ok: true };
}

function swapCard(room, playerId) {
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (!room.current || room.current.phase !== 'open') return { error: 'ما فماش كارت باش تبدّلو.' };
  if (room.current.kind === 'special') return { error: 'الكارت الخاص ما يتبدّلش 😅' };
  if (room.current.swaps >= 3) return { error: 'خلاص، بدّلت 3 مرّات 😄' };
  const swaps = room.current.swaps + 1;
  room.current = { kind: 'card', ...room.dealer.draw(room.current.cat), phase: 'open', swaps };
  return { ok: true };
}

function resolveCard(room, playerId, result) {
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  const cur = room.current;
  if (!cur || cur.phase !== 'open') return { error: 'ما فماش كارت مفتوح.' };
  const me = findPlayer(room, playerId);
  const partner = other(room, playerId);
  const mult = room.multiplier;
  const g = room.game;
  const add = (p, n) => { p.score += n; if (g) g.scores[p.id] = (g.scores[p.id] || 0) + n; };
  let text = '';

  if (cur.kind === 'special') {
    if (cur.effect === 'double') {
      room.multiplier = 2; room.current = null;
      room.lastEvent = { type: 'double', text: 'النقاط ×2 في الكارت الجاي 🎲', ts: Date.now() };
      return { ok: true, keepTurn: true };
    }
    if (cur.effect === 'switch') {
      room.current = null;
      if (partner) room.turnId = partner.id;
      room.lastEvent = { type: 'switch', text: 'بدّلنا الدور 🔄', ts: Date.now() };
      return { ok: true, switched: true };
    }
    if (cur.effect === 'couple') {
      const pts = (cur.points || 2) * mult;
      add(me, pts); if (partner) add(partner, pts);
      room.stats.same += 1;
      text = `❤️ COUPLE BONUS: +${pts} للزوز`;
    }
    if (cur.effect === 'chaos') {
      const pts = (result === 'fail' ? 0 : 3) * mult;
      add(me, pts); if (partner) add(partner, pts);
      if (pts) room.stats.challenges += 2;
      text = pts ? `😂 CHAOS: +${pts} للزوز` : '😂 CHAOS: 0 نقاط';
    }
  } else if (cur.vote) {
    if (result === 'same') {
      const pts = cur.points * mult;
      add(me, pts); if (partner) add(partner, pts);
      room.stats.same += 1;
      text = `✅ جاوبتوا كيف كيف! +${pts} للزوز`;
    } else {
      const pts = 1 * mult;
      add(me, pts);
      text = `❌ ما توافقتوش… +${pts} لـ${me.name}`;
    }
  } else {
    const pts = (result === 'fail' ? 0 : cur.points) * mult;
    add(me, pts);
    if (cur.cat === 'mission' && pts) room.stats.challenges += 1;
    text = pts ? `+${pts} لـ${me.name}` : `${me.name} ما عملهاش الكارت 😅`;
  }

  room.multiplier = 1;
  room.cardsPlayed += 1;
  cur.phase = 'resolved'; cur.resultText = text;
  room.history.push({ playerId: me.id, name: me.name, cat: cur.kind === 'special' ? cur.effect : cur.cat, ts: Date.now() });
  room.lastEvent = { type: 'score', text, ts: Date.now() };
  room.lastActivity = Date.now();
  checkAchievements(room);

  const target = room.settings.targetCards;
  if (target > 0 && room.cardsPlayed >= target) endCurrentGame(room);
  return { ok: true, resolved: true, ended: room.status === 'result' };
}

function passTurn(room, playerId) {
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (room.current && room.current.phase === 'open') return { error: 'كمّل الكارت قبل.' };
  const partner = other(room, playerId);
  room.current = null;
  if (partner) room.turnId = partner.id;
  return { ok: true };
}

// ---- تمرير الأحداث للمحرّكات -------------------------------------------
function gameAction(room, playerId, action, payload) {
  const g = room.game;
  if (!g || room.status !== 'playing') return { error: 'ما فماش لعبة خدّامة.' };
  const p = payload || {};
  let res = { ok: true };

  if (g.engine === 'duel') {
    if (action === 'submit') res = G.duelSubmit(room, g, playerId, p.value);
    else if (action === 'judge') res = G.duelJudge(room, g, p.verdict === 'same' ? 'same' : 'diff');
    else if (action === 'next') {
      if (g.current && g.current.revealed && g.current.mode === 'text' && !g.current.verdict) {
        return { error: 'اختارو كان توافقتو ولا لا.' };
      }
      G.duelNext(room, g);
      if (g.over) endCurrentGame(room);
    } else return { error: 'حركة موش معروفة.' };
  } else if (g.engine === 'tor') {
    if (g.turnId !== playerId && action !== 'next') return { error: 'موش دورك 🙂' };
    if (action === 'pick') res = G.torPick(room, g, p.kind === 'challenge' ? 'challenge' : 'truth');
    else if (action === 'resolve') res = G.torResolve(room, g, playerId, p.result);
    else if (action === 'next') {
      g.current = null;
      const o = other(room, g.turnId);
      if (o) g.turnId = o.id;
      if (g.over) endCurrentGame(room);
    } else return { error: 'حركة موش معروفة.' };
  } else if (g.engine === 'speed') {
    if (action === 'submit') res = G.speedSubmit(room, g, playerId, p.value);
    else if (action === 'next') { G.speedNext(room, g); if (g.over) endCurrentGame(room); }
    else return { error: 'حركة موش معروفة.' };
  } else if (g.engine === 'puzzle') {
    if (action === 'setup') {
      if (!p.image || typeof p.image !== 'string' || p.image.length > 6e6) return { error: 'التصويرة كبيرة برشة ولا ما وصلتش.' };
      res = G.puzzleStart(room, g, p.image, p.size, p.mode);
    } else if (action === 'swap') {
      res = G.puzzleSwap(room, g, playerId, p.a, p.b);
      if (res.done) endCurrentGame(room);
    } else return { error: 'حركة موش معروفة.' };
  } else if (g.engine === 'draw') {
    if (action === 'guess') res = G.drawGuess(room, g, playerId, p.text);
    else if (action === 'timeout') res = G.drawTimeout(room, g);
    else if (action === 'next') { G.drawNext(room, g); if (g.over) endCurrentGame(room); }
    else if (action === 'clear') { g.strokes = []; }
    else return { error: 'حركة موش معروفة.' };
  } else return { error: 'اللعبة ما تقبلش الحركة هذي.' };

  if (res.error) return res;
  room.lastActivity = Date.now();
  checkAchievements(room);
  return res;
}

function gc() {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
}
setInterval(gc, 1000 * 60 * 15).unref();

module.exports = {
  rooms, ACHIEVEMENTS,
  createRoom, joinRoom, getRoom, findPlayer, other, publicState,
  updateSettings, openHub, proposeGame, answerProposal, setReady,
  startGame, endCurrentGame, endSession, newSession,
  drawCard, swapCard, resolveCard, passTurn, gameAction, checkAchievements,
};
