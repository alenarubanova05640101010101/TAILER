// Данные организаторов: правки и новые события, каналы, статистика.
// Сервера нет: всё лежит в localStorage этого браузера, поэтому кабинет организатора и приложение участника
// видят друг друга только на одном устройстве (одна ссылка-источник, два входа).
import {events,spheres,interests} from './events.js';
import {crowd,initialState,attended} from './model.js';
import {groups} from './groups.js';

export const ORG_KEY = 'tyler-organizer-v1';
export const emptyOrg = () => ({version: 1, club: '', overrides: {}, custom: [], channels: [], seq: 0});

const LIMITS = {title: 120, short: 40, club: 80, place: 100, location: 200, desc: 2000, expect: 1000, cost: 80, duration: 80, deadline: 140, source: 200};
const EDITABLE = ['title', 'short', 'category', 'place', 'location', 'day', 'endDay', 'time', 'duration', 'cost', 'deadline', 'desc', 'expect'];

const text = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

// Проверка и нормализация полей мероприятия. Бросает Error с текстом для человека.
export function eventFields(values, {partial = false} = {}) {
  const out = {};
  const v = values || {};
  const need = (key, label) => {
    if (partial && !(key in v)) return;
    const t = text(v[key], LIMITS[key]);
    if (!t) throw new Error(`Заполни поле «${label}».`);
    out[key] = t;
  };
  need('title', 'Название');
  need('desc', 'Описание');
  need('place', 'Место (коротко)');
  if (!partial || 'category' in v) {
    if (!interests.includes(v.category)) throw new Error('Выбери сферу из списка.');
    out.category = v.category;
  }
  if (!partial || 'day' in v || 'endDay' in v) {
    const day = Number(v.day), endDay = v.endDay === '' || v.endDay == null ? day : Number(v.endDay);
    if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error('День — число от 1 до 30 (ноябрь 2026).');
    if (!Number.isInteger(endDay) || endDay < day || endDay > 30) throw new Error('Последний день не может быть раньше первого или позже 30 ноября.');
    out.day = day; out.endDay = endDay;
  }
  if (!partial || 'time' in v) {
    const t = text(v.time, 5);
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('Время — в формате ЧЧ:ММ, например 18:30, или пусто.');
    out.time = t;
  }
  for (const [key, fallback] of [['short', null], ['location', null], ['duration', 'уточняется'], ['cost', 'Уточняй в анонсе'], ['deadline', ''], ['expect', 'Подробности — в описании.']]) {
    if (partial && !(key in v)) continue;
    const t = text(v[key], LIMITS[key]);
    out[key] = t || (fallback ?? (key === 'location' ? out.place || '' : (out.title || '').toUpperCase().slice(0, 28)));
  }
  return out;
}

let BASE = null;
// Применяет правки и новые события к массиву events на месте (все модули держат ссылку на один и тот же массив).
export function applyOrg(org, list = events) {
  BASE ??= structuredClone(list);
  const o = org || emptyOrg();
  const styleOf = Object.fromEntries(spheres.map(s => [s.name, s.style]));
  const shape = e => ({...e, interests: [...new Set([e.category, ...(e.interests || [])])], style: styleOf[e.category] || e.style});
  const merged = BASE.map(b => shape({...b, ...(o.overrides?.[b.id] || {})}));
  const custom = (o.custom || []).map(c => shape({people: 0, source: '', ...c}));
  list.length = 0;
  list.push(...merged, ...custom);
  return list;
}

export function loadOrg(storage = globalThis.localStorage) {
  try {
    const o = JSON.parse(storage.getItem(ORG_KEY));
    if (o?.version === 1 && o.overrides && Array.isArray(o.custom) && Array.isArray(o.channels)) return o;
  } catch { /* пусто или повреждено */ }
  return emptyOrg();
}
export function saveOrg(org, storage = globalThis.localStorage) {
  try { storage.setItem(ORG_KEY, JSON.stringify(org)); return true; } catch { return false; }
}

// Первыми идут клубы, которые должны быть наверху списка входа; дальше группы из groups.js и клубы из афиши.
export const FIRST_CLUBS = ['HSE Hack Club', 'AI/ML Клуб'];
const tgOf = e => /^https:\/\/t\.me\/([^/]+)\//.exec(e.source || '')?.[1]?.toLowerCase();
const groupByName = name => groups.find(g => g.name === name);
export function clubsOf() {
  const seen = new Set(), out = [];
  const add = name => { const k = name.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(name.trim()); } };
  FIRST_CLUBS.forEach(add);
  groups.forEach(g => add(g.name));
  (BASE || events).forEach(e => { if (!groups.some(g => g.tg.toLowerCase() === tgOf(e))) add(e.club); });
  return out;
}
export const ownEvents = (club, list = events) => {
  const tg = groupByName(club)?.tg.toLowerCase();
  return list.filter(e => e.club === club || (tg && tgOf(e) === tg));
};
export const isCustom = (org, id) => org.custom.some(c => c.id === id);

