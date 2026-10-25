import {createHash} from 'node:crypto';

const SCOPE='https://www.googleapis.com/auth/calendar.events';
const TZ='Europe/Moscow';

export const googleConfigured=cfg=>!!(cfg.clientId&&cfg.clientSecret);

export function authUrl(cfg,state){
  const p=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state});
  return `${cfg.authUrl}?${p}`;
}

async function tokenRequest(cfg,params){
  const res=await fetch(cfg.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,...params})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`Google отклонил вход: ${body.error_description||body.error||res.status}`);
  return body;
}

export async function exchangeCode(cfg,code){
  const t=await tokenRequest(cfg,{grant_type:'authorization_code',code,redirect_uri:cfg.redirectUri});
  return {refresh_token:t.refresh_token,access_token:t.access_token,expires_at:Date.now()+(t.expires_in||3600)*1000};
}

// Возвращает действующий access_token, при необходимости обновляя его по refresh_token.
export async function accessToken(cfg,account,save){
  if(account.access_token&&account.expires_at>Date.now()+60000)return account.access_token;
  if(!account.refresh_token)throw new Error('Нет refresh_token: подключи Google заново');
  const t=await tokenRequest(cfg,{grant_type:'refresh_token',refresh_token:account.refresh_token});
  save({...account,access_token:t.access_token,expires_at:Date.now()+(t.expires_in||3600)*1000});
  return t.access_token;
}

const pad=n=>String(n).padStart(2,'0');
const isoDate=ms=>new Date(ms).toISOString().slice(0,10);
const endOf=(e)=>{
  const m=/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(e.duration||'');
  if(m)return Math.max(30,(+m[3]*60+ +m[4])-(+m[1]*60+ +m[2]));
  const h=/(\d+(?:[,.]\d+)?)\s*час/.exec(e.duration||'');
  return h?Math.round(parseFloat(h[1].replace(',','.'))*60):120;
};

// Id события в Google: только [a-v0-9], 5–1024 символов. Хеш от id события делает повторную синхронизацию идемпотентной.
export const googleEventId=id=>'evt'+createHash('sha1').update(id).digest('hex');

export function googleEvent(e){
  const base={
    id:googleEventId(e.id),
    summary:e.title,
    location:e.location||undefined,
    description:`${e.club}. ${e.desc}${e.source?`\nИсточник: ${e.source}`:''}`,
    source:e.source?{title:'Источник',url:e.source}:undefined,
  };
  if(e.time){
    const [h,m]=e.time.split(':').map(Number),start=Date.UTC(2026,10,e.day,h-3,m);
    const local=ms=>{const d=new Date(ms+3*3600000);return `${isoDate(ms+3*3600000)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+03:00`};
    return {...base,start:{dateTime:local(start),timeZone:TZ},end:{dateTime:local(start+endOf(e)*60000),timeZone:TZ},reminders:{useDefault:false,overrides:[{method:'popup',minutes:60}]}};
  }
  return {...base,start:{date:isoDate(Date.UTC(2026,10,e.day))},end:{date:isoDate(Date.UTC(2026,10,e.endDay+1))},reminders:{useDefault:false,overrides:[{method:'popup',minutes:1440}]}};
}

// Создаёт событие в основном календаре; если оно уже есть (409) — обновляет.
export async function upsertEvent(cfg,token,e){
  const body=googleEvent(e),headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const url=`${cfg.apiUrl}/calendars/primary/events`;
  let res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
  if(res.status===409)res=await fetch(`${url}/${body.id}`,{method:'PUT',headers,body:JSON.stringify(body)});
  if(!res.ok){const b=await res.json().catch(()=>({}));throw new Error(b.error?.message||`Google Calendar: ${res.status}`)}
}
