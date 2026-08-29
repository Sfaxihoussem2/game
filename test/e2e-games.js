/* اختبار كامل: زوز clients يعدّيو على الهاب و الألعاب الكل */
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

  const c = await ask(A, 'room:create', { name: 'غفران' });
  const j = await ask(B, 'room:join', { code: c.code, name: 'حوسام' });
  ok(c.ok && j.ok, `partie ${c.code} + زوز لاعبين`);
  const idA = c.playerId, idB = j.playerId;
  const sock = (id) => (id === idA ? A : B);

  ok((await ask(B, 'hub:open')).ok === false, 'غير الhost ما يفتحش الهاب من اللوبي');
  ok((await ask(A, 'hub:open')).ok, 'الهاب تفتح');
  await wait(50);
  ok(sB.status === 'hub', 'الزوز في الهاب');

  async function launch(gameId) {
    await ask(A, 'hub:propose', { gameId });
    await wait(30);
    ok(sB.proposal && sB.proposal.gameId === gameId, `${gameId}: الاقتراح وصل للطرف الآخر`);
    ok((await ask(A, 'hub:ready', { ready: true })).ok === false, `${gameId}: ما ينجمش يولّي ready قبل الموافقة`);
    await ask(B, 'hub:answer', { accept: true });
    await ask(A, 'hub:ready', { ready: true });
    await wait(30);
    ok(sA.status === 'hub' && sA.proposal.ready[idA] === true, `${gameId}: لاعب واحد ready، اللعبة ما بداتش`);
    await ask(B, 'hub:ready', { ready: true });
    await wait(50);
    ok(sA.status === 'playing' && sA.game.id === gameId, `${gameId}: بدات كي الزوز جاهزين`);
  }

  // 1) WYR — اختيار متزامن + إخفاء
  await launch('wyr');
  let opts = sA.game.current.options;
  await ask(A, 'game:action', { action: 'submit', payload: { value: opts[0] } });
  await wait(40);
  ok(Object.keys(sB.game.current.answers).length === 0, 'wyr: جواب الشريك مخبّي قبل ما يجاوب');
  await ask(B, 'game:action', { action: 'submit', payload: { value: opts[0] } });
  await wait(40);
  ok(sA.game.current.revealed && sA.game.current.verdict === 'same', 'wyr: كشف + نفس الاختيار');
  ok(sA.players.every((p) => p.score >= 1), 'wyr: النقاط تحسبت للزوز');
  await ask(A, 'game:action', { action: 'next' });
  await wait(30);
  ok(sA.game.round === 2, 'wyr: round جديد');

  // 2) KP — نص + حكم
  await ask(A, 'game:end'); await ask(A, 'hub:open');
  await launch('kp');
  const subj = sA.game.current.subjectId;
  ok(!!subj, 'kp: فمّة subject للسؤال');
  await ask(sock(subj), 'game:action', { action: 'submit', payload: { value: 'Pizza' } });
  await ask(sock(subj === idA ? idB : idA), 'game:action', { action: 'submit', payload: { value: 'Pizza' } });
  await wait(40);
  ok(sA.game.current.revealed && !sA.game.current.verdict, 'kp: كشف بلا حكم آلي (نص)');
  await ask(A, 'game:action', { action: 'judge', payload: { verdict: 'same' } });
  await wait(30);
  ok(sA.game.current.verdict === 'same', 'kp: الحكم تسجّل');

  // 3) TOR
  await ask(A, 'game:end'); await ask(A, 'hub:open');
  await launch('tor');
  const turn = sA.game.turnId;
  ok((await ask(sock(turn === idA ? idB : idA), 'game:action', { action: 'pick', payload: { kind: 'truth' } })).ok === false, 'tor: ما ينجمش يلعب في غير دورو');
  await ask(sock(turn), 'game:action', { action: 'pick', payload: { kind: 'challenge' } });
  await wait(30);
  ok(sA.game.current && sA.game.current.points === 3, 'tor: challenge = 3 نقاط');
  await ask(sock(turn), 'game:action', { action: 'resolve', payload: { result: 'done' } });
  await ask(sock(turn), 'game:action', { action: 'next' });
  await wait(30);
  ok(sA.game.turnId !== turn, 'tor: الدور عدّى');

  // 4) SPEED
  await ask(A, 'game:end'); await ask(A, 'hub:open');
  await launch('speed');
  ok(sA.game.current.endsAt > Date.now(), 'speed: timer خدّام');
  await ask(A, 'game:action', { action: 'submit', payload: { value: 'a\nb\nc' } });
  await ask(B, 'game:action', { action: 'submit', payload: { value: 'x\ny' } });
  await wait(40);
  ok(sA.game.current.revealed && sA.game.current.pts[idA] === 3 && sA.game.current.pts[idB] === 2, 'speed: النقاط حسب عدد الحاجات');

  // 5) PUZZLE
  await ask(A, 'game:end'); await ask(A, 'hub:open');
  await launch('puzzle');
  ok(sA.game.phase === 'setup', 'puzzle: مرحلة الإعداد');
  await ask(A, 'game:action', { action: 'setup', payload: { image: 'data:image/jpeg;base64,AAAA', size: 3, mode: 'coop' } });
  await wait(40);
  ok(sB.game.phase === 'play' && sB.game.image, 'puzzle: التصويرة وصلت للطرف الآخر');
  let guard = 0;
  while (sA.game.phase === 'play' && guard++ < 60) {
    const s = sA.game.slots;
    const i = s.findIndex((v, k) => v !== k);
    if (i < 0) break;
    await ask(B, 'game:action', { action: 'swap', payload: { a: i, b: s.indexOf(i) } });
    await wait(15);
  }
  ok(sA.status === 'result', 'puzzle: كمل و وصلنا للنتيجة');

  // 6) DRAW
  await ask(A, 'hub:open');
  await launch('draw');
  const drawer = sA.game.current.drawerId;
  const guesser = drawer === idA ? idB : idA;
  const wordForDrawer = (drawer === idA ? sA : sB).game.current.word;
  const wordForGuesser = (guesser === idA ? sA : sB).game.current.word;
  ok(!!wordForDrawer && wordForGuesser === null, 'draw: الكلمة تتشاف عند الرسّام برك');
  ok((await ask(sock(drawer), 'game:action', { action: 'guess', payload: { text: wordForDrawer } })).ok === false, 'draw: الرسّام ما ينجمش يخمّن');
  await ask(sock(guesser), 'game:action', { action: 'guess', payload: { text: 'حاجة غالطة' } });
  await wait(30);
  ok(sA.game.current.found === false, 'draw: تخمين غالط ما يكملش الround');
  await ask(sock(guesser), 'game:action', { action: 'guess', payload: { text: wordForDrawer } });
  await wait(40);
  ok(sA.game.current.found && sA.game.current.points >= 1, 'draw: تخمين صحيح + نقاط');

  // 7) stats + session
  await ask(A, 'game:end');
  await ask(A, 'session:end');
  await wait(40);
  ok(sA.status === 'ended' && sA.stats.gamesPlayed >= 6, `session: ${sA.stats.gamesPlayed} ألعاب متلعبين`);
  ok(sA.achievements.length > 0, 'شارات: ' + sA.achievements.join(', '));
  ok(JSON.stringify(sA.players.map((p) => p.score)) === JSON.stringify(sB.players.map((p) => p.score)),
    'السكور العام متزامن: ' + sA.players.map((p) => `${p.name}=${p.score}`).join(' , '));

  // 8) reconnexion
  A.close(); await wait(120);
  const A2 = io(URL);
  await new Promise((r) => A2.on('connect', r));
  const re = await ask(A2, 'room:rejoin', { code: c.code, playerId: idA });
  ok(re.ok && re.state.status === 'ended', 'reconnexion: الحالة ترجعت كيما كانت');
  await ask(A2, 'session:new');
  await wait(40);
  ok(sB.status === 'hub' && sB.players.every((p) => p.score === 0), 'session جديدة: سكور 0 والزوز في الهاب');

  A2.close(); B.close();
  console.log(fails ? `\n❌ ${fails} test(s) طاحو` : '\n🎉 كل الtests نجحو');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
