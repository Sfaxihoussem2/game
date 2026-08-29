'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const R = require('./lib/rooms');
const { Dealer, CATEGORIES } = require('./lib/cards');
const { GAMES } = require('./lib/games');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 25000,
  maxHttpBufferSize: 8e6, // باش تعدّي تصويرة الpuzzle
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: R.rooms.size }));
app.get('/api/stats', (_req, res) => res.json(new Dealer().stats()));
app.get('/api/categories', (_req, res) => res.json(CATEGORIES));
app.get('/api/games', (_req, res) => res.json(GAMES));

// ---- بثّ الحالة: كل لاعب ياخذ نسخة متاعو (بلا أسرار الآخر) -------------
function broadcast(room) {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('state', R.publicState(room, p.id));
  }
}

function bindSocket(socket, room, playerId) {
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
  const p = R.findPlayer(room, playerId);
  if (p) { p.connected = true; p.socketId = socket.id; }
}

function ctx(socket) {
  const room = R.getRoom(socket.data.code);
  if (!room) return { error: 'الـpartie ما عادش موجودة. اعمل وحدة جديدة.' };
  const player = R.findPlayer(room, socket.data.playerId);
  if (!player) return { error: 'ما عرفناكش في الـpartie هذي.' };
  return { room, player };
}

function act(socket, cb, fn) {
  const c = ctx(socket);
  if (c.error) return cb && cb({ ok: false, error: c.error });
  const before = c.room.achievements.length;
  const res = fn(c.room, c.player) || {};
  if (res.error) return cb && cb({ ok: false, error: res.error });
  broadcast(c.room);
  const fresh = c.room.achievements.slice(before);
  if (fresh.length) {
    const meta = R.ACHIEVEMENTS.filter((a) => fresh.includes(a.id))
      .map((a) => ({ emoji: a.emoji, name: a.name }));
    io.to(c.room.code).emit('fx', { type: 'badge', badges: meta });
  }
  cb && cb({ ok: true, ...res });
}

