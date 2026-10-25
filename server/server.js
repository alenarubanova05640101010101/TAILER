import {createServer as createHttpServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {events} from '../dist/events.js';
import {loadConfig,loadDotEnv} from './config.js';
import {createStore} from './store.js';
import * as google from './google.js';
import * as caldav from './caldav.js';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const DIST=resolve(ROOT,'dist');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','[::1]']);

const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
const redirect=(res,to)=>{res.writeHead(302,{location:to});res.end()};

async function readJson(req){
  let size=0;const chunks=[];
  for await(const c of req){size+=c.length;if(size>65536)throw Object.assign(new Error('Слишком большой запрос'),{status:413});chunks.push(c)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw Object.assign(new Error('Некорректный JSON'),{status:400})}
}

export function createApp(config,store){
  const pendingStates=new Map();   // state -> время создания; защита от подделки OAuth-колбэка (CSRF)
  const byId=new Map(events.map(e=>[e.id,e]));

  const status=()=>({
    backend:true,
    google:{configured:google.googleConfigured(config.google),connected:!!store.get('google')?.refresh_token},
    apple:{connected:!!store.get('apple'),user:store.get('apple')?.user||null,calendar:store.get('apple')?.calendarName||null},
  });

  async function syncOne(target,e){
    if(target==='google'){
      const acc=store.get('google');
      const token=await google.accessToken(config.google,acc,v=>store.set('google',v));
      await google.upsertEvent(config.google,token,e);
    }else await caldav.putEvent(store.get('apple'),e);
  }

  async function sync(body){
    const targets=body.target==='all'?['google','apple']:[body.target];
    if(!targets.every(t=>t==='google'||t==='apple'))throw Object.assign(new Error('Неизвестный календарь'),{status:400});
    if(!Array.isArray(body.eventIds)||body.eventIds.length>100)throw Object.assign(new Error('Нужен список eventIds (до 100)'),{status:400});
    const list=body.eventIds.map(id=>byId.get(id));
    if(list.some(e=>!e))throw Object.assign(new Error('Неизвестное событие'),{status:400});
    const results=[];
    for(const target of targets){
      if(!store.get(target)){results.push({target,ok:false,error:'Календарь не подключён'});continue}
      for(const e of list){
        try{await syncOne(target,e);results.push({target,eventId:e.id,ok:true})}
        catch(err){results.push({target,eventId:e.id,ok:false,error:err.message})}
      }
    }
    return {results};
  }

  async function api(req,res,url){
    const path=url.pathname;
    if(req.method==='GET'&&path==='/api/status')return json(res,200,status());
    if(req.method==='GET'&&path==='/api/google/login'){
      if(!google.googleConfigured(config.google))return json(res,503,{error:'Укажи GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env (см. README)'});
      const state=randomBytes(16).toString('hex');pendingStates.set(state,Date.now());
      for(const [k,t] of pendingStates)if(Date.now()-t>600000)pendingStates.delete(k);
      return redirect(res,google.authUrl(config.google,state));
    }
    if(req.method==='GET'&&path==='/api/google/callback'){
      const state=url.searchParams.get('state'),code=url.searchParams.get('code');
      if(!state||!pendingStates.delete(state)||!code)return redirect(res,'/?calendar=error#profile');
      try{store.set('google',await google.exchangeCode(config.google,code));return redirect(res,'/?calendar=google#profile')}
      catch{return redirect(res,'/?calendar=error#profile')}
    }
    if(req.method!=='POST')return json(res,404,{error:'Не найдено'});
    // Состояние меняют только запросы со своим заголовком: кросс-доменная форма его добавить не может.
    if(req.headers['x-tyler']!=='1'||!/^application\/json/.test(req.headers['content-type']||''))return json(res,403,{error:'Запрос отклонён'});
    const body=await readJson(req);
    if(path==='/api/apple/connect'){
      const user=String(body.user||'').trim(),password=String(body.password||'').replace(/\s/g,'');
      if(!user||!password)return json(res,400,{error:'Укажи Apple ID и пароль приложения'});
      const found=await caldav.discover(config.apple,user,password);
      store.set('apple',{user,password,calendarUrl:found.calendarUrl,calendarName:found.calendarName});
      return json(res,200,status());
    }
    if(path==='/api/google/disconnect'||path==='/api/apple/disconnect'){store.remove(path.split('/')[2]);return json(res,200,status())}
    if(path==='/api/sync')return json(res,200,await sync(body));
    return json(res,404,{error:'Не найдено'});
  }

  async function serveStatic(req,res,url){
    let rel=decodeURIComponent(url.pathname);if(rel.endsWith('/'))rel+='index.html';
    const file=resolve(DIST,'.'+normalize(rel));
    if(file!==DIST&&!file.startsWith(DIST+sep))return json(res,403,{error:'Запрещено'});
    try{const data=await readFile(file);res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream'});res.end(data)}
    catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Не найдено')}
  }

  return createHttpServer(async(req,res)=>{
    try{
      // Защита от DNS rebinding: обслуживаем только запросы на локальный адрес.
      const host=(req.headers.host||'').replace(/:\d+$/,'');
      if(!LOCAL_HOSTS.has(host))return json(res,403,{error:'Запрещено'});
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/'))return await api(req,res,url);
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
      return await serveStatic(req,res,url);
    }catch(err){json(res,err.status||500,{error:err.message||'Ошибка сервера'})}
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  loadDotEnv(join(ROOT,'.env'));
  const config=loadConfig();
  const app=createApp(config,createStore(resolve(ROOT,config.dataDir)));
  app.listen(config.port,config.host,()=>console.log(`Тайлер: http://localhost:${config.port}`));
}
