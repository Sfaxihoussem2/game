/* اختبار حقيقي: زوز clients يلعبو partie كاملة على السيرفر */
'use strict';
const { io } = require('socket.io-client');
const URL = process.env.TEST_URL || 'http://localhost:3000';

const ask = (s, e, p) => new Promise((r) => s.emit(e, p, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fails++; };

(async () => {
  const A = io(URL), B = io(URL);
  let sA = null, sB = null;
  A.on('state', (s) => (sA = s));
  B.on('state', (s) => (sB = s));
  await new Promise((r) => A.on('connect', r));
  await new Promise((r) => B.on('connect', r));

  // 1) إنشاء + دخول
  const c = await ask(A, 'room:create', { name: 'غفران' });
  ok(c.ok && /^[A-Z0-9]{5}$/.test(c.code), `partie تخلقت بالكود ${c.code}`);
  const bad = await ask(B, 'room:join', { code: 'ZZZZZ', name: 'محمد' });
  ok(!bad.ok, 'كود غالط => رفض');
  const j = await ask(B, 'room:join', { code: c.code, name: 'محمد' });
  ok(j.ok && j.state.players.length === 2, 'اللاعب الثاني دخل');

  const C = io(URL);
  await new Promise((r) => C.on('connect', r));
  const third = await ask(C, 'room:join', { code: c.code, name: 'ثالث' });
  ok(!third.ok, 'ثالث لاعب => مرفوض (زوز برك)');
  C.close();

  // 2) الإعدادات + البداية
  ok((await ask(B, 'room:settings', { settings: { targetCards: 10 } })).ok === false, 'غير الhost ما ينجمش يبدّل الإعدادات');
  ok((await ask(A, 'room:settings', { settings: { targetCards: 10, cats: ['love', 'knowledge', 'mission', 'situation', 'bold', 'deep', 'relation', 'humor'] } })).ok, 'الhost بدّل الإعدادات');
  ok((await ask(B, 'game:start')).ok === false, 'غير الhost ما يبداش');
  ok((await ask(A, 'game:start')).ok, 'الـpartie بدات');
  await wait(60);
  ok(sA && sB && sA.turnId === sB.turnId, 'الدور متزامن بين الزوز');

  // 3) منع اللعب في غير الدور
  const cur = () => sA;
  const turnSock = () => (cur().turnId === c.playerId ? A : B);
  const offSock = () => (cur().turnId === c.playerId ? B : A);
  ok((await ask(offSock(), 'card:draw')).ok === false, 'اللاعب اللي موش دورو ما ينجمش يسحب');

  // 4) دورة كاملة
  let drawn = 0, guard = 0;
  while (sA.status === 'playing' && guard++ < 60) {
    const s = turnSock();
    const d = await ask(s, 'card:draw');
    if (!d.ok) { await wait(30); continue; }
    await wait(30);
    drawn++;
    const card = sA.current;
    if (!card) continue;

    if (card.kind === 'special') {
      await ask(s, 'card:resolve', { result: 'done' });
    } else if (card.vote) {
      ok((await ask(offSock(), 'card:resolve', { result: 'same' })).ok === false, 'ما ينجمش يحسم الكارت في غير دورو');
      await ask(s, 'card:resolve', { result: Math.random() < 0.5 ? 'same' : 'diff' });
    } else if (card.cat === 'mission') {
      await ask(s, 'card:swap');
      await ask(s, 'card:resolve', { result: 'done' });
    } else {
      await ask(s, 'card:resolve', { result: 'done' });
    }
    await wait(30);
    if (sA.status !== 'playing') break;
    if (sA.current && sA.current.phase === 'resolved') await ask(turnSock(), 'turn:pass');
    await wait(30);
  }

  ok(sA.status === 'ended', `الـpartie سالات بعد ${sA.cardsPlayed} كارت`);
  ok(sA.cardsPlayed === 10, 'العدّاد وقف على 10 كروت كيما الإعدادات');
  ok(JSON.stringify(sA.players.map((p) => p.score)) === JSON.stringify(sB.players.map((p) => p.score)), 'السكور متزامن: ' + sA.players.map((p) => `${p.name}=${p.score}`).join(' , '));
  ok(sA.players.some((p) => p.score > 0), 'فمّة نقاط تحسبت');

  // 5) reconnexion (rechargement متاع الصفحة)
  A.close();
  await wait(120);
  const A2 = io(URL);
  await new Promise((r) => A2.on('connect', r));
  const re = await ask(A2, 'room:rejoin', { code: c.code, playerId: c.playerId });
  ok(re.ok && re.state.code === c.code, 'رجوع بعد قطع الكونيكسيون: الـpartie ترجعت');

  // 6) نعاودو
  ok((await ask(A2, 'game:restart')).ok, 'restart خدم');
  await wait(60);
  ok(sB.status === 'playing' && sB.cardsPlayed === 0 && sB.players.every((p) => p.score === 0), 'partie جديدة بسكور 0');

  A2.close(); B.close();
  console.log(fails ? `\n❌ ${fails} test(s) طاحو` : '\n🎉 كل الtests نجحو');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
