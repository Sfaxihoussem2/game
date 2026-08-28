'use strict';

const knowledge = require('../data/knowledge');
const relation = require('../data/relation');
const love = require('../data/love');
const situations = require('../data/situations');
const missions = require('../data/missions');
const humor = require('../data/humor');
const deep = require('../data/deep');
const bold = require('../data/bold');
const special = require('../data/special');

// ---- تعريف الفئات -------------------------------------------------------
// points  : النقاط الأساسية متاع الكارت
// vote    : يوري سؤال «جاوبتوا كيف كيف؟» (الفئة متاع «قدّاش نعرفك»)
const CATEGORIES = {
  love: { id: 'love', label: 'سؤال حب', emoji: '❤️', points: 1, vote: false },
  knowledge: { id: 'knowledge', label: 'قدّاش نعرفك؟', emoji: '🧠', points: 2, vote: true },
  situation: { id: 'situation', label: 'موقف', emoji: '🎭', points: 2, vote: false },
  humor: { id: 'humor', label: 'ضحك', emoji: '😂', points: 1, vote: false },
  bold: { id: 'bold', label: 'جريء', emoji: '🔥', points: 2, vote: false },
  mission: { id: 'mission', label: 'مهمّة', emoji: '🎯', points: 3, vote: false },
  deep: { id: 'deep', label: 'سؤال عميق', emoji: '💭', points: 2, vote: false },
  relation: { id: 'relation', label: 'علاقتنا', emoji: '💑', points: 2, vote: false },
};

const LEVELS = { easy: 1, medium: 2, hard: 3 };

/** يحوّل ملف داتا (easy/medium/hard) لقائمة كروت موحّدة */
function flatten(catId, source) {
  const out = [];
  for (const bucket of ['easy', 'medium', 'hard']) {
    const arr = source[bucket] || [];
    arr.forEach((text, i) => {
      out.push({
        id: `${catId}-${bucket[0]}${i}`,
        cat: catId,
        text,
        level: LEVELS[bucket],
        points: CATEGORIES[catId].points,
        vote: CATEGORIES[catId].vote,
      });
    });
  }
  return out;
}

const DECKS = {
  love: flatten('love', love),
  knowledge: flatten('knowledge', knowledge),
  situation: flatten('situation', situations),
  humor: flatten('humor', humor),
  bold: flatten('bold', bold),
  mission: flatten('mission', missions),
  deep: flatten('deep', deep),
  relation: flatten('relation', relation),
};

const SPECIALS = special.map((s, i) => ({ id: `special-${i}`, ...s }));

// ---- أدوات عشوائية ------------------------------------------------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * مدير الكروت متاع partie وحدة.
 * كل catégorie عندها "pioche" مخلوطة، ما يتعاودش كارت كان بعد ما تكمل الفئة.
 */
class Dealer {
  constructor(enabledCats) {
    this.enabled = enabledCats && enabledCats.length ? enabledCats : Object.keys(DECKS);
    this.piles = {};
    this.specialPile = shuffle(SPECIALS.map((s) => s.id));
    for (const cat of Object.keys(DECKS)) this.reshuffle(cat);
  }

  reshuffle(cat) {
    this.piles[cat] = shuffle(DECKS[cat].map((c) => c.id));
  }

  setCategories(cats) {
    this.enabled = cats && cats.length ? cats : Object.keys(DECKS);
  }

  byId(id) {
    if (id.startsWith('special-')) return SPECIALS.find((s) => s.id === id) || null;
    const cat = id.split('-')[0];
    return (DECKS[cat] || []).find((c) => c.id === id) || null;
  }

  /** يجبد كارت من فئة معيّنة (ولا فئة عشوائية من المفعّلين) */
  draw(cat) {
    const category = cat || this.enabled[Math.floor(Math.random() * this.enabled.length)];
    if (!this.piles[category] || this.piles[category].length === 0) this.reshuffle(category);
    const id = this.piles[category].pop();
    return { ...this.byId(id) };
  }

  drawSpecial() {
    if (this.specialPile.length === 0) this.specialPile = shuffle(SPECIALS.map((s) => s.id));
    const id = this.specialPile.pop();
    return { ...this.byId(id) };
  }

  stats() {
    const s = {};
    for (const cat of Object.keys(DECKS)) s[cat] = DECKS[cat].length;
    s.special = SPECIALS.length;
    s.total = Object.values(DECKS).reduce((a, d) => a + d.length, 0) + SPECIALS.length;
    return s;
  }
}

module.exports = { CATEGORIES, DECKS, SPECIALS, Dealer, shuffle };
