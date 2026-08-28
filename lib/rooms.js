'use strict';

const crypto = require('crypto');
const { Dealer, CATEGORIES } = require('./cards');

// حروف بلا التباس (بلا O/0/I/1)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // 6 ساعات بلا حركة => تتمسح

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () =>
      CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function makeId() {
  return crypto.randomBytes(12).toString('hex');
}

function cleanName(name) {
  return String(name || '').trim().slice(0, 18) || 'لاعب';
}

const ALL_CATS = Object.keys(CATEGORIES);
const DEFAULT_CATS = ALL_CATS.filter((c) => c !== 'bold'); // 🔥 مطفي بالـ défaut

function createRoom(name) {
  const code = makeCode();
  const playerId = makeId();
  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    status: 'lobby', // lobby | playing | ended
    hostId: playerId,
    settings: { cats: DEFAULT_CATS.slice(), targetCards: 20 },
    players: [
      { id: playerId, name: cleanName(name), score: 0, connected: true, socketId: null },
    ],
    turnId: playerId,
    cardsPlayed: 0,
    multiplier: 1,
    current: null,
    lastEvent: null,
    history: [],
    dealer: new Dealer(DEFAULT_CATS),
  };
  rooms.set(code, room);
  return { room, playerId };
}

function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase().trim());
  return room || null;
}

function joinRoom(code, name) {
  const room = getRoom(code);
  if (!room) return { error: 'ما لقيناش partie بالكود هذا. تثبّت من الحروف.' };
  if (room.players.length >= 2) return { error: 'الـpartie هذي عامرة (زوز لاعبين برك).' };
  const playerId = makeId();
  room.players.push({ id: playerId, name: cleanName(name), score: 0, connected: true, socketId: null });
  room.lastActivity = Date.now();
  room.lastEvent = { type: 'join', text: `${room.players[1].name} دخل للـpartie 🎉`, ts: Date.now() };
  return { room, playerId };
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function other(room, playerId) {
  return room.players.find((p) => p.id !== playerId) || null;
}

// ---- حالة اللعبة اللي تتبعث للclients ----------------------------------
function publicState(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    settings: room.settings,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
    })),
    turnId: room.turnId,
    cardsPlayed: room.cardsPlayed,
    multiplier: room.multiplier,
    current: room.current,
    lastEvent: room.lastEvent,
    history: room.history.slice(-12),
  };
}

// ---- حركة اللعبة --------------------------------------------------------
function startGame(room, playerId) {
  if (room.players.length < 2) return { error: 'لازم زوز لاعبين باش تبدا الـpartie.' };
  if (playerId !== room.hostId) return { error: 'اللي عمل الـpartie هو اللي يبدا.' };
  room.status = 'playing';
  room.cardsPlayed = 0;
  room.multiplier = 1;
  room.current = null;
  room.history = [];
  room.players.forEach((p) => (p.score = 0));
  room.dealer = new Dealer(room.settings.cats);
  room.turnId = room.players[Math.floor(Math.random() * 2)].id;
  room.lastEvent = { type: 'start', text: 'يلّا نبداو ❤️', ts: Date.now() };
  return { ok: true };
}

function updateSettings(room, playerId, settings) {
  if (playerId !== room.hostId) return { error: 'الإعدادات يبدّلهم اللي عمل الـpartie.' };
  if (room.status === 'playing') return { error: 'ما تنجمش تبدّل الإعدادات في وسط الـpartie.' };
  if (Array.isArray(settings.cats)) {
    const cats = settings.cats.filter((c) => ALL_CATS.includes(c));
    if (cats.length === 0) return { error: 'اختار فئة وحدة على الأقل.' };
    room.settings.cats = cats;
  }
  if ([0, 10, 20, 30].includes(Number(settings.targetCards))) {
    room.settings.targetCards = Number(settings.targetCards);
  }
  room.dealer.setCategories(room.settings.cats);
  return { ok: true };
}

function drawCard(room, playerId) {
  if (room.status !== 'playing') return { error: 'الـpartie ما زالت ما بداتش.' };
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (room.current) return { error: 'عندك كارت مفتوح، كمّلو قبل.' };

  // 12% احتمال كارت خاص
  const isSpecial = Math.random() < 0.12;
  if (isSpecial) {
    const sp = room.dealer.drawSpecial();
    const current = {
      kind: 'special',
      effect: sp.effect,
      title: sp.title,
      text: sp.text,
      id: sp.id,
      phase: 'open',
      swaps: 0,
      extra: null,
      extras: null,
      points: 0,
    };
    if (sp.effect === 'couple') {
      const q = room.dealer.draw();
      current.extra = q;
      current.points = q.points;
    }
    if (sp.effect === 'chaos') {
      const m1 = room.dealer.draw('mission');
      let m2 = room.dealer.draw('mission');
      if (m2.id === m1.id) m2 = room.dealer.draw('mission');
      current.extras = [m1, m2];
      current.points = 3;
    }
    room.current = current;
  } else {
    const card = room.dealer.draw();
    room.current = { kind: 'card', ...card, phase: 'open', swaps: 0 };
  }
  room.lastActivity = Date.now();
  room.lastEvent = { type: 'draw', text: null, ts: Date.now() };
  return { ok: true };
}

