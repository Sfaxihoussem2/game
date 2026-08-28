'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const R = require('./lib/rooms');
const { Dealer, CATEGORIES } = require('./lib/cards');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 25000,
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: R.rooms.size }));
app.get('/api/stats', (_req, res) => res.json(new Dealer().stats()));
app.get('/api/categories', (_req, res) => res.json(CATEGORIES));

// ---- helpers ------------------------------------------------------------
function broadcast(room) {
  io.to(room.code).emit('state', R.publicState(room));
}

function bindSocket(socket, room, playerId) {
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
  const p = R.findPlayer(room, playerId);
  if (p) {
    p.connected = true;
    p.socketId = socket.id;
  }
}

function ctx(socket) {
  const room = R.getRoom(socket.data.code);
  if (!room) return { error: 'الـpartie ما عادش موجودة. اعمل وحدة جديدة.' };
  const player = R.findPlayer(room, socket.data.playerId);
  if (!player) return { error: 'ما عرفناكش في الـpartie هذي.' };
  return { room, player };
}

// wrapper: يعمل الأكشن، يبعث الحالة للزوز، ويرجع الرد
function act(socket, cb, fn) {
  const c = ctx(socket);
  if (c.error) return cb && cb({ ok: false, error: c.error });
  const res = fn(c.room, c.player) || {};
  if (res.error) return cb && cb({ ok: false, error: res.error });
  broadcast(c.room);
  cb && cb({ ok: true, ...res });
}

// ---- socket API ---------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('room:create', ({ name } = {}, cb) => {
    const { room, playerId } = R.createRoom(name);
    bindSocket(socket, room, playerId);
    cb && cb({ ok: true, code: room.code, playerId, state: R.publicState(room) });
  });

  socket.on('room:join', ({ code, name } = {}, cb) => {
    const res = R.joinRoom(code, name);
    if (res.error) return cb && cb({ ok: false, error: res.error });
    bindSocket(socket, res.room, res.playerId);
    cb && cb({ ok: true, code: res.room.code, playerId: res.playerId, state: R.publicState(res.room) });
    broadcast(res.room);
  });

  // رجوع بعد rechargement ولا قطع connexion
  socket.on('room:rejoin', ({ code, playerId } = {}, cb) => {
    const room = R.getRoom(code);
    if (!room) return cb && cb({ ok: false, error: 'الـpartie ما عادش موجودة.' });
    const player = R.findPlayer(room, playerId);
    if (!player) return cb && cb({ ok: false, error: 'ما عرفناكش في الـpartie هذي.' });
    bindSocket(socket, room, playerId);
    cb && cb({ ok: true, code: room.code, playerId, state: R.publicState(room) });
    broadcast(room);
  });

  socket.on('room:settings', ({ settings } = {}, cb) =>
    act(socket, cb, (room, player) => R.updateSettings(room, player.id, settings || {}))
  );

  socket.on('game:start', (_p, cb) =>
    act(socket, cb, (room, player) => R.startGame(room, player.id))
  );

  socket.on('card:draw', (_p, cb) =>
    act(socket, cb, (room, player) => R.drawCard(room, player.id))
  );

  socket.on('card:swap', (_p, cb) =>
    act(socket, cb, (room, player) => R.swapCard(room, player.id))
  );

  socket.on('card:resolve', ({ result } = {}, cb) => {
    const c = ctx(socket);
    if (c.error) return cb && cb({ ok: false, error: c.error });
    const res = R.resolveCard(c.room, c.player.id, result || 'done');
    if (res.error) return cb && cb({ ok: false, error: res.error });
    broadcast(c.room);
    if (res.resolved) io.to(c.room.code).emit('fx', { type: 'confetti', by: c.player.id });
    if (res.ended) io.to(c.room.code).emit('fx', { type: 'end' });
    cb && cb({ ok: true, ...res });
  });

  socket.on('turn:pass', (_p, cb) =>
    act(socket, cb, (room, player) => R.passTurn(room, player.id))
  );

  socket.on('game:end', (_p, cb) => act(socket, cb, (room) => R.endGame(room)));

  socket.on('game:restart', (_p, cb) =>
    act(socket, cb, (room, player) => R.restartGame(room, player.id))
  );

  // نبضة صغيرة: "شريكك يكتب/موجود"
  socket.on('nudge', (_p) => {
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
  console.log(`🃏  ${s.total} كارت جاهز في الداتاباز`);
});
