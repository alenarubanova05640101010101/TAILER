import test from 'node:test';
import assert from 'node:assert/strict';
import {events,initialState,balance,attended,reward,register,cancel,acceptOffer,confirmAttendance,invite,acceptInvitation,guestAttendance,recommended,interests,dateLabel,timeLabel,onDay} from '../dist/model.js';
test('registration gives no points; attendance is idempotent and immutable',()=>{let s=initialState();const n=register(s,'unityfest');assert.equal(s.registrations.unityfest,undefined);assert.equal(balance(n),0);s=confirmAttendance(n,'unityfest');assert.equal(balance(s),50);assert.deepEqual(confirmAttendance(s,'unityfest'),s);assert.deepEqual(cancel(s,'unityfest'),s)});
test('accepted reward replaces base; survives serialization',()=>{let s=acceptOffer(initialState());assert.equal(balance(s),0);assert.equal(reward(s,'diwali'),100);s=JSON.parse(JSON.stringify(s));s=confirmAttendance(s,'diwali');assert.equal(balance(s),100);assert.equal(s.history.length,1);assert.equal(attended(s,'diwali'),true);assert.equal(balance(confirmAttendance(s,'diwali')),100)});
test('offer balance threshold 99 vs 100',()=>{for(const value of [99,100]){let s=initialState();s.history.push({amount:value});assert.equal(acceptOffer(s).offer.status,value===99?'accepted':'available')}});
test('declined offer remains declined, no auto reactivation',()=>{let s=initialState();s.offer.status='declined';assert.equal(acceptOffer(s).offer.status,'declined')});
test('cancellation closes accepted offer and invitation',()=>{let s=invite(acceptOffer(initialState()),'diwali');s=cancel(s,'diwali');assert.equal(s.registrations.diwali,undefined);assert.equal(s.invitations.diwali,undefined);assert.equal(s.offer.status,'cancelled');assert.equal(balance(confirmAttendance(s,'diwali')),0)});
test('referral only after acceptance and both attend, in either order',()=>{for(const guestFirst of [true,false]){let s=invite(register(initialState(),'unityfest'),'unityfest');s=acceptInvitation(s,'unityfest');if(guestFirst){s=guestAttendance(s,'unityfest');assert.equal(balance(s),0);s=confirmAttendance(s,'unityfest')}else{s=confirmAttendance(s,'unityfest');assert.equal(balance(s),50);s=guestAttendance(s,'unityfest')}assert.equal(balance(s),80);s=guestAttendance(confirmAttendance(s,'unityfest'),'unityfest');assert.equal(balance(s),80);assert.equal(s.history.length,2)}});
test('no referral for unaccepted invitation; no duplicate proposal',()=>{let s=invite(register(initialState(),'unityfest'),'unityfest');const first=structuredClone(s);assert.deepEqual(invite(s,'unityfest'),first);s=guestAttendance(confirmAttendance(s,'unityfest'),'unityfest');assert.equal(balance(s),50)});
test('unregistered attendance cannot grant points',()=>{assert.equal(balance(confirmAttendance(initialState(),'diwali')),0)});
test('recommendations prefer explicit interests then upcoming dates',()=>{const s=initialState();s.profile.interests=['Волонтёрские организации'];assert.equal(recommended(s)[0].category,'Волонтёрские организации');s.profile.interests=[];assert.equal(recommended(s)[0].day,1);s.profile.interests=['Национальные клубы'];assert.equal(recommended(s)[0].id,'unityfest')});
test('November data: unique IDs, valid dates, sources, many spheres',()=>{
  assert.equal(new Set(events.map(e=>e.id)).size,events.length);
  assert.ok(events.length>=15);
  for(const e of events){
    assert.ok(e.title&&e.club&&e.location&&e.desc&&e.expect);
    assert.ok(Number.isInteger(e.day)&&e.day>=1&&e.endDay<=30&&e.endDay>=e.day);
    assert.match(e.time,/^(\d{2}:\d{2})?$/);
    assert.match(e.source,/^https:\/\/t\.me\/[\w]+\/\d+$/);
    assert.ok(interests.includes(e.category));assert.ok(e.interests.every(i=>interests.includes(i)));assert.ok(e.style);
  }
  assert.ok(interests.length>=14);
  assert.ok(events.some(e=>e.id===initialState().offer.eventId));
});
test('date helpers',()=>{assert.equal(dateLabel({day:6,endDay:6}),'6 ноября');assert.equal(dateLabel({day:20,endDay:23}),'20–23 ноября');assert.equal(onDay({day:20,endDay:23},22),true);assert.equal(onDay({day:20,endDay:23},24),false);assert.equal(timeLabel({time:''}),'время уточняется')});

