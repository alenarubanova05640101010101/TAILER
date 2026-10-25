import {icsFor} from '../dist/model.js';

// CalDAV для Apple Calendar (iCloud). Нужен Apple ID и пароль приложения (appleid.apple.com → Вход и безопасность).
const basic=(user,password)=>'Basic '+Buffer.from(`${user}:${password}`).toString('base64');
const tag=(name)=>new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,'i');
const hrefIn=(xml,name)=>{const block=tag(name).exec(xml);const h=block&&tag('href').exec(block[1]);return h?h[1].trim():null};

async function propfind(url,auth,depth,props){
  const body=`<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`;
  const res=await fetch(url,{method:'PROPFIND',headers:{authorization:auth,depth:String(depth),'content-type':'application/xml; charset=utf-8'},body});
  if(res.status===401)throw new Error('Apple не принял логин или пароль приложения');
  if(res.status!==207)throw new Error(`CalDAV ответил ${res.status}`);
  return res.text();
}

// Разбор ответа PROPFIND Depth:1 — календари, которые умеют хранить VEVENT.
export function parseCalendars(xml,base){
  const out=[];
  for(const part of xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1)){
    const href=tag('href').exec(part)?.[1]?.trim();
    if(!href||!/<(?:[\w-]+:)?calendar\s*\/>/i.test(tag('resourcetype').exec(part)?.[1]||''))continue;
    const comps=tag('supported-calendar-component-set').exec(part)?.[1];
    if(comps&&!/name="VEVENT"/i.test(comps))continue;
    out.push({url:new URL(href,base).href,name:(tag('displayname').exec(part)?.[1]||'').trim()});
  }
  return out;
}

export async function discover(cfg,user,password){
  const auth=basic(user,password);
  const root=cfg.caldavUrl.replace(/\/$/,'')+'/';
  const principal=hrefIn(await propfind(root,auth,0,'<d:current-user-principal/>'),'current-user-principal');
  if(!principal)throw new Error('CalDAV не вернул профиль пользователя');
  const principalUrl=new URL(principal,root).href;
  const home=hrefIn(await propfind(principalUrl,auth,0,'<c:calendar-home-set/>'),'calendar-home-set');
  if(!home)throw new Error('CalDAV не вернул список календарей');
  const homeUrl=new URL(home,principalUrl).href;
  const calendars=parseCalendars(await propfind(homeUrl,auth,1,'<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/>'),homeUrl);
  if(!calendars.length)throw new Error('В iCloud не найдено календарей для событий');
  return {calendarUrl:calendars[0].url,calendarName:calendars[0].name,calendars};
}

// CalDAV не принимает iTIP-свойство METHOD внутри объекта календаря (RFC 4791, 4.1).
const forCaldav=ics=>ics.replace(/^METHOD:.*\r\n/m,'');

export async function putEvent(account,e){
  const url=new URL(`${encodeURIComponent(e.id)}-2026.ics`,account.calendarUrl.replace(/\/?$/,'/')).href;
  const res=await fetch(url,{method:'PUT',headers:{authorization:basic(account.user,account.password),'content-type':'text/calendar; charset=utf-8'},body:forCaldav(icsFor(e,0))});
  if(res.status===401)throw new Error('Apple не принял логин или пароль приложения');
  if(![200,201,204].includes(res.status))throw new Error(`CalDAV ответил ${res.status}`);
}