export function clubName(value) {
  const t = text(value, LIMITS.club);
  if (t.length < 2) throw new Error('Укажи название организации (минимум 2 символа).');
  return t;
}

// Правка существующего мероприятия: для событий из афиши — слой поверх исходных данных, для своих — прямая правка.
export function updateEvent(org, id, values) {
  const n = structuredClone(org);
  const fields = eventFields(values, {partial: true});
  const i = n.custom.findIndex(c => c.id === id);
  if (i >= 0) n.custom[i] = {...n.custom[i], ...fields};
  else if ((BASE || events).some(e => e.id === id)) n.overrides[id] = {...(n.overrides[id] || {}), ...Object.fromEntries(Object.entries(fields).filter(([k]) => EDITABLE.includes(k)))};
  else throw new Error('Такого мероприятия нет.');
  return n;
}
export function resetEvent(org, id) {
  const n = structuredClone(org); delete n.overrides[id]; return n;
}
export function createEvent(org, club, values) {
  const n = structuredClone(org);
  const fields = eventFields(values);
  n.seq = (n.seq || 0) + 1;
  n.custom.push({id: `org-${n.seq}`, club: clubName(club), ...fields});
  return n;
}
export function deleteEvent(org, id) {
  const n = structuredClone(org); n.custom = n.custom.filter(c => c.id !== id); return n;
}

// Подсказка по тексту поста. Это правила, а не нейросеть: ключа и сети у приложения нет (CSP connect-src 'none').
export function parsePost(raw) {
  const t = String(raw || '').replace(/\r/g, '');
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const clean = l => l.replace(/^[^\p{L}\p{N}«"]+/u, '').replace(/[*_`]+/g, '').trim();
  const out = {};
  if (lines[0]) out.title = clean(lines[0]).replace(/^["«](.*)["»]$/, '$1').slice(0, LIMITS.title);
  const d = /(\d{1,2})\s*(?:[–-]\s*(\d{1,2})\s*)?ноября/i.exec(t) || /\b(\d{1,2})\.11(?:\.2026)?\b/.exec(t);
  if (d) { out.day = Number(d[1]); if (d[2]) out.endDay = Number(d[2]); }
  const tm = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\.\d)/.exec(t.replace(/\d{1,2}\.11(?:\.\d{4})?/g, ''));
  if (tm) out.time = `${tm[1].padStart(2, '0')}:${tm[2]}`;
  const pl = lines.find(l => /^(?:📍|(?:где|место)\b)/i.test(l.replace(/^[^\p{L}📍]+/u, '')));
  if (pl) out.place = clean(pl).replace(/^(?:где|место)\s*[:—-]?\s*/i, '').slice(0, LIMITS.place);
  if (/бесплатн|вход свободный/i.test(t)) out.cost = 'Бесплатно';
  const body = lines.slice(1).filter(l => l !== pl).join('\n').trim();
  if (body) out.desc = body.slice(0, LIMITS.desc);
  const lower = t.toLowerCase();
  const hit = spheres.map(s => [s.name, (s.name.toLowerCase().split(' ')[0].slice(0, 5))]).find(([, stem]) => lower.includes(stem));
  if (hit) out.category = hit[0];
  return out;
}

// --- Каналы ---
export function createChannel(org, club, {name, about}) {
  const n = structuredClone(org);
  const nm = text(name, 60);
  if (nm.length < 2) throw new Error('Назови канал (минимум 2 символа).');
  n.seq = (n.seq || 0) + 1;
  n.channels.push({id: `ch-${n.seq}`, club: clubName(club), name: nm, about: text(about, 300), posts: []});
  return n;
}
export function postToChannel(org, id, {text: body, eventId}, ts = new Date().toISOString()) {
  const n = structuredClone(org);
  const ch = n.channels.find(c => c.id === id);
  const t = text(body, 1500);
  if (!ch) throw new Error('Такого канала нет.');
  if (!t) throw new Error('Напиши текст сообщения.');
  n.seq = (n.seq || 0) + 1;
  ch.posts.push({id: n.seq, ts, text: t, ...(eventId ? {eventId} : {})});
  return n;
}
export function deleteChannel(org, id) {
  const n = structuredClone(org); n.channels = n.channels.filter(c => c.id !== id); return n;
}
export function subscribe(s, id, on) {
  const n = structuredClone(s);
  const set = new Set(n.subs || []);
  on ? set.add(id) : set.delete(id);
  n.subs = [...set];
  return n;
}
export const subscribed = (s, id) => (s.subs || []).includes(id);

// --- Статистика ---
const hash = str => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function countView(s, id) {
  const n = structuredClone(s); n.views ??= {}; n.views[id] = (n.views[id] || 0) + 1; return n;
}

// Показатели события. Люди из демо-пула и оценка просмотров/сохранений вымышлены; реальны только действия в этом браузере.
export function eventStats(s, e) {
  const c = crowd(s, e);
  const invites = Object.values(s.chats || {}).reduce((sum, t) => sum + t.messages.filter(m => m.type === 'invite' && m.eventId === e.id).length, 0);
  const first = c.people.filter(p => /^1 курс/.test(p.program)).length;
  const tally = {};
  for (const p of c.people) for (const i of p.interests) tally[i] = (tally[i] || 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 5);
  const realViews = s.views?.[e.id] || 0;
  const views = (c.going ? c.going * 4 + (hash('v' + e.id) % 9) : 0) + realViews;
  const saves = Math.min(views, Math.round(c.going * 1.4) + (s.saved?.includes(e.id) ? 1 : 0));
  return {going: c.going, open: c.open, shared: c.shared, first, invites, top, views, saves, realViews};
}
export function orgTotals(s, list) {
  const rows = list.map(e => ({e, st: eventStats(s, e)}));
  const sum = k => rows.reduce((a, r) => a + r.st[k], 0);
  return {events: rows.length, going: sum('going'), open: sum('open'), invites: sum('invites'), views: sum('views'), first: sum('first'), rows};
}
// Раздаёт total по долям weights так, чтобы сумма сошлась ровно (метод наибольших остатков).
const split = (total, weights) => {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => total * w / sum), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => out[i]++);
  return out;
};
export const SOURCES = ['Афиша', 'Подборка «Для тебя»', 'Приглашения в чатах', 'Канал организации'];
export const DAYS_BEFORE = ['−6 дн.', '−5', '−4', '−3', '−2', '−1', 'день события'];