const {hasProfile,completeRegistration,profileFields,completeInterests,interestFields,contactFields,identityValid}=await import('../dist/model.js');
const full=s=>completeInterests(completeRegistration(s,identity),{interests:['Спорт']});
const identity={firstName:' Анна ',lastName:' Смирнова ',university:' НИУ ВШЭ ',program:' Дизайн '};
test('first visit and legacy demo require registration; completed profile survives reload',()=>{
  const before=initialState();assert.equal(hasProfile(before),false);
  const legacy=register(before,'unityfest');legacy.profile={...legacy.profile,name:'Аня Смирнова',registered:undefined};
  assert.equal(hasProfile(legacy),false);
  const after=full(legacy);
  assert.equal(hasProfile(JSON.parse(JSON.stringify(after))),true);
  assert.equal(after.profile.name,'Анна Смирнова');assert.equal(after.profile.program,'Дизайн');
  assert.ok(after.registrations.unityfest);assert.equal(legacy.profile.registered,undefined);
});
test('all three registration fields reject blank, missing and oversized values',()=>{
  for(const [key,max] of Object.entries({firstName:60,lastName:60,university:100,program:100})){
    for(const value of ['', '   ',undefined,'а'.repeat(max+1)])assert.throws(()=>profileFields({...identity,[key]:value}));
  }
  assert.equal(hasProfile({profile:{registered:true}}),false);
});
test('identity edit keeps event activity; demo reset requires registration again',()=>{
  let s=full(initialState());s=confirmAttendance(register(s,'unityfest'),'unityfest');
  const next=completeRegistration(s,{...identity,firstName:'Иван',lastName:'Петров'});
  assert.equal(next.profile.name,'Иван Петров');assert.equal(balance(next),50);
  assert.equal(hasProfile(initialState()),false);
});

test('interests are a mandatory registration step; contact is one optional free-text field',()=>{
  const id=completeRegistration(initialState(),identity);
  assert.equal(identityValid(id),true);assert.equal(hasProfile(id),false);
  assert.throws(()=>completeInterests(id,{interests:[]}));
  assert.throws(()=>completeInterests(id,{interests:['Несуществующий']}));
  const ok=completeInterests(id,{interests:[interests[0],interests[0]]});
  assert.equal(hasProfile(ok),true);assert.deepEqual(ok.profile.interests,[interests[0]]);assert.equal(ok.profile.contact,'');assert.equal(ok.profile.phone,'');
  const c=completeInterests(id,{interests:[interests[0]],contact:'  t.me/anna_s, +7 900 123-45-67 '});
  assert.equal(c.profile.contact,'t.me/anna_s, +7 900 123-45-67');
  assert.equal(contactFields({contact:'@anna_s'}).contact,'@anna_s');
  assert.equal(contactFields({contact:'просто текст'}).contact,'просто текст');
  assert.throws(()=>contactFields({contact:'a'.repeat(121)}));
  assert.throws(()=>interestFields({interests:[interests[0]],contact:'a'.repeat(121)}));
});

