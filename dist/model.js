export const DEMO_NOW = '2026-10-25T12:00:00+03:00';
import {events,spheres,interests,dateLabel,timeLabel,onDay} from './events.js';
export {events,spheres,interests,dateLabel,timeLabel,onDay};
export function initialState(){return {version:1,profile:{name:'',firstName:'',lastName:'',group:'',program:'',registered:false,interests:[],contact:'',contactVisible:false,open:true},saved:[],registrations:{},offer:{eventId:'diwali',status:'available',amount:100},history:[],invitations:{},chats:{},chatSeq:0,notificationsRead:false}}
export const balance=s=>s.history.reduce((sum,x)=>sum+x.amount,0);
export const attended=(s,id)=>s.history.some(x=>x.key===`attendance:${id}`);
export function reward(s,id){return s.offer.eventId===id&&s.offer.status==='accepted'?s.offer.amount:50}
export function register(s,id){if(attended(s,id))return s;const n=structuredClone(s);n.registrations[id]={open:n.profile.open};return n}
export function cancel(s,id){if(attended(s,id))return s;const n=structuredClone(s);delete n.registrations[id];if(n.offer.eventId===id&&n.offer.status==='accepted')n.offer.status='cancelled';delete n.invitations[id];return n}
export function acceptOffer(s){if(s.offer.status!=='available'||balance(s)>=100)return s;const n=register(s,s.offer.eventId);n.offer.status='accepted';return n}
export function confirmAttendance(s,id){if(!s.registrations[id]||attended(s,id))return s;const n=structuredClone(s);n.history.push({key:`attendance:${id}`,eventId:id,amount:reward(s,id),label:events.find(e=>e.id===id).title,date:DEMO_NOW});settleReferral(n,id);return n}
function settleReferral(s,id){const inv=s.invitations[id];if(inv?.status==='accepted'&&inv.guestAttended&&attended(s,id)&&!s.history.some(x=>x.key===`referral:${id}`)){s.history.push({key:`referral:${id}`,eventId:id,amount:30,label:'Приглашение · Катя Морозова',date:DEMO_NOW});inv.status='completed';push(s,'katya',{from:'system',type:'system',text:`Вы вместе сходили на «${events.find(e=>e.id===id).title}». +30 баллов за приглашение.`},DEMO_NOW)}}
export function invite(s,id){if(!s.registrations[id]||s.invitations[id])return s;const n=structuredClone(s);n.invitations[id]={status:'proposed',guestAttended:false};return n}
export function acceptInvitation(s,id){const n=structuredClone(s);if(n.invitations[id]?.status==='proposed'){n.invitations[id].status='accepted';push(n,'katya',{from:'them',type:'text',text:'Да, пойдём! Давай встретимся у входа за 10 минут до начала.'},DEMO_NOW)}return n}
export function guestAttendance(s,id){const n=structuredClone(s);if(n.invitations[id]?.status==='accepted'){n.invitations[id].guestAttended=true;settleReferral(n,id)}return n}
export function recommended(s){return [...events].sort((a,b)=>{const score=e=>e.interests.filter(x=>s.profile.interests.includes(x)).length;return score(b)-score(a)||a.day-b.day||a.time.localeCompare(b.time)})}