// Аналитика события: воронка просмотр → запись → пришли, доходимость, источники, динамика записей.
// Запись реальна только для действий в этом браузере; «пришли» и разбивки — демо-оценка по тем же данным (посещение подтверждается на входе).
export function analytics(s, e) {
  const st = eventStats(s, e);
  const rate = 58 + hash('a' + e.id) % 31;
  const real = attended(s, e.id) ? 1 : 0;
  const came = st.going ? Math.min(st.going, Math.round(st.going * rate / 100) + real) : 0;
  const w = i => 6 + hash(`s${i}${e.id}`) % 10;
  const sources = split(st.going, [w(0) * 4 + 10, w(1) * 3 + 6, st.invites * 4 + w(2), w(3) + 2]);
  const dynamics = split(st.going, [4, 6, 9, 12, 16, 22, 31].map((x, i) => x + hash(`d${i}${e.id}`) % 4));
  return {...st, came, rate: st.going ? Math.round(came / st.going * 100) : 0, sources, dynamics};
}
export function analyticsTotals(s, list) {
  const rows = list.map(e => ({e, a: analytics(s, e)}));
  const sum = k => rows.reduce((t, r) => t + r.a[k], 0);
  const going = sum('going'), came = sum('came');
  return {rows, going, came, views: sum('views'), saves: sum('saves'), first: sum('first'), open: sum('open'), invites: sum('invites'),
    rate: going ? Math.round(came / going * 100) : 0,
    sources: SOURCES.map((_, i) => rows.reduce((t, r) => t + r.a.sources[i], 0)),
    dynamics: DAYS_BEFORE.map((_, i) => rows.reduce((t, r) => t + r.a.dynamics[i], 0))};
}
export function channelStats(s, ch) {
  return {subscribers: subscribed(s, ch.id) ? 1 : 0, posts: ch.posts.length};
}
export const readParticipant = (storage = globalThis.localStorage, key = 'tyler-campus-v2') => {
  try { const s = JSON.parse(storage.getItem(key)); if (s?.version === 1 && s.registrations && Array.isArray(s.history)) return s; } catch { /* нет профиля */ }
  return initialState();
};
