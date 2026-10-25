import {events, interests, dateLabel, timeLabel} from './events.js';
import {applyOrg, loadOrg, saveOrg, readParticipant, clubsOf, ownEvents, isCustom, clubName, eventFields, updateEvent, resetEvent, createEvent, deleteEvent, parsePost, createChannel, postToChannel, deleteChannel, eventStats, orgTotals, analytics, analyticsTotals, SOURCES, DAYS_BEFORE, ORG_KEY} from './organizer.js';

const $ = s => document.querySelector(s);
const modal = $('#modal');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = ts => new Date(ts).toLocaleString('ru-RU', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'});

let org = loadOrg();
let tab = ['events', 'analytics', 'channel'].find(t => t === location.hash.slice(1)) || 'overview';
let anEvent = 'all';
let lastFocus = null;
applyOrg(org);

function toast(s) {
  const t = $('#toast');
  t.textContent = s; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 3500);
}
// Сохранить новую версию данных организатора и перерисовать: приложение участника подхватит её по событию storage.
function commit(next) {
  if (!saveOrg(next)) { toast('Не удалось сохранить. Проверь доступ к хранилищу браузера.'); return false; }
  org = next; applyOrg(org); return true;
}
function openModal(title, body) {
  lastFocus = document.activeElement;
  modal.innerHTML = `<div class="modal-top"><h2>${title}</h2><button class="icon-btn" data-action="close" aria-label="Закрыть">✕</button></div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}

function login() {
  const clubs = clubsOf();
  return `<main class="org-login"><section class="panel" aria-labelledby="t"><div class="brand" style="padding:0"><img src="icon.svg" alt="">тайлер<span style="color:#86a469">.</span></div>
<h1 id="t">Кабинет организатора</h1>
<p>Для студенческих организаций и клубов: смотри, сколько людей идёт к вам через Тайлер, редактируй мероприятия, изучай аналитику и веди свой канал.</p>
<form id="login-form"><label class="field">Название организации<input id="club-input" name="club" required maxlength="80" autocomplete="off" placeholder="Найди в списке или введи своё"></label>
<div class="club-list" id="club-list" role="listbox" aria-label="Организации">${clubs.map(c => `<button type="button" role="option" data-action="pick-club" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>
<p id="login-error" class="registration-error" role="alert" style="margin-top:10px"></p>
<button class="primary full-width" type="submit" style="margin-top:6px">Войти</button></form>
<p class="org-note">Демо: вход без пароля, организацию можно выбрать любую. Настоящая проверка организаторов потребует сервера и аккаунтов вуза.</p>
<p class="org-note"><a class="text-link" href="./">← К приложению участника</a></p></section></main>`;
}

function shell(body) {
  return `<header class="org-top"><div class="brand"><img src="icon.svg" alt="">тайлер<span style="color:#86a469">.</span><small>для организаторов</small></div>
<div class="org-who"><span class="pill-demo">ДЕМО</span><span>${esc(org.club)}</span><button class="text-link" data-action="logout">Выйти</button></div></header>
<div class="org-wrap"><div class="tabs">${[['overview', 'Обзор'], ['events', 'Мероприятия'], ['analytics', 'Аналитика'], ['channel', 'Канал']].map(([id, t]) => `<button class="tab ${tab === id ? 'active' : ''}" data-action="tab" data-value="${id}">${t}</button>`).join('')}</div>${body}</div>`;
}

const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';

function overview() {
  const s = readParticipant();
  const own = ownEvents(org.club);
  if (!own.length) return `<div class="panel"><h2>Пока нет мероприятий</h2><p style="margin:8px 0 16px">У «${esc(org.club)}» ещё нет событий в афише. Добавь первое — и здесь появится статистика.</p><button class="primary" data-action="new-event">Добавить мероприятие</button></div>`;
  const t = orgTotals(s, own);
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  return `<div class="stat-grid">${stat(t.going, 'записались через Тайлер')}${stat(t.open, 'открыты к знакомству')}${stat(t.invites, 'знакомств начато (приглашения в чатах)')}${stat(t.first, 'первокурсников среди идущих')}${stat(t.views, 'просмотров карточек')}${stat(pct(t.going, t.views), 'просмотр → запись')}</div>
<section class="panel"><div class="org-head"><h2>По мероприятиям</h2></div><div class="org-table-wrap"><table class="org-table"><thead><tr><th>Мероприятие</th><th>Идут</th><th>Открыты</th><th>1 курс</th><th>Знакомства</th><th>Просмотры</th><th></th></tr></thead><tbody>${t.rows.map(({e, st}) => `<tr><td>${esc(e.title)}<small style="display:block;font-weight:500;color:var(--muted)">${dateLabel(e)} · ${timeLabel(e)}</small></td><td>${st.going}</td><td>${st.open}</td><td>${st.first}</td><td>${st.invites}</td><td>${st.views}</td><td><button class="text-link" data-action="details" data-id="${esc(e.id)}">Подробнее</button></td></tr>`).join('')}</tbody></table></div>
<p class="org-note">Это демо без сервера. Участники из пула «Найди своих» вымышлены, просмотры и сохранения — оценка по числу записавшихся плюс реальные открытия карточки в этом браузере. Реальны только действия, сделанные в приложении участника на этом же устройстве. Все, кто записался, пришли именно из Тайлера.</p></section>`;
}

function details(id) {
  const e = events.find(x => x.id === id);
  if (!e) return;
  const st = eventStats(readParticipant(), e);
  const max = Math.max(st.views, 1);
  const bar = (label, n, base = max) => `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${Math.round(n / base * 100)}%"></i></div><b>${n}</b></div>`;
  const topMax = Math.max(...st.top.map(x => x[1]), 1);
  openModal(esc(e.title), `<p style="color:var(--muted);margin-bottom:14px">${dateLabel(e)} · ${timeLabel(e)} · ${esc(e.place)}</p>
<h3 style="margin:6px 0 4px">Путь к вам</h3>${bar('Посмотрели карточку', st.views)}${bar('Сохранили', st.saves)}${bar('Записались', st.going)}${bar('Открыты к знакомству', st.open)}${bar('Позвали других (приглашения)', st.invites)}
<p class="org-note">Конверсия просмотр → запись: ${pct(st.going, st.views)}. Среди идущих первокурсников: ${st.first} из ${st.going}; с общими интересами у вас на сайте: ${st.shared}.</p>
<h3 style="margin:22px 0 4px">Чем интересуются идущие</h3>${st.top.length ? st.top.map(([n, c]) => bar(esc(n), c, topMax)).join('') : '<p>Пока никто не записался.</p>'}`);
}

function eventsTab() {
  const own = ownEvents(org.club);
  return `<div class="org-head"><h2>Мероприятия «${esc(org.club)}»</h2><button class="primary" data-action="new-event">+ Добавить мероприятие</button></div>
<section class="panel">${own.length ? own.map(e => {
    const custom = isCustom(org, e.id), edited = !!org.overrides[e.id];
    return `<div class="org-row"><div><b>${esc(e.title)}</b>${custom ? ' <span class="tag">своё</span>' : edited ? ' <span class="tag">изменено</span>' : ''}<small>${dateLabel(e)} · ${timeLabel(e)} · ${esc(e.place)}</small></div><div class="org-actions"><button data-action="edit-event" data-id="${esc(e.id)}">Редактировать</button>${custom ? `<button class="danger" data-action="delete-event" data-id="${esc(e.id)}">Удалить</button>` : edited ? `<button data-action="reset-event" data-id="${esc(e.id)}">Вернуть как в анонсе</button>` : ''}</div></div>`;
  }).join('') : '<p>Пока нет мероприятий. Добавь первое.</p>'}</section>
<p class="org-note">Изменения сразу видны в приложении участника на этом устройстве. На других устройствах они появятся после подключения сервера.</p>`;
}

function field(key, label, v, {full = false, type = 'text', max = 200, req = false, extra = ''} = {}) {
  return `<label class="field ${full ? 'full' : ''}">${label}<input name="${key}" type="${type}" maxlength="${max}" ${req ? 'required' : ''} ${extra} value="${esc(v ?? '')}"></label>`;
}
function eventForm(e = {}) {
  const isNew = !e.id;
  return `<form id="event-form" class="org-form" data-id="${esc(e.id || '')}">
${isNew ? `<div class="paste-box"><b>Заполнить из текста поста</b><p>Вставь анонс из Telegram или ВК: подставим название, дату, время и место, если найдём. Это простые правила, не нейросеть: проверь результат. Подключить ИИ можно будет вместе с сервером.</p><textarea id="paste" placeholder="Текст анонса" maxlength="4000"></textarea><button type="button" class="secondary" data-action="parse" style="margin-top:8px">Заполнить поля</button></div>` : ''}
<div class="form-grid">${field('title', 'Название', e.title, {full: true, req: true, max: 120})}
<label class="field full">Сфера<select name="category">${interests.map(c => `<option ${c === (e.category || interests[0]) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
${field('day', 'День ноября', e.day, {type: 'number', req: true, extra: 'min="1" max="30"'})}${field('endDay', 'Последний день (если несколько)', e.endDay !== e.day ? e.endDay : '', {type: 'number', extra: 'min="1" max="30"'})}
${field('time', 'Время (ЧЧ:ММ)', e.time, {max: 5, extra: 'placeholder="18:30" inputmode="numeric"'})}${field('duration', 'Продолжительность', e.duration, {max: 80})}
${field('place', 'Место (коротко)', e.place, {req: true, max: 100})}${field('cost', 'Участие / стоимость', e.cost, {max: 80})}
${field('location', 'Адрес / как найти', e.location, {full: true, max: 200})}${field('deadline', 'Дедлайн регистрации', e.deadline, {full: true, max: 140})}
${field('short', 'Надпись на обложке', e.short ? e.short.replace('\n', ' ') : '', {full: true, max: 40})}
<label class="field full">Описание<textarea name="desc" required maxlength="2000">${esc(e.desc || '')}</textarea></label>
<label class="field full">Что ждёт участников<textarea name="expect" maxlength="1000">${esc(e.expect || '')}</textarea></label></div>
<p id="form-error" class="registration-error" role="alert"></p>
<div class="modal-actions"><button class="primary" type="submit">${isNew ? 'Добавить' : 'Сохранить'}</button></div></form>`;
}

function analyticsTab() {
  const s = readParticipant();
  const own = ownEvents(org.club);
  if (!own.length) return `<div class="panel"><h2>Аналитика появится вместе с мероприятиями</h2><p style="margin:8px 0 16px">Добавь первое мероприятие «${esc(org.club)}» — и здесь покажем, сколько человек пришло через Тайлер.</p><button class="primary" data-action="new-event">Добавить мероприятие</button></div>`;
  if (anEvent !== 'all' && !own.some(e => e.id === anEvent)) anEvent = 'all';
  const one = anEvent === 'all' ? null : own.find(e => e.id === anEvent);
  const t = analyticsTotals(s, one ? [one] : own);
  const first = pct(t.first, t.going), came = pct(t.came, t.going);
  const stat = (n, l, hint = '') => `<div class="stat"><b>${n}</b><span>${l}</span>${hint ? `<em>${hint}</em>` : ''}</div>`;
  const bar = (label, n, base, cls = '') => `<div class="bar-row"><span>${label}</span><div class="bar ${cls}"><i style="width:${Math.round(n / Math.max(base, 1) * 100)}%"></i></div><b>${n}</b></div>`;
  const dmax = Math.max(...t.dynamics, 1);
  const topTally = {};
  for (const {e} of t.rows) for (const [n, c] of eventStats(s, e).top) topTally[n] = (topTally[n] || 0) + c;
  const top = Object.entries(topTally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 5);
  const topMax = Math.max(...top.map(x => x[1]), 1);
  return `<div class="org-head"><h2>Аналитика${one ? '' : ' · все мероприятия'}</h2><label class="an-pick">Мероприятие<select data-action-change="an-event"><option value="all">Все мероприятия</option>${own.map(e => `<option value="${esc(e.id)}" ${e.id === anEvent ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</select></label></div>
${one ? `<p class="an-sub">${dateLabel(one)} · ${timeLabel(one)} · ${esc(one.place)}</p>` : ''}
<div class="stat-grid">${stat(t.going, 'зарегистрировались через Тайлер')}${stat(t.came, 'пришли из них')}${stat(came, 'доходимость: зарегистрировались → пришли', t.rate >= 75 ? 'выше среднего' : t.rate >= 65 ? 'в норме' : 'ниже нормы, напомни участникам')}${stat(pct(t.going, t.views), 'просмотр карточки → запись')}${stat(first, 'первокурсников среди записавшихся')}</div>
<div class="an-grid"><section class="panel"><h3 class="an-h">Воронка</h3>${bar('Посмотрели карточку', t.views, t.views)}${bar('Сохранили', t.saves, t.views)}${bar('Зарегистрировались', t.going, t.views)}${bar('Пришли', t.came, t.views, 'accent')}<p class="org-note">Из ${t.going} записавшихся не дошли ${t.going - t.came}. Это нормально: обычно доходит от 60 до 90%.</p></section>
<section class="panel"><h3 class="an-h">Откуда пришли в Тайлере</h3>${SOURCES.map((n, i) => bar(n, t.sources[i], Math.max(...t.sources, 1))).join('')}<p class="org-note">Через какой раздел человек нашёл мероприятие перед записью.</p></section></div>
<section class="panel" style="margin-top:18px"><h3 class="an-h">Когда записываются</h3><div class="cols" role="img" aria-label="Записи по дням до мероприятия">${t.dynamics.map((n, i) => `<div class="col"><b>${n}</b><i style="height:${Math.max(4, Math.round(n / dmax * 100))}px"></i><span>${DAYS_BEFORE[i]}</span></div>`).join('')}</div><p class="org-note">Основная волна записей приходится на последние дни — публикуй анонс и напоминания в канале заранее.</p></section>
${one ? '' : `<section class="panel" style="margin-top:18px"><h3 class="an-h">По мероприятиям</h3><div class="org-table-wrap"><table class="org-table"><thead><tr><th>Мероприятие</th><th>Зарегистрировано</th><th>Пришли</th><th>Доходимость</th><th></th></tr></thead><tbody>${t.rows.map(({e, a}) => `<tr><td>${esc(e.title)}<small style="display:block;font-weight:500;color:var(--muted)">${dateLabel(e)} · ${timeLabel(e)}</small></td><td>${a.going}</td><td>${a.came}</td><td><span class="rate"><span class="bar"><i style="width:${a.rate}%"></i></span>${a.going ? a.rate + '%' : '—'}</span></td><td><button class="text-link" data-action="an-open" data-id="${esc(e.id)}">Открыть</button></td></tr>`).join('')}</tbody></table></div></section>`}
<section class="panel" style="margin-top:18px"><h3 class="an-h">Кто приходит</h3><div class="an-grid flat"><div>${bar('Открыты к знакомству', t.open, Math.max(t.going, 1))}${bar('Первокурсники', t.first, Math.max(t.going, 1))}${bar('Позвали друзей (приглашения)', t.invites, Math.max(t.going, 1))}</div><div><b class="an-mini">Чем интересуются</b>${top.length ? top.map(([n, c]) => bar(esc(n), c, topMax)).join('') : '<p>Пока никто не записался.</p>'}</div></div></section>
<p class="org-note">Прототип с демо-данными. Регистрации — реальные действия в этом браузере плюс вымышленный пул «Найди своих»; цифры «пришли» и разбивки — оценка. В настоящей версии посещение подтверждается на входе, а источники считаются по переходам.</p>`;
}

function channelTab() {
  const s = readParticipant();
  const own = ownEvents(org.club);
  const ch = org.channels.find(c => c.club === org.club);
  if (!ch) return `<div class="org-head"><h2>Канал</h2></div>
<section class="panel channel-empty"><div class="ico" aria-hidden="true">📣</div><h3>У «${esc(org.club)}» пока нет канала</h3><p>Можно создать свой канал: это лента ваших объявлений внутри Тайлера. Участники находят его в разделе «Каналы» и подписываются, а вы пишете о новых мероприятиях и напоминаете о них.</p><button class="primary" data-action="new-channel">+ Создать свой канал</button></section>`;
  const st = channelStats(s, ch);
  return `<div class="org-head"><h2>Канал</h2></div>
<section class="panel"><div class="org-row" style="border:0;padding-top:0"><div><b>${esc(ch.name)}</b><small>${esc(ch.about)}</small><small>Подписчиков: ${st.subscribers} · сообщений: ${st.posts}</small></div><div class="org-actions"><button class="danger" data-action="delete-channel" data-id="${esc(ch.id)}">Удалить</button></div></div>
<form class="channel-post" data-id="${esc(ch.id)}"><textarea name="text" maxlength="1500" placeholder="Новое сообщение подписчикам" required></textarea><label class="field">Прикрепить мероприятие<select name="eventId"><option value="">Без мероприятия</option>${own.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label><div><button class="primary" type="submit">Опубликовать</button></div></form>
${[...ch.posts].reverse().map(p => `<div class="post"><time>${when(p.ts)}</time>${esc(p.text)}</div>`).join('')}</section>
<p class="org-note">Подписчики считаются только по этому браузеру: общей базы пока нет.</p>`;
}

function render() {
  $('#app').innerHTML = !org.club ? login() : shell(tab === 'events' ? eventsTab() : tab === 'analytics' ? analyticsTab() : tab === 'channel' ? channelTab() : overview());
}

function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'close': modal.close(); break;
    case 'pick-club': $('#club-input').value = el.dataset.value; $('#login-form').requestSubmit(); break;
    case 'tab': tab = el.dataset.value; render(); break;
    case 'logout': if (commit({...org, club: ''})) { tab = 'overview'; render(); } break;
    case 'details': details(id); break;
    case 'an-open': anEvent = id; render(); window.scrollTo(0, 0); break;
    case 'new-event': openModal('Новое мероприятие', eventForm()); break;
    case 'edit-event': openModal('Редактировать мероприятие', eventForm(events.find(e => e.id === id))); break;
    case 'delete-event': if (confirm('Удалить мероприятие?') && commit(deleteEvent(org, id))) { render(); toast('Мероприятие удалено'); } break;
    case 'reset-event': if (commit(resetEvent(org, id))) { render(); toast('Возвращено как в анонсе'); } break;
    case 'parse': {
      const f = parsePost($('#paste').value), form = $('#event-form');
      for (const [k, v] of Object.entries(f)) if (form.elements[k]) form.elements[k].value = v;
      toast(Object.keys(f).length ? 'Поля заполнены — проверь их' : 'Ничего не нашли, заполни вручную');
      break;
    }
    case 'new-channel': openModal('Новый канал', `<form id="channel-form" class="org-form"><div class="form-grid">${field('name', 'Название канала', '', {full: true, req: true, max: 60})}<label class="field full">О чём канал<textarea name="about" maxlength="300"></textarea></label></div><p id="form-error" class="registration-error" role="alert"></p><div class="modal-actions"><button class="primary" type="submit">Создать</button></div></form>`); break;
    case 'delete-channel': if (confirm('Удалить канал вместе с сообщениями?') && commit(deleteChannel(org, id))) { render(); toast('Канал удалён'); } break;
  }
});

document.addEventListener('submit', ev => {
  const form = ev.target, fid = form.id;
  ev.preventDefault();
  const err = m => { const p = $('#form-error'); if (p) p.textContent = m; else toast(m); };
  try {
    if (fid === 'login-form') {
      const club = clubName(formValues(form).club);
      if (commit({...org, club})) render();
    } else if (fid === 'event-form') {
      const values = formValues(form), id = form.dataset.id;
      eventFields(values, {partial: !!id});
      if (commit(id ? updateEvent(org, id, values) : createEvent(org, org.club, values))) { modal.close(); render(); toast(id ? 'Изменения сохранены' : 'Мероприятие добавлено'); }
    } else if (fid === 'channel-form') {
      if (commit(createChannel(org, org.club, formValues(form)))) { modal.close(); tab = 'channel'; render(); toast('Канал создан'); }
    } else if (form.classList.contains('channel-post')) {
      const v = formValues(form);
      if (commit(postToChannel(org, form.dataset.id, {text: v.text, eventId: v.eventId}))) { render(); toast('Сообщение опубликовано'); }
    }
  } catch (e) { err(e.message); }
});

document.addEventListener('change', e => {
  if (e.target.dataset.actionChange === 'an-event') { anEvent = e.target.value; render(); }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'club-input') return;
  const q = e.target.value.trim().toLowerCase();
  for (const b of document.querySelectorAll('#club-list button')) b.hidden = !!q && !b.dataset.value.toLowerCase().includes(q);
});
modal.addEventListener('click', e => {
  if (e.target !== modal) return;
  const r = modal.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
});
modal.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); });
// Приложение участника пишет в свой ключ: подтягиваем свежие цифры, не трогая открытые формы.
window.addEventListener('storage', e => {
  if (e.key === 'tyler-campus-v2' && !modal.open) render();
  if (e.key === ORG_KEY && !modal.open) { org = loadOrg(); applyOrg(org); render(); }
});
render();
