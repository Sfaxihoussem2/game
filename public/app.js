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
  let GAMES = {};
  let shownCardKey = null;
  let playKey = null;
  let pzImage = null, pzSize = 3, pzMode = 'coop', pzSel = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // الهوية تتسجّل في sessionStorage: كل onglet عندو هوية وحدو،
  // هكّا تنجم تجرّب في زوز onglets في نفس الnavigateur بلا ما يتخلطو اللاعبين.
  // الإسم برك يتسجّل في localStorage باش يتعمّر وحدو المرة الجاية.
  const saveSession = () => {
    try { sessionStorage.setItem(SS, JSON.stringify(me)); } catch { }
    try { localStorage.setItem(SS + '.name', me.name || ''); } catch { }
  };
  const loadSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SS) || 'null'); } catch { return null; }
  };
  const loadName = () => { try { return localStorage.getItem(SS + '.name') || ''; } catch { return ''; } };
  const clearSession = () => { try { sessionStorage.removeItem(SS); } catch { } };

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
      socket.timeout(9000).emit(evt, payload, (err, ack) => {
        if (err) { toast('السيرفر ما جاوبش… عاود جرّب.', true); return res({ ok: false }); }
        if (ack && ack.error) toast(ack.error, true);
        res(ack || { ok: false });
      });
    });
  }
  const gact = (action, payload) => emit('game:action', { action, payload });

  const meP = () => (state ? state.players.find((p) => p.id === me.playerId) : null);
  const partnerP = () => (state ? state.players.find((p) => p.id !== me.playerId) : null);
  const pName = (id) => { const p = state.players.find((x) => x.id === id); return p ? p.name : '—'; };
  const isMyTurn = () => state && state.turnId === me.playerId;

  // ================= الشاشة 1 : البداية =================
  fetch('/api/stats').then((r) => r.json()).then((s) => {
    $('deck-stat').textContent = `🃏 ${s.total} كارت · 🎮 10 ألعاب`;
  }).catch(() => { $('deck-stat').textContent = ''; });
  fetch('/api/games').then((r) => r.json()).then((g) => { GAMES = g; }).catch(() => {});

  const nameInput = $('name-input');
  const codeInput = $('code-input');
  nameInput.value = loadName();
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('btn-create').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return toast('اكتب إسمك قبل 🙂', true);
    const ack = await emit('room:create', { name });
    if (!ack.ok) return;
    me = { code: ack.code, playerId: ack.playerId, name };
    saveSession(); applyState(ack.state);
  });

  $('btn-join').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    if (!name) return toast('اكتب إسمك قبل 🙂', true);
    if (code.length < 5) return toast('الكود متكوّن من 5 حروف/أرقام.', true);
    const ack = await emit('room:join', { code, name });
    if (!ack.ok) return;
    me = { code: ack.code, playerId: ack.playerId, name };
    saveSession(); applyState(ack.state);
  });

  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) codeInput.value = urlCode.toUpperCase().slice(0, 5);

  // ================= اللوبي =================
  $('btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(me.code); toast('الكود تنسخ ✅'); }
    catch { toast('انسخو باليد: ' + me.code); }
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/?code=${me.code}`;
    const text = `يلّا نلعبو "نعرفك قدّاش؟ ❤️"\nالكود: ${me.code}\n${url}`;
    if (navigator.share) { try { await navigator.share({ title: 'نعرفك قدّاش؟', text }); return; } catch { } }
    try { await navigator.clipboard.writeText(text); toast('الدعوة تنسخت 💌'); } catch { toast('الكود: ' + me.code); }
  });

  function buildCats() {
    const box = $('cats-list');
    box.innerHTML = '';
    CAT_ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'cat-chip'; b.dataset.cat = id;
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

  $('btn-start').addEventListener('click', () => emit('hub:open'));
  $('btn-leave-lobby').addEventListener('click', () => { clearSession(); location.href = '/'; });
  $('btn-end').addEventListener('click', () => {
    if (confirm('تحب تسالي اللعبة هذي وتشوف النتيجة؟')) emit('game:end');
  });
  $('btn-nudge').addEventListener('click', () => { socket.emit('nudge'); toast('نبّهناه 👋'); });

  // ================= التوجيه =================
  function applyState(s) {
    state = s;
    if (s.status === 'lobby') { screen('screen-lobby'); renderLobby(); }
    else if (s.status === 'hub') { screen('screen-hub'); renderHub(); }
    else if (s.status === 'playing') {
      if (s.game && s.game.engine === 'cards') { screen('screen-game'); renderCards(); }
      else { screen('screen-play'); renderPlay(); }
    }
    else if (s.status === 'result') { screen('screen-result'); renderResult(); }
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
    document.querySelectorAll('.cat-chip').forEach((c) =>
      c.classList.toggle('is-on', state.settings.cats.includes(c.dataset.cat)));
    document.querySelectorAll('#length-list button').forEach((b) =>
      b.classList.toggle('is-on', Number(b.dataset.len) === state.settings.targetCards));

    const isHost = state.hostId === me.playerId;
    const ready = state.players.length === 2;
    $('btn-start').disabled = !(isHost && ready);
    $('btn-start').textContent = ready ? 'يلّا نمشيو للألعاب 🎮' : 'نستنّاو الشريك…';
    $('lobby-hint').textContent = !ready ? `عدّي الكود ${state.code} لشريكك باش يدخل.`
      : isHost ? 'الزوز موجودين. افتح الألعاب!' : 'نستنّاو صاحب الـpartie يفتح الألعاب…';
    $('settings-panel').style.opacity = isHost ? 1 : 0.65;
  }

  // ================= GAME HUB =================
  function headerHTML() {
    const [a, b] = state.players;
    const st = state.players.map((p) =>
      `<span>${p.connected ? '🟢' : '⚪'} ${esc(p.name)}</span>`).join('');
    const sc = state.players.map((p) => `<span class="pill">${esc(p.name)}<b>${p.score}</b></span>`).join('');
    return `<div class="hubhead">
      <div>
        <div class="hubhead__pair">❤️ ${esc(a ? a.name : '')} × ${esc(b ? b.name : '')}</div>
        <div class="hubhead__st">${st}</div>
      </div>
      <div class="hubhead__sc">${sc}</div>
    </div>`;
  }

  function renderHub() {
    const cards = Object.values(GAMES).map((g) => `
      <div class="gcard ${g.id === 'cards' ? 'gcard--main' : ''}">
        <span class="gcard__emoji">${g.emoji}</span>
        <h3 class="gcard__name">${esc(g.name)}</h3>
        <p class="gcard__desc">${esc(g.desc)}</p>
        <div class="gcard__meta"><span>⏱️ ${esc(g.dur)}</span><span>👥 2</span></div>
        <button class="btn btn--primary" data-act="propose" data-arg="${g.id}">إلعبوا ❤️</button>
      </div>`).join('');

    $('hub-root').innerHTML = `
      ${headerHTML()}
      <h2 class="h2">🎮 ألعابنا</h2>
      <p class="hint">اختار لعبة، وشريكك لازم يوافق قبل ما نبداو.</p>
      <div class="gamegrid">${cards}</div>
      <button class="btn btn--link" data-act="endsession">🏆 نشوفو النتيجة و نسالّيو</button>
      ${proposalHTML()}`;
  }

  function proposalHTML() {
    const pr = state.proposal;
    if (!pr) return '';
    const g = GAMES[pr.gameId] || { emoji: '🎮', name: pr.gameId };
    const mine = pr.byId === me.playerId;
    if (!pr.accepted) {
      return `<div class="overlay"><div class="sheet">
        <span style="font-size:44px">${g.emoji}</span>
        <h3>${esc(g.name)}</h3>
        ${mine
          ? `<p>نستنّاو ${esc(pName(partnerP() ? partnerP().id : ''))} يوافق…</p>
             <button class="btn btn--ghost" data-act="cancelprop">ألغي</button>`
          : `<p>${esc(pr.byName)} يحب يلعب ${esc(g.name)} 🎮<br>موافق؟</p>
             <button class="btn btn--ok" data-act="accept">إيه ❤️</button>
             <button class="btn btn--no" data-act="refuse">لا</button>`}
      </div></div>`;
    }
    const lines = state.players.map((p) => {
      const r = !!pr.ready[p.id];
      return `<div class="readyline ${r ? 'is-ready' : ''}"><span>${esc(p.name)}</span>
        <small>${r ? 'جاهز ❤️' : 'نستنّى فيه… ⏳'}</small></div>`;
    }).join('');
    const iAmReady = !!pr.ready[me.playerId];
    return `<div class="overlay"><div class="sheet">
      <span style="font-size:44px">${g.emoji}</span>
      <h3>${esc(g.name)}</h3>
      ${lines}
      ${iAmReady ? `<p>🚀 نستنّاو شريكك…</p>` : `<button class="btn btn--primary" data-act="ready">أنا جاهز ❤️</button>`}
      <button class="btn btn--link" data-act="cancelprop">ألغي</button>
    </div></div>`;
  }

  // ================= لعبة الكروت =================
  function renderCards() {
    const p1 = meP(), p2 = partnerP();
    hud('hud-p1', p1); hud('hud-p2', p2);
    $('hud-progress').textContent = state.cardsPlayed;
    const turnP = state.players.find((p) => p.id === state.turnId);
    const x2 = state.multiplier > 1 ? ' <span style="color:var(--gold)">×2</span>' : '';
    $('turn-banner').innerHTML = isMyTurn()
      ? `دورك يا ${esc(p1 ? p1.name : '')} ❤️${x2}<small>${state.current ? 'اقرا الكارت وجاوب' : 'إسحب كارت 👇'}</small>`
      : `دور ${esc(turnP ? turnP.name : '—')}${x2}<small>${state.current ? 'قاعد يجاوب…' : 'قاعد يسحب كارت…'}</small>`;
    renderCard(); renderCardActions();
  }

  function hud(id, p) {
    const el = $(id);
    el.querySelector('.hud__name').textContent = p ? p.name : '—';
    el.querySelector('.hud__score').textContent = p ? p.score : 0;
    el.classList.toggle('is-turn', !!p && state.turnId === p.id);
    el.classList.toggle('is-off', !!p && !p.connected);
  }

  function renderCard() {
    const cur = state.current, card3d = $('card3d');
    if (!cur) { card3d.classList.remove('is-flipped'); shownCardKey = null; return; }
    const isNew = cur.id !== shownCardKey;
    const front = $('card-front');
    const accent = cur.kind === 'special' ? 'var(--cat-special)' : (CAT[cur.cat] || {}).color || 'var(--rose)';
    front.style.setProperty('--accent', accent);

    if (cur.kind === 'special') {
      $('card-cat').textContent = cur.title;
      $('card-text').textContent = cur.text;
      const ex = $('card-extra'); ex.innerHTML = '';
      if (cur.effect === 'couple' && cur.extra) ex.appendChild(mini(`${CAT[cur.extra.cat].emoji} ${CAT[cur.extra.cat].label}`, cur.extra.text));
      if (cur.effect === 'chaos' && cur.extras) state.players.forEach((p, i) => {
        if (cur.extras[i]) ex.appendChild(mini(`🎯 ${p.name}`, cur.extras[i].text));
      });
      $('card-pts').textContent = cur.points ? `+${cur.points * state.multiplier} نقطة للزوز` : '';
    } else {
      const c = CAT[cur.cat] || { emoji: '🃏', label: '' };
      $('card-cat').textContent = `${c.emoji} ${c.label} · ${'★'.repeat(cur.level || 1)}`;
      $('card-text').textContent = cur.text;
      $('card-extra').innerHTML = '';
      $('card-pts').textContent = `+${cur.points * state.multiplier} نقطة`;
    }
    if (cur.phase === 'resolved' && cur.resultText) {
      const r = document.createElement('div');
      r.className = 'result-flash'; r.textContent = cur.resultText;
      $('card-extra').appendChild(r);
    }
    if (isNew) {
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

  function renderCardActions() {
    const box = $('actions'); box.innerHTML = '';
    const cur = state.current;
    const turnP = state.players.find((p) => p.id === state.turnId);
    if (!isMyTurn()) {
      const w = document.createElement('div');
      w.className = 'waiting pulse';
      w.innerHTML = cur ? `الكارت مفتوح عند <b>${esc(turnP ? turnP.name : '')}</b>. اقراه معاه.`
        : `<b>${esc(turnP ? turnP.name : '')}</b> باش يسحب كارت…`;
      box.appendChild(w); return;
    }
    if (!cur) { box.appendChild(btn('إسحب كارت 🃏', 'btn--primary', () => emit('card:draw'))); return; }
    if (cur.phase === 'resolved') { box.appendChild(btn('كمّلت؟ مرّر الدور ❤️', 'btn--primary', () => emit('turn:pass'))); return; }
    if (cur.kind === 'special') {
      if (cur.effect === 'double') box.appendChild(btn('كمّل واسحب كارت آخر ✨', 'btn--gold', () => emit('card:resolve', { result: 'done' })));
      else if (cur.effect === 'switch') box.appendChild(btn('عدّي الدور 🔄', 'btn--gold', () => emit('card:resolve', { result: 'done' })));
      else if (cur.effect === 'couple') box.appendChild(btn('جاوبنا الزوز ❤️', 'btn--ok', () => emit('card:resolve', { result: 'done' })));
      else box.appendChild(row(
        btn('عملناها الزوز 😂', 'btn--ok', () => emit('card:resolve', { result: 'done' })),
        btn('ما عملناهاش', 'btn--no', () => emit('card:resolve', { result: 'fail' }))));
      return;
    }
    if (cur.vote) {
      const q = document.createElement('div');
      q.className = 'waiting';
      q.innerHTML = 'جاوبو الزوز… <b>جاوبتوا كيف كيف؟</b>';
      box.appendChild(q);
      box.appendChild(row(
        btn('إيه ✅', 'btn--ok', () => emit('card:resolve', { result: 'same' })),
        btn('لا ❌', 'btn--no', () => emit('card:resolve', { result: 'diff' }))));
      box.appendChild(btn('بدّل الكارت 🔄', 'btn--ghost', () => emit('card:swap')));
      return;
    }
    if (cur.cat === 'mission') {
      box.appendChild(row(
        btn('عملتها 🎯', 'btn--ok', () => emit('card:resolve', { result: 'done' })),
        btn('ما نجّمتش', 'btn--no', () => emit('card:resolve', { result: 'fail' }))));
      box.appendChild(btn('بدّل المهمّة 🔄', 'btn--ghost', () => emit('card:swap')));
      return;
    }
    box.appendChild(btn('جاوبت ❤️', 'btn--primary', () => emit('card:resolve', { result: 'done' })));
    box.appendChild(btn('بدّل الكارت 🔄', 'btn--ghost', () => emit('card:swap')));
  }

  function btn(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function row(...els) {
    const d = document.createElement('div'); d.className = 'row';
    els.forEach((e) => d.appendChild(e)); return d;
  }

  // ================= باقي الألعاب =================
  function renderPlay() {
    const g = state.game;
    if (!g) return;
    const meta = GAMES[g.id] || { emoji: '🎮', name: g.id };
    const bar = `<div class="gamebar">
        <span class="gamebar__t">${meta.emoji} ${esc(meta.name)}</span>
        <span class="gamebar__r">${g.rounds ? `${Math.min(g.round, g.rounds)}/${g.rounds}` : ''}</span>
        <span class="hubhead__sc">${state.players.map((p) => `<span class="pill">${esc(p.name)}<b>${p.score}</b></span>`).join('')}</span>
      </div>`;

    let body = '';
    if (g.engine === 'duel') body = duelHTML(g);
    else if (g.engine === 'tor') body = torHTML(g);
    else if (g.engine === 'speed') body = speedHTML(g);
    else if (g.engine === 'puzzle') body = puzzleHTML(g);
    else if (g.engine === 'draw') { renderDraw(g, bar); return; }

    const keep = grabInputs();
    $('play-root').innerHTML = bar + body +
      `<button class="btn btn--link" data-act="quitgame">سالّي اللعبة هذي</button>`;
    restoreInputs(keep);
    playKey = null;
  }

  function grabInputs() {
    const o = {};
    document.querySelectorAll('#play-root [data-keep]').forEach((el) => { o[el.dataset.keep] = el.value; });
    return o;
  }
  function restoreInputs(o) {
    document.querySelectorAll('#play-root [data-keep]').forEach((el) => {
      if (o[el.dataset.keep] != null) el.value = o[el.dataset.keep];
    });
  }

  // ---- DUEL ----
  function duelHTML(g) {
    const c = g.current;
    if (!c) return '<div class="waiting">…</div>';
    const subj = c.subjectId ? `<span class="qbox__eyebrow">السؤال على ${esc(pName(c.subjectId))}</span>` : '';
    const q = `<div class="qbox">${subj}<p class="qbox__q">${esc(c.prompt)}</p></div>`;

    if (!c.revealed) {
      const iAnswered = c.answered.includes(me.playerId);
      if (iAnswered) {
        const w = c.answers[me.playerId];
        return q + `<div class="waiting pulse">جاوبت ✅ <b>${esc(w)}</b><br>نستنّاو ${esc(partnerP() ? partnerP().name : '')}…</div>`;
      }
      if (c.mode === 'choice') {
        return q + `<div class="choice">${c.options.map((o, i) =>
          `<button class="btn btn--ghost" data-act="duel-choice" data-arg="${i}">${esc(o)}</button>`).join('')}</div>
          <p class="hint">الجوابات مخبّية لين تجاوبو الزوز 🔒</p>`;
      }
      const hint = c.subjectId === me.playerId ? 'جاوب على روحك بصراحة' : `خمّن جواب ${esc(pName(c.subjectId))}`;
      return q + `<div class="inline">
          <input class="field-inline" id="d-input" data-keep="d" placeholder="${hint}" maxlength="120" />
        </div>
        <button class="btn btn--primary" data-act="duel-submit">جاوبت 🔒</button>
        <p class="hint">جوابك ما يشوفوش شريكك قبل ما يجاوب.</p>`;
    }

    const ans = state.players.map((p) => `<div class="ans ${c.verdict === 'same' ? 'is-match' : ''}">
        <b>${esc(p.name)}</b>${esc(c.answers[p.id] || '—')}</div>`).join('');
    let tail = '';
    if (!c.verdict && c.mode === 'text') {
      tail = `<p class="hint">جاوبتوا كيف كيف؟</p>
        <div class="row"><button class="btn btn--ok" data-act="judge" data-arg="same">إيه ✅ +${c.points}</button>
        <button class="btn btn--no" data-act="judge" data-arg="diff">لا ❌</button></div>`;
    } else {
      const ok = c.verdict === 'same';
      tail = `<div class="verdict ${ok ? 'ok' : 'no'}">${ok ? `❤️ عرفتوها! +${c.points} للزوز` : '😅 ما توافقتوش'}</div>
        <button class="btn btn--primary" data-act="next">${g.round >= g.rounds ? 'شوف النتيجة 🏆' : 'الround الجاي ➡️'}</button>`;
    }
    return q + `<div class="answers">${ans}</div>` + tail;
  }

  // ---- TRUTH OR CHALLENGE ----
  function torHTML(g) {
    const mine = g.turnId === me.playerId;
    const c = g.current;
    if (!c) {
      if (!mine) return `<div class="waiting pulse">${esc(pName(g.turnId))} قاعد يختار… ⏳</div>`;
      return `<div class="qbox"><p class="qbox__q">دورك: تختار شنوّة؟</p></div>
        <div class="row">
          <button class="btn btn--ok" data-act="tor-pick" data-arg="truth">❤️ Truth (+1)</button>
          <button class="btn btn--gold" data-act="tor-pick" data-arg="challenge">🎯 Challenge (+3)</button>
        </div>`;
    }
    const head = c.kind === 'truth' ? '❤️ Truth' : '🎯 Challenge';
    const q = `<div class="qbox"><span class="qbox__eyebrow">${head} · ${esc(pName(g.turnId))}</span>
      <p class="qbox__q">${esc(c.text)}</p></div>`;
    if (c.phase === 'done') {
      return q + `<div class="verdict ok">+${c.gained} نقاط لـ${esc(pName(g.turnId))}</div>
        <button class="btn btn--primary" data-act="tor-next">${g.round >= g.rounds ? 'شوف النتيجة 🏆' : 'مرّر الدور ➡️'}</button>`;
    }
    if (!mine) return q + `<div class="waiting pulse">${esc(pName(g.turnId))} قاعد يجاوب…</div>`;
    return q + `<div class="row">
        <button class="btn btn--ok" data-act="tor-resolve" data-arg="done">${c.kind === 'truth' ? 'جاوبت ❤️' : 'عملتها 🎯'}</button>
        <button class="btn btn--no" data-act="tor-resolve" data-arg="fail">ما نجّمتش</button></div>`;
  }

  // ---- SPEED ----
  function speedHTML(g) {
    const c = g.current;
    if (!c) return '<div class="waiting">…</div>';
    if (c.revealed) {
      const lists = state.players.map((p) => `<div class="ans"><b>${esc(p.name)} · +${c.pts[p.id] || 0}</b>
        ${(c.answers[p.id] || []).map((x) => esc(x)).join('<br>') || '—'}</div>`).join('');
      return `<div class="qbox"><p class="qbox__q">${esc(c.text)}</p></div>
        <div class="answers">${lists}</div>
        <button class="btn btn--primary" data-act="speed-next">${g.round >= g.rounds ? 'شوف النتيجة 🏆' : 'الround الجاي ➡️'}</button>`;
    }
    const done = c.answered.includes(me.playerId);
    return `<div class="qbox"><span class="qbox__eyebrow">⏱️ عندك ${c.secs} ثواني!</span>
        <p class="qbox__q">${esc(c.text)}</p></div>
      <div class="timer" data-timer="${c.endsAt}">--</div>
      <div class="tbar"><i data-tbar="${c.endsAt}" data-total="${c.secs}" style="width:100%"></i></div>
      ${done ? `<div class="waiting pulse">بعثت ✅ نستنّاو ${esc(partnerP() ? partnerP().name : '')}…</div>`
      : `<textarea class="ta" id="sp-input" data-keep="sp" rows="3" placeholder="اكتب 3 حاجات، كل وحدة في سطر"></textarea>
         <button class="btn btn--primary" data-act="speed-submit">بعثت! ⚡</button>`}`;
  }

  // ---- PUZZLE ----
  function puzzleHTML(g) {
    if (g.phase === 'setup') {
      return `<div class="qbox"><p class="qbox__q">🧩 حطّو تصويرة متاعكم</p>
          <span class="qbox__eyebrow">التصويرة تتبعث لشريكك برك، ما تتخزّنش في حتى بلاصة أخرى</span></div>
        <input type="file" accept="image/*" id="pz-file" class="field-inline" />
        <div id="pz-prev"></div>
        <div class="sizes">
          ${[[3, '🟢 9 قطع'], [4, '🟡 16 قطعة'], [5, '🔴 25 قطعة'], [6, '🔥 36 قطعة']].map(([n, l]) =>
        `<button data-act="pz-size" data-arg="${n}" class="${pzSize === n ? 'is-on' : ''}">${l}</button>`).join('')}
        </div>
        <div class="sizes">
          <button data-act="pz-mode" data-arg="coop" class="${pzMode === 'coop' ? 'is-on' : ''}">❤️ Coop</button>
          <button data-act="pz-mode" data-arg="versus" class="${pzMode === 'versus' ? 'is-on' : ''}">🆚 Compétition</button>
        </div>
        <button class="btn btn--primary" data-act="pz-start">يلّا نركّبو 🧩</button>`;
    }
    const n = g.size;
    const tiles = g.slots.map((piece, slot) => {
      const r = Math.floor(piece / n), c = piece % n;
      const posX = n === 1 ? 0 : (c / (n - 1)) * 100;
      const posY = n === 1 ? 0 : (r / (n - 1)) * 100;
      return `<div class="pz__t ${pzSel === slot ? 'is-sel' : ''} ${piece === slot ? 'is-ok' : ''}"
        data-act="pz-tile" data-arg="${slot}"
        style="background-image:url('${g.image}');background-size:${n * 100}% ${n * 100}%;background-position:${posX}% ${posY}%"></div>`;
    }).join('');
    const moves = state.players.map((p) => `<span class="pill">${esc(p.name)}<b>${g.moves[p.id] || 0} 🧩</b></span>`).join('');
    return `<p class="hint">اضغط على قطعة، بعد على القطعة الأخرى باش تبدّلوهم. الحركة تتشاف عند شريكك في الحين.</p>
      <div class="pz" style="grid-template-columns:repeat(${n},1fr)">${tiles}</div>
      <div class="hubhead__st" style="justify-content:center;margin-top:10px">${moves}</div>`;
  }

  // ---- DRAW & GUESS ----
  function renderDraw(g, bar) {
    const c = g.current;
    if (!c) return;
    const key = `draw|${g.round}|${c.found}`;
    const iDraw = c.drawerId === me.playerId;
    if (key !== playKey) {
      playKey = key;
      const tools = iDraw ? `<div class="tools">
          ${['#1B0F2E', '#FF5C8A', '#F2C46B', '#6FE3C4', '#7BA9FF', '#FFFFFF'].map((col, i) =>
        `<span class="swatch ${i === 0 ? 'is-on' : ''}" data-col="${col}" style="background:${col}"></span>`).join('')}
          <button class="btn btn--mini" id="dw-size">✏️ 4</button>
          <button class="btn btn--mini" data-act="draw-clear">🗑️ نظّف</button>
        </div>` : '';
      const guessBox = iDraw ? `<p class="hint">${esc(pName(state.players.find((p) => p.id !== c.drawerId).id))} قاعد يخمّن 🤔</p>`
        : `<div class="inline"><input id="dg-input" data-keep="dg" class="field-inline" placeholder="خمّن الكلمة…" maxlength="40" />
           <button class="btn btn--primary" style="width:auto" data-act="draw-guess">خمّن</button></div>`;
      $('play-root').innerHTML = bar +
        `<div class="word" id="dw-word">${iDraw ? esc(c.word) : '🤔 ؟؟؟'}</div>
         <div class="timer" data-timer="${c.endsAt}">--</div>
         <div class="canvaswrap"><canvas id="draw-canvas" width="800" height="600"></canvas></div>
         ${tools}${guessBox}
         <div class="guesses" id="dg-list"></div>
         <div id="dg-tail"></div>
         <button class="btn btn--link" data-act="quitgame">سالّي اللعبة هذي</button>`;
      initCanvas(iDraw && !c.found);
    }
    // تحديث الأجزاء المتحركة برك
    const list = $('dg-list');
    if (list) list.innerHTML = c.guesses.map((x) =>
      `<div class="guess ${x.good ? 'is-good' : ''}">${esc(pName(x.playerId))}: ${esc(x.text)}${x.good ? ' ✅' : ''}</div>`).join('');
    const tail = $('dg-tail');
    if (tail) {
      if (c.found) {
        $('dw-word').textContent = c.word;
        tail.innerHTML = c.timeout
          ? `<div class="verdict no">⏱️ سالا الوقت! الكلمة كانت: ${esc(c.word)}</div>
             <button class="btn btn--primary" data-act="draw-next">${g.round >= g.rounds ? 'شوف النتيجة 🏆' : 'الround الجاي ➡️'}</button>`
          : `<div class="verdict ok">🎉 عرفها في ${c.secs}s · +${c.points} للزوز</div>
             <button class="btn btn--primary" data-act="draw-next">${g.round >= g.rounds ? 'شوف النتيجة 🏆' : 'الround الجاي ➡️'}</button>`;
      } else tail.innerHTML = '';
    }
  }

  // ---- Canvas ----
  let dctx = null, drawing = false, last = null, dcolor = '#1B0F2E', dwidth = 4;
  function initCanvas(enabled) {
    const cv = $('draw-canvas');
    if (!cv) return;
    dctx = cv.getContext('2d');
    dctx.fillStyle = '#F7F2F6'; dctx.fillRect(0, 0, cv.width, cv.height);
    dctx.lineCap = 'round'; dctx.lineJoin = 'round';
    if (!enabled) return;

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
    };
    const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      const s = { x0: last.x, y0: last.y, x1: p.x, y1: p.y, c: dcolor, w: dwidth };
      drawSeg(s); socket.emit('draw:stroke', s); last = p;
    };
    const end = () => { drawing = false; };
    cv.addEventListener('pointerdown', start);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    cv.addEventListener('touchstart', start, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', end);

    document.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach((x) => x.classList.remove('is-on'));
      s.classList.add('is-on'); dcolor = s.dataset.col;
    }));
    const sz = $('dw-size');
    if (sz) sz.addEventListener('click', () => {
      dwidth = dwidth === 4 ? 10 : dwidth === 10 ? 20 : 4;
      sz.textContent = `✏️ ${dwidth}`;
    });
  }

  function drawSeg(s) {
    const cv = $('draw-canvas');
    if (!cv || !dctx) return;
    dctx.strokeStyle = s.c; dctx.lineWidth = s.w * (cv.width / 400);
    dctx.beginPath();
    dctx.moveTo(s.x0 * cv.width, s.y0 * cv.height);
    dctx.lineTo(s.x1 * cv.width, s.y1 * cv.height);
    dctx.stroke();
  }

  socket.on('draw:stroke', (s) => drawSeg(s));
  socket.on('draw:sync', ({ strokes }) => (strokes || []).forEach(drawSeg));
  socket.on('draw:clear', () => {
    const cv = $('draw-canvas');
    if (cv && dctx) { dctx.fillStyle = '#F7F2F6'; dctx.fillRect(0, 0, cv.width, cv.height); }
  });

  // ================= نتيجة لعبة =================
  function renderResult() {
    const g = state.game;
    const meta = g ? (GAMES[g.id] || { emoji: '🎮', name: g.id }) : { emoji: '🎮', name: '' };
    const gs = g ? g.scores : {};
    const rows = state.players.map((p) => `<div class="score-card">
        <b>${esc(p.name)}</b><span>+${gs[p.id] || 0}</span><small>في اللعبة هذي</small></div>`).join('');
    $('result-root').innerHTML = `
      ${headerHTML()}
      <div class="result"><span class="result__emoji">${meta.emoji}</span>
        <h3 class="result__title">اللعبة كملت!</h3>
        <p class="result__sub">${esc(meta.name)}</p></div>
      <div class="scores">${rows}</div>
      ${badgesHTML()}
      <button class="btn btn--primary" data-act="again">🔄 نعاودو</button>
      <button class="btn btn--ghost" data-act="hub">🎮 لعبة أخرى</button>
      <button class="btn btn--link" data-act="endsession">🏆 نسالّيو ونشوفو الstats</button>`;
    confetti(60);
  }

  function badgesHTML() {
    if (!state.achievements || !state.achievements.length) return '';
    const A = {
      perfect_match: '💘 Perfect Match', mind_reader: '🧠 Mind Reader', clowns: '😂 Duo de Clowns',
      puzzle_masters: '🧩 Puzzle Masters', artist: '🎨 Artist', speed_couple: '⚡ Speed Couple',
      love_birds: '❤️ Love Birds', chemistry: '🔥 Chemistry', champion: '🏆 Couple Champion',
    };
    return `<div class="badges">${state.achievements.map((id) => `<span class="badge">${A[id] || id}</span>`).join('')}</div>`;
  }

  // ================= نهاية الSession =================
  function renderEnd() {
    const s = state.stats || {};
    const total = state.players.reduce((a, p) => a + p.score, 0);
    const denom = Math.max(1, (s.gamesPlayed || 1) * 12);
    const ratio = Math.min(1, total / denom);
    let emoji = '😂', title = 'مازال يلزمكم شوية training 😂', sub = 'ما تخافوش، الفهم يجي بالوقت.';
    if (ratio >= 0.7) { emoji = '🔥'; title = 'الكيمياء بيناتكم قوية!'; sub = 'تقراو في بعضكم كيما الكتاب المفتوح.'; }
    else if (ratio >= 0.4) { emoji = '💘'; title = 'إنتوما تعرفوا بعضكم برشة!'; sub = 'مازال فمّة تفاصيل صغار تستاهل تتكشف.'; }

    const best = Object.entries(s.byGame || {}).sort((a, b) => b[1] - a[1])[0];
    const bestName = best && GAMES[best[0]] ? `${GAMES[best[0]].emoji} ${GAMES[best[0]].name}` : '—';
    const top = Math.max(...state.players.map((p) => p.score), 0);

    $('end-root').innerHTML = `
      <h2 class="h2">❤️ ${esc(state.players.map((p) => p.name).join(' × '))}</h2>
      <div class="result"><span class="result__emoji">${emoji}</span>
        <h3 class="result__title">${title}</h3>
        <p class="result__sub">${sub}</p>
        <p class="result__sub">النسبة هذي للضحك برك، موش تحليل نفسي 😄</p></div>
      <div class="scores">${state.players.map((p) => `<div class="score-card ${p.score === top ? 'is-top' : ''}">
        <b>${esc(p.name)}</b><span>${p.score}</span></div>`).join('')}</div>
      <div class="statgrid">
        <div class="stat"><span>${s.gamesPlayed || 0}</span><small>ألعاب</small></div>
        <div class="stat"><span>${total}</span><small>نقاط مع بعضكم</small></div>
        <div class="stat"><span>${s.same || 0}</span><small>جوابات متطابقة</small></div>
        <div class="stat"><span>${s.guesses || 0}</span><small>تخمينات صحيحة</small></div>
        <div class="stat"><span>${s.challenges || 0}</span><small>مهمّات مكمّلة</small></div>
        <div class="stat"><span>${s.puzzles || 0}</span><small>puzzles كملو</small></div>
        <div class="stat"><span>${s.draws || 0}</span><small>رسمات تعرفو عليها</small></div>
        <div class="stat"><span style="font-size:15px">${bestName}</span><small>أكثر لعبة</small></div>
      </div>
      ${badgesHTML()}
      <button class="btn btn--primary" data-act="newsession">🎮 نبداو session جديدة</button>
      <button class="btn btn--link" data-act="home">نرجعو للبداية</button>`;
    confetti(110);
  }

  // ================= الأحداث (delegation) =================
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act, arg = t.dataset.arg;
    switch (a) {
      case 'propose': return void emit('hub:propose', { gameId: arg });
      case 'accept': return void emit('hub:answer', { accept: true });
      case 'refuse': return void emit('hub:answer', { accept: false });
      case 'cancelprop': return void emit('hub:answer', { accept: false }).then(() => emit('hub:open'));
      case 'ready': return void emit('hub:ready', { ready: true });
      case 'again': return void emit('game:again');
      case 'hub': return void emit('hub:open');
      case 'quitgame': return void (confirm('تحب تسالّي اللعبة هذي؟') && emit('game:end'));
      case 'endsession': return void emit('session:end');
      case 'newsession': return void emit('session:new');
      case 'home': clearSession(); return void (location.href = '/');
      case 'duel-choice': return void gact('submit', { value: state.game.current.options[Number(arg)] });
      case 'duel-submit': {
        const v = ($('d-input') || {}).value || '';
        if (!v.trim()) return toast('اكتب جواب قبل 🙂', true);
        return void gact('submit', { value: v });
      }
      case 'judge': return void gact('judge', { verdict: arg });
      case 'next': return void gact('next');
      case 'tor-pick': return void gact('pick', { kind: arg });
      case 'tor-resolve': return void gact('resolve', { result: arg });
      case 'tor-next': return void gact('next');
      case 'speed-submit': return void gact('submit', { value: ($('sp-input') || {}).value || '' });
      case 'speed-next': return void gact('next');
      case 'pz-size': pzSize = Number(arg); return renderPlay();
      case 'pz-mode': pzMode = arg; return renderPlay();
      case 'pz-start': {
        if (!pzImage) return toast('اختار تصويرة قبل 📸', true);
        return void gact('setup', { image: pzImage, size: pzSize, mode: pzMode });
      }
      case 'pz-tile': {
        const i = Number(arg);
        if (pzSel == null) { pzSel = i; return renderPlay(); }
        if (pzSel === i) { pzSel = null; return renderPlay(); }
        const from = pzSel; pzSel = null;
        return void gact('swap', { a: from, b: i });
      }
      case 'draw-clear': return void socket.emit('draw:clear');
      case 'draw-guess': {
        const inp = $('dg-input');
        const v = inp ? inp.value : '';
        if (!v.trim()) return;
        if (inp) inp.value = '';
        return void gact('guess', { text: v });
      }
      case 'draw-next': return void gact('next');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'dg-input') document.querySelector('[data-act="draw-guess"]')?.click();
    if (e.target.id === 'd-input') document.querySelector('[data-act="duel-submit"]')?.click();
  });

  // اختيار تصويرة الpuzzle (بالضغط)
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'pz-file') return;
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    img.onload = () => {
      const max = 900;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const side = Math.min(w, h);
      const cv = document.createElement('canvas');
      cv.width = side; cv.height = side;
      const cx = cv.getContext('2d');
      cx.drawImage(img, (w - side) / -2 / scale * scale, (h - side) / -2, w, h);
      pzImage = cv.toDataURL('image/jpeg', 0.75);
      const prev = $('pz-prev');
      if (prev) prev.innerHTML = `<img src="${pzImage}" style="width:120px;border-radius:12px;margin:8px auto;display:block" />`;
      toast('التصويرة جاهزة 📸');
    };
    fr.readAsDataURL(f);
  });

  // ================= socket =================
  socket.on('state', (s) => { if (me.playerId) applyState(s); });

  socket.on('fx', (f) => {
    if (f.type === 'confetti') confetti(f.big ? 140 : (f.by === me.playerId ? 70 : 40));
    if (f.type === 'nudge' && f.by !== me.playerId) {
      toast(`${f.name} ينبّهك 👋`);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
    if (f.type === 'invite') {
      toast(`🎮 ${f.name} يحب يلعب معاك — شوف الطلب`);
      if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
    }
    if (f.type === 'badge' && f.badges) {
      toast('🏅 شارة جديدة: ' + f.badges.map((b) => `${b.emoji} ${b.name}`).join(' · '));
      confetti(60);
    }
  });

  socket.on('connect', async () => {
    $('offline-bar').classList.remove('is-on');
    const s = loadSession();
    if (s && s.code && s.playerId) {
      const ack = await emit('room:rejoin', { code: s.code, playerId: s.playerId });
      if (ack.ok) { me = s; playKey = null; applyState(ack.state); }
      else { clearSession(); screen('screen-home'); }
    }
  });
  socket.on('disconnect', () => $('offline-bar').classList.add('is-on'));
  socket.io.on('reconnect_attempt', () => $('offline-bar').classList.add('is-on'));

  // ================= timers =================
  setInterval(() => {
    document.querySelectorAll('[data-timer]').forEach((el) => {
      const left = Math.max(0, Math.ceil((Number(el.dataset.timer) - Date.now()) / 1000));
      el.textContent = left;
      el.classList.toggle('is-low', left <= 5);
      if (left === 0 && state && state.game) {
        const g = state.game;
        if (g.engine === 'speed' && g.current && !g.current.revealed && !g.current.answered.includes(me.playerId)) {
          gact('submit', { value: ($('sp-input') || {}).value || '' });
        }
        if (g.engine === 'draw' && g.current && !g.current.found && g.current.drawerId === me.playerId) {
          gact('timeout');
        }
      }
    });
    document.querySelectorAll('[data-tbar]').forEach((el) => {
      const total = Number(el.dataset.total) * 1000;
      const left = Math.max(0, Number(el.dataset.tbar) - Date.now());
      el.style.width = `${Math.round((left / total) * 100)}%`;
    });
  }, 250);

  // ================= confetti =================
  const cv = $('fx-canvas'), ctx = cv.getContext('2d');
  let parts = [], raf = null;
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; };
  size(); addEventListener('resize', size);

  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#FF5C8A', '#F2C46B', '#6FE3C4', '#9C8CFF', '#FBF2F6'];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.6,
        y: cv.height * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 7, vy: Math.random() * -9 - 3,
        g: 0.24 + Math.random() * 0.12, s: 4 + Math.random() * 6,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0], life: 90 + Math.random() * 50,
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