const {sendChatInvite,sendText,chatInvited,inviteStatus,markRead,unreadTotal,threads,withChats,ensureThread}=await import('../dist/model.js');
test('invitation lands in the chat thread with that person, once, and follows the invitation status',()=>{
  const reg=register(initialState(),'unityfest');
  assert.equal(sendChatInvite(initialState(),'katya','unityfest').chats.katya,undefined);
  let s=sendChatInvite(reg,'katya','unityfest');
  assert.equal(chatInvited(s,'katya','unityfest'),true);assert.equal(chatInvited(s,'maxim','unityfest'),false);
  assert.equal(s.invitations.unityfest.status,'proposed');assert.equal(inviteStatus(s,'katya','unityfest'),'proposed');
  assert.deepEqual(sendChatInvite(s,'katya','unityfest'),s);
  s=acceptInvitation(s,'unityfest');assert.equal(inviteStatus(s,'katya','unityfest'),'accepted');
  assert.equal(unreadTotal(s),1);assert.equal(s.chats.katya.messages.at(-1).from,'them');
  s=acceptInvitation(s,'unityfest');assert.equal(s.chats.katya.messages.length,2);
  s=markRead(s,'katya');assert.equal(unreadTotal(s),0);
  s=guestAttendance(confirmAttendance(s,'unityfest'),'unityfest');
  assert.equal(inviteStatus(s,'katya','unityfest'),'completed');assert.equal(s.chats.katya.messages.at(-1).type,'system');assert.equal(unreadTotal(s),0);
  assert.equal(inviteStatus(cancel(sendChatInvite(reg,'katya','unityfest'),'unityfest'),'katya','unityfest'),'cancelled');
});
test('invitation to another person stays in their own thread and does not touch points logic',()=>{
  let s=sendChatInvite(register(initialState(),'unityfest'),'maxim','unityfest');
  assert.deepEqual(s.invitations,{});assert.equal(inviteStatus(s,'maxim','unityfest'),'proposed');
  assert.equal(chatInvited(s,'katya','unityfest'),false);
  assert.equal(inviteStatus(cancel(s,'unityfest'),'maxim','unityfest'),'cancelled');
});
test('text messages: trimmed, unknown people and empty text ignored; threads newest first; survives serialization',()=>{
  let s=initialState();assert.equal(sendText(s,'katya','   '),s);assert.equal(sendText(s,'nobody','hi'),s);
  s=sendText(sendText(s,'maxim','  привет  '),'alina','hi');
  s=JSON.parse(JSON.stringify(sendText(s,'maxim','ещё')));
  assert.deepEqual(threads(s).map(t=>t.id),['maxim','alina']);assert.equal(s.chats.maxim.messages[0].text,'привет');
  assert.equal(ensureThread(s,'maxim'),s);assert.deepEqual(ensureThread(initialState(),'katya').chats.katya.messages,[]);
});
test('legacy state with an invitation gets a chat invite card; withChats is idempotent',()=>{
  let s=invite(register(initialState(),'unityfest'),'unityfest');delete s.chats;delete s.chatSeq;
  const a=withChats(s);assert.equal(chatInvited(a,'katya','unityfest'),true);assert.deepEqual(withChats(a),a);
});