// ---- API ----------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('room:create', ({ name } = {}, cb) => {
    const { room, playerId } = R.createRoom(name);
    bindSocket(socket, room, playerId);
    cb && cb({ ok: true, code: room.code, playerId, state: R.publicState(room, playerId) });
  });

  socket.on('room:join', ({ code, name } = {}, cb) => {
    const res = R.joinRoom(code, name);
    if (res.error) return cb && cb({ ok: false, error: res.error });
    bindSocket(socket, res.room, res.playerId);
    cb && cb({ ok: true, code: res.room.code, playerId: res.playerId, state: R.publicState(res.room, res.playerId) });
    broadcast(res.room);
  });

  socket.on('room:rejoin', ({ code, playerId } = {}, cb) => {
    const room = R.getRoom(code);
    if (!room) return cb && cb({ ok: false, error: 'الـpartie ما عادش موجودة.' });
    const player = R.findPlayer(room, playerId);
    if (!player) return cb && cb({ ok: false, error: 'ما عرفناكش في الـpartie هذي.' });
    bindSocket(socket, room, playerId);
    cb && cb({ ok: true, code: room.code, playerId, state: R.publicState(room, playerId) });
    broadcast(room);
    // للرسم: نبعثو الخطوط اللي فاتت
    if (room.game && room.game.engine === 'draw' && room.game.strokes) {
      io.to(socket.id).emit('draw:sync', { strokes: room.game.strokes });
    }
  });

  socket.on('room:settings', ({ settings } = {}, cb) =>
    act(socket, cb, (room, p) => R.updateSettings(room, p.id, settings || {})));

  // ---- الهاب ----
  socket.on('hub:open', (_p, cb) => act(socket, cb, (room, p) => R.openHub(room, p.id)));
  socket.on('hub:propose', ({ gameId } = {}, cb) =>
    act(socket, cb, (room, p) => R.proposeGame(room, p.id, gameId)));
  socket.on('hub:answer', ({ accept } = {}, cb) =>
    act(socket, cb, (room, p) => R.answerProposal(room, p.id, !!accept)));
  socket.on('hub:ready', ({ ready } = {}, cb) =>
    act(socket, cb, (room, p) => R.setReady(room, p.id, ready !== false)));
  socket.on('game:again', (_p, cb) =>
    act(socket, cb, (room) => (room.game ? R.startGame(room, room.game.id) : { error: 'ما فماش لعبة.' })));
  socket.on('session:end', (_p, cb) => act(socket, cb, (room) => R.endSession(room)));
  socket.on('session:new', (_p, cb) => act(socket, cb, (room) => R.newSession(room)));

  // ---- لعبة الكروت ----
  socket.on('card:draw', (_p, cb) => act(socket, cb, (room, p) => R.drawCard(room, p.id)));
  socket.on('card:swap', (_p, cb) => act(socket, cb, (room, p) => R.swapCard(room, p.id)));
  socket.on('card:resolve', ({ result } = {}, cb) => {
    const c = ctx(socket);
    if (c.error) return cb && cb({ ok: false, error: c.error });
    const res = R.resolveCard(c.room, c.player.id, result || 'done');
    if (res.error) return cb && cb({ ok: false, error: res.error });
    broadcast(c.room);
    if (res.resolved) io.to(c.room.code).emit('fx', { type: 'confetti', by: c.player.id });
    cb && cb({ ok: true, ...res });
  });
  socket.on('turn:pass', (_p, cb) => act(socket, cb, (room, p) => R.passTurn(room, p.id)));
  socket.on('game:end', (_p, cb) => act(socket, cb, (room) => R.endCurrentGame(room)));

  // ---- باقي الألعاب ----
  socket.on('game:action', ({ action, payload } = {}, cb) => {
    const c = ctx(socket);
    if (c.error) return cb && cb({ ok: false, error: c.error });
    const before = c.room.achievements.length;
    const res = R.gameAction(c.room, c.player.id, action, payload);
    if (res.error) return cb && cb({ ok: false, error: res.error });
    broadcast(c.room);
    const fresh = c.room.achievements.slice(before);
    if (fresh.length) {
      io.to(c.room.code).emit('fx', {
        type: 'badge',
        badges: R.ACHIEVEMENTS.filter((a) => fresh.includes(a.id)).map((a) => ({ emoji: a.emoji, name: a.name })),
      });
    }
    const g = c.room.game;
    if (g && g.engine === 'duel' && g.current && g.current.verdict === 'same') io.to(c.room.code).emit('fx', { type: 'confetti' });
    if (g && g.engine === 'draw' && g.current && g.current.found && !g.current.timeout) io.to(c.room.code).emit('fx', { type: 'confetti' });
    if (res.done) io.to(c.room.code).emit('fx', { type: 'confetti', big: true });
    cb && cb({ ok: true, ...res });
  });

  // ---- رسم مباشر: نمرّرو الخطوط بلا ما نعيدو بثّ الحالة الكل ----
  socket.on('draw:stroke', (stroke) => {
    const c = ctx(socket);
    if (c.error) return;
    const g = c.room.game;
    if (!g || g.engine !== 'draw' || !g.current) return;
    if (c.player.id !== g.current.drawerId) return;
    g.strokes = g.strokes || [];
    if (g.strokes.length < 4000) g.strokes.push(stroke);
    c.room.lastActivity = Date.now();
    socket.to(c.room.code).emit('draw:stroke', stroke);
  });

  socket.on('draw:clear', () => {
    const c = ctx(socket);
    if (c.error) return;
    const g = c.room.game;
    if (!g || g.engine !== 'draw') return;
    if (c.player.id !== (g.current && g.current.drawerId)) return;
    g.strokes = [];
    io.to(c.room.code).emit('draw:clear');
  });

  socket.on('nudge', () => {
    const c = ctx(socket);
    if (c.error) return;
    socket.to(c.room.code).emit('fx', { type: 'nudge', by: c.player.id, name: c.player.name });
  });

  socket.on('disconnect', () => {
    const room = R.getRoom(socket.data.code);
    if (!room) return;
    const player = R.findPlayer(room, socket.data.playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      player.socketId = null;
      broadcast(room);
    }
  });
});

server.listen(PORT, () => {
  const s = new Dealer().stats();
  console.log(`❤️  نعرفك قدّاش؟ — http://localhost:${PORT}`);
  console.log(`🃏  ${s.total} كارت + ${Object.keys(GAMES).length} ألعاب جاهزين`);
});