function swapCard(room, playerId) {
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (!room.current || room.current.phase !== 'open') return { error: 'ما فماش كارت باش تبدّلو.' };
  if (room.current.kind === 'special') return { error: 'الكارت الخاص ما يتبدّلش 😅' };
  if (room.current.swaps >= 3) return { error: 'خلاص، بدّلت 3 مرّات. جاوب على هذا 😄' };
  const swaps = room.current.swaps + 1;
  const card = room.dealer.draw(room.current.cat);
  room.current = { kind: 'card', ...card, phase: 'open', swaps };
  room.lastActivity = Date.now();
  return { ok: true };
}

/**
 * يحسم الكارت.
 * result: 'done' (جاوبت) | 'same' (جاوبنا كيف كيف) | 'diff' (لا) | 'fail' (ما عملتهاش)
 */
function resolveCard(room, playerId, result) {
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  const cur = room.current;
  if (!cur || cur.phase !== 'open') return { error: 'ما فماش كارت مفتوح.' };

  const me = findPlayer(room, playerId);
  const partner = other(room, playerId);
  const mult = room.multiplier;
  let gained = { [me.id]: 0 };
  let text = '';

  if (cur.kind === 'special') {
    if (cur.effect === 'double') {
      room.multiplier = 2;
      text = 'النقاط ×2 في الكارت الجاي 🎲';
      room.current = null; // نفس اللاعب يعاود يسحب
      room.lastEvent = { type: 'double', text, ts: Date.now() };
      room.lastActivity = Date.now();
      return { ok: true, keepTurn: true, redraw: true };
    }
    if (cur.effect === 'switch') {
      room.current = null;
      room.turnId = partner ? partner.id : room.turnId;
      text = 'بدّلنا الدور 🔄';
      room.lastEvent = { type: 'switch', text, ts: Date.now() };
      room.lastActivity = Date.now();
      return { ok: true, switched: true };
    }
    if (cur.effect === 'couple') {
      const pts = (cur.points || 2) * mult;
      me.score += pts;
      if (partner) partner.score += pts;
      gained = { [me.id]: pts, ...(partner ? { [partner.id]: pts } : {}) };
      text = `❤️ COUPLE BONUS: +${pts} للزوز`;
    }
    if (cur.effect === 'chaos') {
      const pts = (result === 'fail' ? 0 : 3) * mult;
      me.score += pts;
      if (partner) partner.score += pts;
      gained = { [me.id]: pts, ...(partner ? { [partner.id]: pts } : {}) };
      text = pts ? `😂 CHAOS: +${pts} للزوز` : '😂 CHAOS: حتى واحد ما عملها، 0 نقاط';
    }
  } else if (cur.vote) {
    // كارت «قدّاش نعرفك؟» — vote متاع نفس الجواب
    if (result === 'same') {
      const pts = cur.points * mult;
      me.score += pts;
      if (partner) partner.score += pts;
      gained = { [me.id]: pts, ...(partner ? { [partner.id]: pts } : {}) };
      text = `✅ جاوبتوا كيف كيف! +${pts} للزوز`;
    } else {
      const pts = 1 * mult;
      me.score += pts;
      gained = { [me.id]: pts };
      text = `❌ ما توافقتوش… +${pts} لـ${me.name}`;
    }
  } else {
    const pts = (result === 'fail' ? 0 : cur.points) * mult;
    me.score += pts;
    gained = { [me.id]: pts };
    text = pts ? `+${pts} لـ${me.name}` : `${me.name} ما عملهاش الكارت 😅`;
  }

  room.multiplier = 1;
  room.cardsPlayed += 1;
  cur.phase = 'resolved';
  cur.gained = gained;
  cur.resultText = text;
  room.history.push({
    playerId: me.id,
    name: me.name,
    cat: cur.kind === 'special' ? cur.effect : cur.cat,
    points: gained[me.id] || 0,
    ts: Date.now(),
  });
  room.lastEvent = { type: 'score', text, ts: Date.now() };
  room.lastActivity = Date.now();

  const target = room.settings.targetCards;
  if (target > 0 && room.cardsPlayed >= target) {
    room.status = 'ended';
    room.current = null;
  }
  return { ok: true, resolved: true, ended: room.status === 'ended' };
}

function passTurn(room, playerId) {
  if (room.status !== 'playing') return { error: 'الـpartie موش خدّامة توّا.' };
  if (room.turnId !== playerId) return { error: 'موش دورك توّا 🙂' };
  if (room.current && room.current.phase === 'open') {
    return { error: 'كمّل الكارت قبل ما تمرّر الدور.' };
  }
  const partner = other(room, playerId);
  room.current = null;
  if (partner) room.turnId = partner.id;
  room.lastEvent = { type: 'turn', text: null, ts: Date.now() };
  room.lastActivity = Date.now();
  return { ok: true };
}

function endGame(room) {
  room.status = 'ended';
  room.current = null;
  room.lastActivity = Date.now();
  room.lastEvent = { type: 'end', text: 'سالينا 🏆', ts: Date.now() };
  return { ok: true };
}

function restartGame(room, playerId) {
  const res = startGame(room, room.hostId === playerId ? playerId : room.hostId);
  return res;
}

function gc() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
  }
}
setInterval(gc, 1000 * 60 * 15).unref();

module.exports = {
  rooms,
  createRoom,
  joinRoom,
  getRoom,
  findPlayer,
  other,
  publicState,
  startGame,
  updateSettings,
  drawCard,
  swapCard,
  resolveCard,
  passTurn,
  endGame,
  restartGame,
};