export function profileFields(values){
  const limits={firstName:60,lastName:60,group:40,program:100};
  const fields={};
  for(const [key,max] of Object.entries(limits)){
    const value=typeof values?.[key]==='string'?values[key].trim():'';
    if(!value||value.length>max)throw new Error('Заполни все четыре поля: имя, фамилию, группу и направление.');
    fields[key]=value;
  }
  return {...fields,name:`${fields.firstName} ${fields.lastName}`,registered:true};
}
export function identityValid(s){
  if(s?.profile?.registered!==true)return false;
  try{profileFields(s.profile);return true}catch{return false}
}
export function contactFields(values){
  let contact=typeof values?.contact==='string'?values.contact.trim():'';
  let phone=typeof values?.phone==='string'?values.phone.trim():'';
  if(contact){
    if(/^[a-z][a-z0-9+.-]*:/i.test(contact)&&!/^https:\/\//i.test(contact))throw new Error('Ссылка должна начинаться с https:// или быть @username.');
    if(!contact.startsWith('@')&&!/^https:\/\//i.test(contact)){
      if(!/^[^\s/]+\.[^\s/]+\/\S*$/.test(contact))throw new Error('Контакт: @username или ссылка, например t.me/username.');
      contact='https://'+contact;
    }
    if(contact.startsWith('@')?!/^@[A-Za-z0-9_]{3,32}$/.test(contact):/\s/.test(contact))throw new Error('Контакт: @username или ссылка без пробелов.');
    if(contact.length>120)throw new Error('Контакт слишком длинный: не больше 120 символов.');
  }
  if(phone){
    const digits=phone.replace(/\D/g,'');
    if(!/^\+?[0-9][0-9\s().-]*$/.test(phone)||digits.length<10||digits.length>15)throw new Error('Телефон: от 10 до 15 цифр, например +7 900 123-45-67.');
  }
  return {contact,phone};
}
export function interestFields(values){
  const list=[...new Set(Array.isArray(values?.interests)?values.interests:[])].filter(x=>interests.includes(x));
  if(!list.length)throw new Error('Выбери хотя бы один интерес — по ним мы подберём события.');
  return {interests:list,...contactFields(values)};
}
export function hasProfile(s){
  if(!identityValid(s))return false;
  return Array.isArray(s.profile.interests)&&s.profile.interests.some(x=>interests.includes(x));
}
export function completeRegistration(s,values){
  const n=structuredClone(s);
  n.profile={...n.profile,...profileFields(values)};
  return n;
}
export function completeInterests(s,values){
  const n=structuredClone(s);
  const f=interestFields(values);
  n.profile={...n.profile,...f};
  if(!f.contact&&!f.phone)n.profile.contactVisible=false;
  return n;
}

const I={sport:'Спорт',vol:'Волонтёрские организации',biz:'Бизнес',start:'Стартапы',intl:'Интернациональная Вышка',nat:'Национальные клубы',cine:'Киноклубы',humor:'Юмористические клубы',music:'Музыкальные клубы',art:'Творческие клубы',fun:'Развлекательные клубы',talk:'Разговорные клубы',media:'Медиаклубы',lang:'Языковые клубы'};
const P=(id,name,program,...keys)=>({id,name,initials:name.split(' ').map(w=>w[0]).join(''),program,interests:keys.map(k=>I[k])});
// Все участники вымышлены. Первые три — постоянные собеседники из чатов.
export const people=[
  {...P('katya','Катя Морозова','2 курс · Коммуникационный дизайн','nat','music'),guest:true},
  P('maxim','Максим Ким','3 курс · Программная инженерия','biz','cine'),
  P('alina','Алина Лебедева','1 курс · Медиакоммуникации','music','art','intl'),
  P('dasha','Даша Соколова','1 курс · Экономика','sport','biz'),
  P('timur','Тимур Алиев','2 курс · Менеджмент','start','biz','fun'),
  P('sofia','София Белова','1 курс · Востоковедение','lang','intl','nat'),
  P('ilya','Илья Назаров','3 курс · Бизнес-информатика','start','biz'),
  P('mila','Мила Орлова','1 курс · Дизайн','art','media','cine'),
  P('arman','Арман Саркисян','2 курс · Международные отношения','intl','nat','talk'),
  P('vika','Вика Громова','2 курс · Социология','vol','talk'),
  P('egor','Егор Тихонов','4 курс · Прикладная математика','start','fun','humor'),
  P('lera','Лера Фомина','1 курс · Филология','lang','talk','media'),
  P('nikita','Никита Зайцев','2 курс · Юриспруденция','sport','humor','fun'),
  P('anya','Аня Крылова','3 курс · Журналистика','media','cine','art'),
  P('kamil','Камиль Ибрагимов','1 курс · Экономика','biz','sport'),
  P('polina','Полина Ефимова','2 курс · Психология','vol','talk','art'),
  P('gleb','Глеб Рябов','3 курс · Информатика','fun','start','music'),
  P('yuki','Юки Танака','2 курс · Востоковедение','intl','lang','nat'),
  P('masha','Маша Беляева','4 курс · Социология','vol','intl'),
  P('roma','Рома Киселёв','1 курс · Менеджмент','humor','fun','sport'),
  P('zhenya','Женя Павлова','2 курс · Медиакоммуникации','media','humor','art'),
  P('david','Давид Григорян','3 курс · Экономика','biz','talk','nat'),
  P('katyap','Катя Петрова','1 курс · Дизайн','art','music','cine'),
  P('stas','Стас Волков','2 курс · Программная инженерия','start','sport'),
  P('olya','Оля Миронова','3 курс · Лингвистика','lang','talk','intl'),
  P('ivan','Иван Мельников','1 курс · Бизнес-информатика','fun','biz','start'),
  P('amina','Амина Хасанова','2 курс · Международные отношения','nat','vol','intl'),
  P('semen','Семён Лебедев','4 курс · Менеджмент','biz','sport','humor'),
  P('nastya','Настя Герасимова','1 курс · Журналистика','media','music','lang'),
  P('pavel','Павел Дроздов','3 курс · Кинематограф','cine','art','media')
];
export const person=id=>people.find(p=>p.id===id);
function push(n,pid,m,ts){n.chats??={};const t=n.chats[pid]??={messages:[],unread:0,seq:0};n.chatSeq=(n.chatSeq??0)+1;t.seq=n.chatSeq;t.messages.push({id:n.chatSeq,ts,...m});if(m.from==='them')t.unread++}
export function withChats(s){
  const n=structuredClone(s);n.chats??={};n.chatSeq??=0;
  for(const eventId of Object.keys(n.invitations??{}))if(!n.chats.katya?.messages.some(m=>m.type==='invite'&&m.eventId===eventId))push(n,'katya',{from:'me',type:'invite',eventId},DEMO_NOW);
  return n;
}
export function ensureThread(s,pid){
  if(!person(pid)||s.chats?.[pid])return s;
  const n=structuredClone(s);n.chats??={};n.chatSeq=(n.chatSeq??0)+1;n.chats[pid]={messages:[],unread:0,seq:n.chatSeq};return n;
}
export function sendText(s,pid,text,ts=DEMO_NOW){
  text=String(text??'').trim().slice(0,1000);
  if(!text||!person(pid))return s;
  const n=structuredClone(s);push(n,pid,{from:'me',type:'text',text},ts);return n;
}
export const chatInvited=(s,pid,eventId)=>!!s.chats?.[pid]?.messages.some(m=>m.type==='invite'&&m.eventId===eventId);
export function sendChatInvite(s,pid,eventId,ts=DEMO_NOW){
  const p=person(pid);
  if(!p||!s.registrations[eventId]||chatInvited(s,pid,eventId))return s;
  if(p.guest&&s.invitations[eventId])return s;
  const n=p.guest?invite(s,eventId):structuredClone(s);
  push(n,pid,{from:'me',type:'invite',eventId},ts);return n;
}
export function inviteStatus(s,pid,eventId){
  if(!s.registrations[eventId])return 'cancelled';
  return person(pid)?.guest?(s.invitations[eventId]?.status??'cancelled'):'proposed';
}
export function markRead(s,pid){
  if(!s.chats?.[pid]?.unread)return s;
  const n=structuredClone(s);n.chats[pid].unread=0;return n;
}
export const unreadTotal=s=>Object.values(s.chats??{}).reduce((sum,t)=>sum+(t.unread||0),0);
export const threads=s=>Object.entries(s.chats??{}).filter(([id])=>person(id)).map(([id,t])=>({id,person:person(id),...t})).sort((a,b)=>b.seq-a.seq);

// Демо-толпа: сколько вымышленных участников идут на событие и сколько из них открыты к знакомству.
const CROWD={sergiev:[14,6],ecocase:[9,2],'oil-owl':[7,3],unityfest:[16,7],nasledie:[11,4],diwali:[12,5],nightcode:[10,4],'far-east':[6,1],'relations-10':[5,2],'ya-prof':[8,2],'relations-11':[4,0],symposium:[13,5],kinobb:[7,3],'relations-14':[3,1],'relations-18':[6,3],'social-school':[9,3],boardgames:[15,8],'relations-21':[2,1]};
const hash=str=>{let h=2166136261;for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const overlap=(p,list)=>p.interests.filter(i=>list.includes(i)).length;
// Порядок «кто присоединится первым» для события: сначала совпадающие по интересам, внутри — по хешу id, чтобы у каждого события состав был свой.
function ranked(e){
  const r=[...people].sort((a,b)=>overlap(b,e.interests)-overlap(a,e.interests)||hash(e.id+a.id)-hash(e.id+b.id));
  if(e.id==='diwali'){const i=r.findIndex(p=>p.id==='katya');r.unshift(...r.splice(i,1))}
  return r;
}
export function crowd(s,e){
  const [n,k]=CROWD[e.id]??[0,0],extra=s.joined?.[e.id]??0;
  const order=ranked(e),base=order.slice(0,n),rest=order.slice(n,n+extra);
  const forced=e.id==='diwali'?['katya']:[];
  const openIds=new Set([...new Set([...forced,...[...base].sort((a,b)=>hash('o'+e.id+a.id)-hash('o'+e.id+b.id)).map(p=>p.id)])].slice(0,Math.max(k,forced.length)));
  const others=[...base.map(p=>({...p,open:openIds.has(p.id)})),...rest.map(p=>({...p,open:true}))];
  const reg=s.registrations?.[e.id];
  const mine=s.profile?.interests??[];
  const openPeople=others.filter(p=>p.open);
  return {
    going:others.length+(reg?1:0),
    open:openPeople.length+(reg?.open?1:0),
    shared:others.filter(p=>overlap(p,mine)>0).length,
    openOthers:openPeople.length,
    people:others,openPeople
  };
}
export const fewOpen=c=>c.openOthers<3;
export function addJoiner(s,id){
  const e=events.find(x=>x.id===id);
  if(!e||!s.registrations[id]||!canAddJoiner(s,id))return s;
  const n=structuredClone(s);n.joined??={};n.joined[id]=(n.joined[id]??0)+1;
  const p=ranked(e)[(CROWD[id]?.[0]??0)+n.joined[id]-1];
  n.notices??=[];n.notices.push({eventId:id,text:`У «${e.title}» новый открытый участник: ${p.name}.`,date:DEMO_NOW});
  n.notificationsRead=false;return n;
}
export const canAddJoiner=(s,id)=>(CROWD[id]?.[0]??0)+(s.joined?.[id]??0)<people.length;

const plural=(n,a,b,c)=>{const m=n%100,d=n%10;return m>10&&m<20?c:d===1?a:d>=2&&d<=4?b:c};
export const openWord=n=>`${n} ${plural(n,'открытый участник','открытых участника','открытых участников')}`;
export const reminderText=(e,n)=>`${e.time?'Через час':'Завтра'} «${e.title}», ${openWord(n)} ${plural(n,'идёт','идут','идут')}`;
export function shareText(e,c){
  const when=`${dateLabel(e)}${e.time?', '+e.time:''}`;
  return `Пойдём вместе на «${e.title}» — ${when}, ${e.place}. ${c.going?`Уже идут ${c.going}.`:'Пока никто не записался — будем первыми.'}`;
}

// .ics: событие с временем — по Москве (UTC+3, без перехода на летнее время), без времени — на весь день.
const pad=n=>String(n).padStart(2,'0');
const stamp=ms=>{const d=new Date(ms);return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`};
const dateOnly=(day)=>`202611${pad(day)}`;
const esc=t=>String(t).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
function fold(line){
  const out=[];let cur='',bytes=0;
  for(const ch of line){const b=new TextEncoder().encode(ch).length;if(bytes+b>73){out.push(cur);cur=' '+ch;bytes=1+b}else{cur+=ch;bytes+=b}}
  out.push(cur);return out.join('\r\n');
}
function durationMinutes(e){
  const range=/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(e.duration||'');
  if(range)return Math.max(30,(+range[3]*60+ +range[4])-(+range[1]*60+ +range[2]));
  const h=/(\d+(?:[,.]\d+)?)\s*час/.exec(e.duration||'');
  return h?Math.round(parseFloat(h[1].replace(',','.'))*60):120;
}
export function icsFor(e,openCount=0){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Тайлер//Календарь событий//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${e.id}-2026@tyler.demo`,`DTSTAMP:${stamp(Date.parse(DEMO_NOW))}`];
  if(e.time){
    const [h,m]=e.time.split(':').map(Number),start=Date.UTC(2026,10,e.day,h-3,m);
    lines.push(`DTSTART:${stamp(start)}`,`DTEND:${stamp(start+durationMinutes(e)*60000)}`);
  }else lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.day)}`,`DTEND;VALUE=DATE:${stamp(Date.UTC(2026,10,e.endDay+1)).slice(0,8)}`);
  lines.push(`SUMMARY:${esc(e.title)}`,`LOCATION:${esc(e.location)}`,`DESCRIPTION:${esc(`${e.club}. ${e.desc}\nИсточник: ${e.source}`)}`,`URL:${e.source}`,
    'BEGIN:VALARM',e.time?'TRIGGER:-PT1H':'TRIGGER:-P1D','ACTION:DISPLAY',`DESCRIPTION:${esc(reminderText(e,openCount))}`,'END:VALARM','END:VEVENT','END:VCALENDAR');
  return lines.map(fold).join('\r\n')+'\r\n';
}