const M=await import('../dist/model.js');
test('crowd counter: from interests and registrations, differs per event',()=>{
  let s=initialState();s.profile.interests=['Бизнес'];
  const e=id=>events.find(x=>x.id===id),c0=M.crowd(s,e('diwali'));
  assert.equal(c0.going,12);assert.equal(c0.open,5);assert.ok(c0.shared<=c0.going);
  const s1=register(s,'diwali'),c1=M.crowd(s1,e('diwali'));
  assert.equal(c1.going,13);assert.equal(c1.open,6);assert.equal(c1.openOthers,5);
  assert.equal(M.crowd(cancel(s1,'diwali'),e('diwali')).going,12);
  const sets=events.map(x=>M.crowd(s,x).people.slice(0,3).map(p=>p.id).join());
  assert.ok(new Set(sets).size>=10,'participants must vary by event');
  assert.ok(M.crowd(s,e('diwali')).openPeople.some(p=>p.id==='katya'));
});
test('few-open hint and live joiners',()=>{
  const s=register(initialState(),'relations-11'),e=events.find(x=>x.id==='relations-11');
  assert.equal(M.fewOpen(M.crowd(s,e)),true);
  let n=s;for(let i=0;i<3;i++)n=M.addJoiner(n,'relations-11');
  assert.equal(M.fewOpen(M.crowd(n,e)),false);assert.equal(n.notices.length,3);
  assert.equal(M.addJoiner(initialState(),'relations-11').joined,undefined);
});
test('reminder text and plurals',()=>{
  const e={title:'X',time:'18:00'};
  assert.equal(M.reminderText(e,3),'Через час «X», 3 открытых участника идут');
  assert.equal(M.reminderText(e,1),'Через час «X», 1 открытый участник идёт');
  assert.equal(M.reminderText(e,11),'Через час «X», 11 открытых участников идут');
  assert.match(M.reminderText({title:'X',time:''},2),/^Завтра/);
});
test('ics: timed event in MSK, all-day event, alarm, CRLF',()=>{
  const get=id=>events.find(x=>x.id===id);
  const t=M.icsFor(get('relations-10'),3);
  assert.match(t,/DTSTART:20261110T150000Z\r\n/);assert.match(t,/DTEND:20261110T174000Z|DTEND:20261110T173000Z/);
  assert.match(t,/TRIGGER:-PT1H/);assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n')&&t.endsWith('END:VCALENDAR\r\n'));
  const d=M.icsFor(get('social-school'),0);
  assert.match(d,/DTSTART;VALUE=DATE:20261120\r\n/);assert.match(d,/DTEND;VALUE=DATE:20261124\r\n/);
  for(const l of t.split('\r\n'))assert.ok(new TextEncoder().encode(l).length<=75);
  for(const e of events)assert.ok(M.icsFor(e,2).includes('BEGIN:VEVENT'));
});
test('invite link round-trips and rejects unknown events',()=>{const e=events.find(x=>x.id==='diwali');const u=M.inviteUrl('https://x.test/',e,'Анна Б');assert.deepEqual(M.parseInvite(new URL(u).hash),{eventId:'diwali',from:'Анна Б'});assert.equal(M.parseInvite('#invite=nope'),null);assert.equal(M.parseInvite('#home'),null);assert.match(M.shareText(e,{going:0},'Анна'),/Анна приглашает тебя на мероприятие/)});
test('share text',()=>{const e=events.find(x=>x.id==='diwali');assert.match(M.shareText(e,{going:12}),/Уже идут 12/);assert.match(M.shareText(e,{going:0}),/Пока никто/)});
test('leaderboard: sorted by points, top 3 get places 1-3, user placed by own balance',async()=>{
  const {leaderboard}=await import('../dist/model.js');
  let s=initialState();s.profile.name='Анна Смирнова';
  let rows=leaderboard(s);
  assert.deepEqual(rows.slice(0,3).map(r=>r.place),[1,2,3]);
  assert.ok(rows.every((r,i)=>i===0||rows[i-1].points>=r.points));
  assert.equal(rows.filter(r=>r.me).length,1);
  s.history.push({amount:1000});
  rows=leaderboard(s);
  assert.equal(rows[0].me,true);assert.equal(rows[0].place,1);
});
test('google calendar url: timed event in UTC, all-day event, params encoded',()=>{
  const get=id=>events.find(x=>x.id===id);
  const u=new URL(M.googleCalendarUrl(get('relations-10')));
  assert.equal(u.origin+u.pathname,'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'),'TEMPLATE');
  assert.match(u.searchParams.get('dates'),/^20261110T150000Z\/20261110T17[34]0 ?00Z$|^20261110T150000Z\/20261110T1[67]\d{2}00Z$/);
  assert.equal(u.searchParams.get('text'),get('relations-10').title);
  assert.match(new URL(M.googleCalendarUrl(get('social-school'))).searchParams.get('dates'),/^20261120\/20261124$/);
});
