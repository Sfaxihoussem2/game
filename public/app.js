/* ================= نعرفك قدّاش؟ — client ================= */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });

  const CAT = {
    love: { label: 'سؤال حب', emoji: '❤️', color: 'var(--cat-love)' },
    knowledge: { label: 'قدّاش نعرفك؟', emoji: '🧠', color: 'var(--cat-knowledge)' },
    situation: { label: 'موقف', emoji: '🎭', color: 'var(--cat-situation)' },
    humor: { label: 'ضحك', emoji: '😂', color: 'var(--cat-humor)' },
    bold: { label: 'جريء', emoji: '🔥', color: 'var(--cat-bold)' },
    mission: { label: 'مهمّة', emoji: '🎯', color: 'var(--cat-mission)' },
    deep: { label: 'سؤال عميق', emoji: '💭', color: 'var(--cat-deep)' },
    relation: { label: 'علاقتنا', emoji: '💑', color: 'var(--cat-relation)' },
  };
  const CAT_ORDER = ['love', 'knowledge', 'situation', 'humor', 'mission', 'deep', 'relation', 'bold'];

  const SS = 'naarfek.session';
  let me = { code: null, playerId: null, name: '' };
  let state = null;
  let shownCardKey = null;

  // ---------- أدوات ----------
  const saveSession = () => localStorage.setItem(SS, JSON.stringify(me));
  const loadSession = () => {
    try { return JSON.parse(localStorage.getItem(SS) || 'null'); } catch { return null; }
  };
  const clearSession = () => localStorage.removeItem(SS);

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-bad', !!bad);
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  function screen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-active'));
    $(id).classList.add('is-active');
  }

  function emit(evt, payload) {
    return new Promise((res) => {
      socket.timeout(8000).emit(evt, payload, (err, ack) => {
        if (err) { toast('السيرفر ما جاوبش… عاود جرّب.', true); return res({ ok: false }); }
        if (ack && ack.error) toast(ack.error, true);
        res(ack || { ok: false });
      });
    });
  }

  const meP = () => (state ? state.players.find((p) => p.id === me.playerId) : null);
  const partnerP = () => (state ? state.players.find((p) => p.id !== me.playerId) : null);
  const isMyTurn = () => state && state.turnId === me.playerId;

  // ---------- شاشة البداية ----------
  fetch('/api/stats').then((r) => r.json()).then((s) => {
    $('deck-stat').textContent = `🃏 ${s.total} كارت في اللعبة`;
  }).catch(() => { $('deck-stat').textContent = ''; });

  const nameInput = $('name-input');
  const codeInput = $('code-input');
  const saved = loadSession();
  if (saved && saved.name) nameInput.value = saved.name;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('btn-create').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return toast('اكتب إسمك قبل 🙂', true);
    const ack = await emit('room:create', { name });
    if (!ack.ok) return;
    me = { code: ack.code, playerId: ack.playerId, name };
    saveSession();
    applyState(ack.state);
  });

  $('btn-join').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    if (!name) return toast('اكتب إسمك قبل 🙂', true);
    if (code.length < 5) return toast('الكود متكوّن من 5 حروف/أرقام.', true);
    const ack = await emit('room:join', { code, name });
    if (!ack.ok) return;
    me = { code: ack.code, playerId: ack.playerId, name };
    saveSession();
    applyState(ack.state);
  });

  // من الرابط: ?code=XXXXX
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) codeInput.value = urlCode.toUpperCase().slice(0, 5);

  // ---------- اللوبي ----------
  $('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(me.code);
      toast('الكود تنسخ ✅');
    } catch {
      toast('انسخو باليد: ' + me.code);
    }
  });

  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/?code=${me.code}`;
    const text = `يلّا نلعبو "نعرفك قدّاش؟ ❤️"\nالكود: ${me.code}\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'نعرفك قدّاش؟', text }); return; } catch { /* ألغى */ }
    }
    try { await navigator.clipboard.writeText(text); toast('الدعوة تنسخت، عدّيها لشريكك 💌'); }
    catch { toast('الكود: ' + me.code); }
  });

  function buildCats() {
    const box = $('cats-list');
    box.innerHTML = '';
    CAT_ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'cat-chip';
      b.dataset.cat = id;
      b.textContent = `${CAT[id].emoji} ${CAT[id].label}`;
      b.style.color = CAT[id].color;
      b.addEventListener('click', () => {
        if (!state || state.hostId !== me.playerId) return toast('الإعدادات يبدّلهم اللي عمل الـpartie.', true);
        const cats = new Set(state.settings.cats);
        cats.has(id) ? cats.delete(id) : cats.add(id);
        emit('room:settings', { settings: { cats: [...cats] } });
      });
      box.appendChild(b);
    });
  }
  buildCats();

  $('length-list').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (!state || state.hostId !== me.playerId) return toast('الإعدادات يبدّلهم اللي عمل الـpartie.', true);
    emit('room:settings', { settings: { targetCards: Number(b.dataset.len) } });
  });

  $('btn-start').addEventListener('click', () => emit('game:start'));
  $('btn-leave-lobby').addEventListener('click', () => { clearSession(); location.href = '/'; });
  $('btn-home').addEventListener('click', () => { clearSession(); location.href = '/'; });
  $('btn-end').addEventListener('click', () => {
    if (confirm('تحب تسالي الـpartie وتشوف النتيجة؟')) emit('game:end');
  });
  $('btn-again').addEventListener('click', () => emit('game:restart'));
  $('btn-nudge').addEventListener('click', () => { socket.emit('nudge'); toast('نبّهناه 👋'); });

  // ---------- الرندر ----------
  function applyState(s) {
    state = s;
    if (s.status === 'lobby') { screen('screen-lobby'); renderLobby(); }
    else if (s.status === 'playing') { screen('screen-game'); renderGame(); }
    else { screen('screen-end'); renderEnd(); }
  }

  function renderLobby() {
    $('room-code').textContent = state.code;
    const box = $('lobby-players');
    box.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const p = state.players[i];
      const d = document.createElement('div');
      if (p) {
        d.className = 'player' + (p.connected ? '' : ' is-off');
        d.innerHTML = `<strong>${esc(p.name)}<span class="dot"></span></strong>
          <small>${p.id === state.hostId ? 'عمل الـpartie' : 'دخل بالكود'}${p.connected ? '' : ' · offline'}</small>`;
      } else {
        d.className = 'player is-empty';
        d.innerHTML = `<strong>—</strong><small>نستنّاو الشريك…</small>`;
      }
      box.appendChild(d);
    }

    document.querySelectorAll('.cat-chip').forEach((c) => {
      c.classList.toggle('is-on', state.settings.cats.includes(c.dataset.cat));
    });
    document.querySelectorAll('#length-list button').forEach((b) => {
      b.classList.toggle('is-on', Number(b.dataset.len) === state.settings.targetCards);
    });

    const isHost = state.hostId === me.playerId;
    const ready = state.players.length === 2;
    $('btn-start').disabled = !(isHost && ready);
    $('btn-start').textContent = ready ? 'يلّا نبداو ❤️' : 'نستنّاو الشريك…';
    $('lobby-hint').textContent = !ready
      ? `عدّي الكود ${state.code} لشريكك باش يدخل.`
      : isHost ? 'الزوز موجودين. تنجم تبدا! ' : 'نستنّاو صاحب الـpartie يبدا…';
    $('settings-panel').style.opacity = isHost ? 1 : 0.65;
  }

  function renderGame() {
    const p1 = meP(), p2 = partnerP();
    hud('hud-p1', p1);
    hud('hud-p2', p2);
    $('hud-progress').textContent = state.cardsPlayed;

    const turnP = state.players.find((p) => p.id === state.turnId);
    const x2 = state.multiplier > 1 ? ' <span style="color:var(--gold)">×2</span>' : '';
    $('turn-banner').innerHTML = isMyTurn()
      ? `دورك يا ${esc(p1 ? p1.name : '')} ❤️${x2}<small>${state.current ? 'اقرا الكارت وجاوب' : 'إسحب كارت 👇'}</small>`
      : `دور ${esc(turnP ? turnP.name : '—')}${x2}<small>${state.current ? 'قاعد يجاوب…' : 'قاعد يسحب كارت…'}</small>`;

    renderCard();
    renderActions();
  }

  function hud(id, p) {
    const el = $(id);
    el.querySelector('.hud__name').textContent = p ? p.name : '—';
    el.querySelector('.hud__score').textContent = p ? p.score : 0;
    el.classList.toggle('is-turn', !!p && state.turnId === p.id);
    el.classList.toggle('is-off', !!p && !p.connected);
  }

  function renderCard() {
    const cur = state.current;
    const card3d = $('card3d');
    if (!cur) {
      card3d.classList.remove('is-flipped');
      shownCardKey = null;
      return;
    }
    const isNewCard = cur.id !== shownCardKey;
    const front = $('card-front');
    const accent = cur.kind === 'special' ? 'var(--cat-special)' : (CAT[cur.cat] || {}).color || 'var(--rose)';
    front.style.setProperty('--accent', accent);

    if (cur.kind === 'special') {
      $('card-cat').textContent = cur.title;
      $('card-text').textContent = cur.text;
      const ex = $('card-extra');
      ex.innerHTML = '';
      if (cur.effect === 'couple' && cur.extra) {
        ex.appendChild(mini(`${CAT[cur.extra.cat].emoji} ${CAT[cur.extra.cat].label}`, cur.extra.text));
      }
      if (cur.effect === 'chaos' && cur.extras) {
        state.players.forEach((p, i) => {
          if (cur.extras[i]) ex.appendChild(mini(`🎯 ${p.name}`, cur.extras[i].text));
        });
      }
      $('card-pts').textContent = cur.points ? `+${cur.points * state.multiplier} نقطة للزوز` : '';
    } else {
      const c = CAT[cur.cat] || { emoji: '🃏', label: '' };
      $('card-cat').textContent = `${c.emoji} ${c.label} · ${'★'.repeat(cur.level)}`;
      $('card-text').textContent = cur.text;
      $('card-extra').innerHTML = '';
      $('card-pts').textContent = `+${cur.points * state.multiplier} نقطة`;
    }

    if (cur.phase === 'resolved' && cur.resultText) {
      const r = document.createElement('div');
      r.className = 'result-flash';
      r.textContent = cur.resultText;
      $('card-extra').appendChild(r);
    }

    if (isNewCard) {
      shownCardKey = cur.id;
      card3d.classList.add('is-dealing');
      setTimeout(() => card3d.classList.add('is-flipped'), 40);
      setTimeout(() => card3d.classList.remove('is-dealing'), 600);
      if (navigator.vibrate) navigator.vibrate(12);
    }
  }

  function mini(title, text) {
    const d = document.createElement('div');
    d.className = 'mini';
    d.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    return d;
  }

  function renderActions() {
    const box = $('actions');
    box.innerHTML = '';
    const cur = state.current;
    const turnP = state.players.find((p) => p.id === state.turnId);

    if (!isMyTurn()) {
      const w = document.createElement('div');
      w.className = 'waiting pulse';
      w.innerHTML = cur
        ? `الكارت مفتوح عند <b>${esc(turnP ? turnP.name : '')}</b>. اقراه معاه واستنّى.`
        : `<b>${esc(turnP ? turnP.name : '')}</b> باش يسحب كارت…`;
      box.appendChild(w);
      return;
    }

    if (!cur) { box.appendChild(btn('إسحب كارت 🃏', 'btn--primary', () => emit('card:draw'))); return; }

    if (cur.phase === 'resolved') {
      box.appendChild(btn('كمّلت؟ مرّر الدور ❤️', 'btn--primary', () => emit('turn:pass')));
      return;
    }

    if (cur.kind === 'special') {
      if (cur.effect === 'double') box.appendChild(btn('كمّل واسحب كارت آخر ✨', 'btn--gold', () => emit('card:resolve', { result: 'done' })));
      else if (cur.effect === 'switch') box.appendChild(btn('عدّي الدور 🔄', 'btn--gold', () => emit('card:resolve', { result: 'done' })));
      else if (cur.effect === 'couple') box.appendChild(btn('جاوبنا الزوز ❤️', 'btn--ok', () => emit('card:resolve', { result: 'done' })));
      else if (cur.effect === 'chaos') box.appendChild(row(
        btn('عملناها الزوز 😂', 'btn--ok', () => emit('card:resolve', { result: 'done' })),
        btn('ما عملناهاش', 'btn--no', () => emit('card:resolve', { result: 'fail' }))
      ));
      return;
    }

    if (cur.vote) {
      const q = document.createElement('div');
      q.className = 'waiting';
      q.innerHTML = 'جاوب في راسك، خلّي شريكك يجاوب زادة… <b>جاوبتوا كيف كيف؟</b>';
      box.appendChild(q);
      box.appendChild(row(
        btn('إيه ✅', 'btn--ok', () => emit('card:resolve', { result: 'same' })),
        btn('لا ❌', 'btn--no', () => emit('card:resolve', { result: 'diff' }))
      ));
      box.appendChild(btn('بدّل الكارت 🔄', 'btn--ghost', () => emit('card:swap')));
      return;
    }

    if (cur.cat === 'mission') {
      box.appendChild(row(
        btn('عملتها 🎯', 'btn--ok', () => emit('card:resolve', { result: 'done' })),
        btn('ما نجّمتش', 'btn--no', () => emit('card:resolve', { result: 'fail' }))
      ));
      box.appendChild(btn('بدّل المهمّة 🔄', 'btn--ghost', () => emit('card:swap')));
      return;
    }

    box.appendChild(btn('جاوبت ❤️', 'btn--primary', () => emit('card:resolve', { result: 'done' })));
    box.appendChild(btn('بدّل الكارت 🔄', 'btn--ghost', () => emit('card:swap')));
  }

  function btn(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function row(...els) {
    const d = document.createElement('div');
    d.className = 'row';
    els.forEach((e) => d.appendChild(e));
    return d;
  }

  function renderEnd() {
    const [a, b] = state.players;
    const total = state.players.reduce((s, p) => s + p.score, 0);
    const max = Math.max(1, state.cardsPlayed * 3);
    const ratio = total / max;
    let emoji = '😂', title = 'يلزمكم شوية وقت باش تفهموا بعضكم 😂', sub = 'ما تخافوش، العلاقة تتبنى شوية بشوية.';
    if (ratio >= 0.7) { emoji = '🔥'; title = 'الكيمياء بيناتكم قوية!'; sub = 'تقراو في بعضكم كيما الكتاب المفتوح.'; }
    else if (ratio >= 0.45) { emoji = '💘'; title = 'تعرفوا بعضكم برشة!'; sub = 'مازال فمّة تفاصيل صغار تستاهل تتكشف.'; }

    $('result-box').innerHTML =
      `<span class="result__emoji">${emoji}</span>
       <h3 class="result__title">${title}</h3>
       <p class="result__sub">${sub}</p>
       <p class="result__sub">لعبتو ${state.cardsPlayed} كارت · ${total} نقطة مع بعضكم</p>`;

    const top = Math.max(a ? a.score : 0, b ? b.score : 0);
    $('final-scores').innerHTML = state.players.map((p) =>
      `<div class="score-card ${p.score === top ? 'is-top' : ''}"><b>${esc(p.name)}</b><span>${p.score}</span></div>`
    ).join('');
    confetti(90);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- socket ----------
  socket.on('state', (s) => {
    if (!me.playerId) return;
    applyState(s);
  });

  socket.on('fx', (f) => {
    if (f.type === 'confetti') confetti(f.by === me.playerId ? 70 : 40);
    if (f.type === 'nudge' && f.by !== me.playerId) {
      toast(`${f.name} ينبّهك 👋`);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
  });

  socket.on('connect', async () => {
    $('offline-bar').classList.remove('is-on');
    const s = loadSession();
    if (s && s.code && s.playerId) {
      const ack = await emit('room:rejoin', { code: s.code, playerId: s.playerId });
      if (ack.ok) { me = s; applyState(ack.state); }
      else { clearSession(); screen('screen-home'); }
    }
  });

  socket.on('disconnect', () => $('offline-bar').classList.add('is-on'));
  socket.io.on('reconnect_attempt', () => $('offline-bar').classList.add('is-on'));

  // ---------- confetti ----------
  const cv = $('fx-canvas'), ctx = cv.getContext('2d');
  let parts = [], raf = null;
  function size() { cv.width = innerWidth; cv.height = innerHeight; }
  size(); addEventListener('resize', size);

  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#FF5C8A', '#F2C46B', '#6FE3C4', '#9C8CFF', '#FBF2F6'];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.6,
        y: cv.height * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 7,
        vy: Math.random() * -9 - 3,
        g: 0.24 + Math.random() * 0.12,
        s: 4 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0],
        life: 90 + Math.random() * 50,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.life-- > 0 && p.y < cv.height + 40);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, cv.width, cv.height); }
  }
})();
