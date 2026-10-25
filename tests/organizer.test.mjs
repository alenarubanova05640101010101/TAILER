import test from 'node:test';
import assert from 'node:assert/strict';
import {events, initialState, register, sendChatInvite} from '../dist/model.js';
import {emptyOrg, applyOrg, createEvent, updateEvent, resetEvent, deleteEvent, eventFields, parsePost, createChannel, postToChannel, subscribe, subscribed, eventStats, orgTotals, analytics, analyticsTotals, countView, ownEvents, loadOrg, saveOrg, clubsOf} from '../dist/organizer.js';

const ok = {title: 'Лекция', desc: 'Описание', place: 'Ауд. 1', category: 'Бизнес', day: '5', endDay: '', time: '18:30'};
const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v)}; };

test('create event: validated, gets own id, defaults filled, appears in events', () => {
  const org = createEvent(emptyOrg(), 'Мой клуб', ok);
  applyOrg(org);
  const e = events.find(x => x.id === 'org-1');
  assert.equal(e.club, 'Мой клуб'); assert.equal(e.endDay, 5); assert.equal(e.style, 'tech');
  assert.ok(e.expect && e.location && e.cost);
  assert.deepEqual(ownEvents('Мой клуб').map(x => x.id), ['org-1']);
});
test('validation rejects bad day, time, category, empty title', () => {
  for (const bad of [{day: '31'}, {day: '0'}, {endDay: '3'}, {time: '25:00'}, {category: 'Нет такой'}, {title: '  '}])
    assert.throws(() => eventFields({...ok, ...bad}), Error, JSON.stringify(bad));
});
test('editing an existing event is a layer that can be reset; base data is untouched', () => {
  let org = updateEvent(emptyOrg(), 'diwali', {title: 'Дивали-2', day: '9', endDay: '9', desc: 'Новое'});
  applyOrg(org);
  assert.equal(events.find(e => e.id === 'diwali').title, 'Дивали-2');
  assert.equal(events.find(e => e.id === 'diwali').day, 9);
  org = resetEvent(org, 'diwali'); applyOrg(org);
  assert.notEqual(events.find(e => e.id === 'diwali').title, 'Дивали-2');
  assert.throws(() => updateEvent(emptyOrg(), 'nope', {title: 'x'}));
});
test('delete removes only custom events; ids stay unique after delete', () => {
  let org = createEvent(emptyOrg(), 'Клуб', ok); org = deleteEvent(org, 'org-1'); org = createEvent(org, 'Клуб', ok);
  applyOrg(org);
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
  assert.ok(events.some(e => e.id === 'org-2') && !events.some(e => e.id === 'org-1'));
});
test('parsePost picks title, date, time, place', () => {
  const r = parsePost('🎉 «Вечер настолок»\nПриходите 12 ноября в 19:30!\n📍 Где: ауд. 305\nБесплатно, вход свободный');
  assert.equal(r.title, 'Вечер настолок'); assert.equal(r.day, 12); assert.equal(r.time, '19:30'); assert.equal(r.place, 'ауд. 305'); assert.equal(r.cost, 'Бесплатно');
  assert.deepEqual(parsePost(''), {});
});
test('channels: create, post, event link; empty post rejected; subscribe is idempotent', () => {
  let org = createChannel(emptyOrg(), 'Клуб', {name: 'Новости', about: ''});
  org = postToChannel(org, 'ch-1', {text: ' Привет ', eventId: 'diwali'}, '2026-10-25T10:00:00Z');
  assert.equal(org.channels[0].posts[0].text, 'Привет');
  assert.throws(() => postToChannel(org, 'ch-1', {text: ' '}));
  assert.throws(() => createChannel(org, 'Клуб', {name: 'я'}));
  let s = subscribe(initialState(), 'ch-1', true); s = subscribe(s, 'ch-1', true);
  assert.deepEqual(s.subs, ['ch-1']); assert.equal(subscribed(subscribe(s, 'ch-1', false), 'ch-1'), false);
});
test('stats: real actions add up, invites counted per event, custom event starts at zero', () => {
  const e = events.find(x => x.id === 'diwali');
  const base = eventStats(initialState(), e);
  let s = register(initialState(), 'diwali'); s = sendChatInvite(s, 'maxim', 'diwali'); s = countView(s, 'diwali');
  const st = eventStats(s, e);
  assert.equal(st.going, base.going + 1); assert.equal(st.invites, 1); assert.equal(st.views, base.views + 1 + 4);
  assert.ok(st.open >= 1 && st.first <= st.going && st.saves <= st.views);
  const t = orgTotals(s, [e]); assert.equal(t.going, st.going);
  applyOrg(createEvent(emptyOrg(), 'Клуб', ok));
  const z = eventStats(initialState(), events.find(x => x.id === 'org-1')); assert.equal(z.going, 0); assert.equal(z.invites, 0);
});
test('storage round-trip and corrupt data fall back to empty', () => {
  const st = memory(); const org = createChannel(emptyOrg(), 'Клуб', {name: 'Новости'});
  assert.ok(saveOrg(org, st)); assert.deepEqual(loadOrg(st), org);
  st.setItem('tyler-organizer-v1', '{oops'); assert.deepEqual(loadOrg(st), emptyOrg());
});
test('login list: Hack Club and AI/ML first, then all groups, no duplicates; events bind to a group by Telegram channel', () => {
  const list = clubsOf();
  assert.deepEqual(list.slice(0, 2), ['HSE Hack Club', 'AI/ML Клуб']);
  assert.ok(list.length >= 90);
  assert.equal(new Set(list.map(x => x.toLowerCase())).size, list.length);
  assert.ok(ownEvents('ISN HSE Moscow', events).length >= 1);
});

test('analytics: came <= registered, sources and dynamics add up to registered, totals sum events', () => {
  const list = ['diwali', 'hackathon'].map(id => events.find(x => x.id === id)).filter(Boolean);
  const s = initialState();
  for (const e of list) {
    const a = analytics(s, e);
    assert.ok(a.came <= a.going && a.rate >= 0 && a.rate <= 100);
    assert.equal(a.sources.reduce((x, y) => x + y, 0), a.going);
    assert.equal(a.dynamics.reduce((x, y) => x + y, 0), a.going);
  }
  const t = analyticsTotals(s, list);
  assert.equal(t.going, list.reduce((x, e) => x + analytics(s, e).going, 0));
});
