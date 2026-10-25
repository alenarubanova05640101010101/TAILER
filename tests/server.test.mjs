import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/server.js';
import {createStore} from '../server/store.js';
import {parseEnv,loadConfig} from '../server/config.js';
import {parseCalendars} from '../server/caldav.js';
import {googleEvent,googleEventId} from '../server/google.js';
import {events} from '../dist/events.js';

const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));
const body=req=>new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>r(d))});
const PASS='abcdabcdabcdabcd';

// Заглушка Google (OAuth + Calendar API) и iCloud (CalDAV) в одном процессе.
function fakeProviders(){
  const log=[];
  const srv=http.createServer(async(req,res)=>{
    const b=await body(req);log.push({method:req.method,url:req.url,body:b});
    const js=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o))};
    if(req.url==='/token')return js({access_token:'AT',refresh_token:'RT',expires_in:3600});
    if(req.url==='/api/calendars/primary/events'&&req.method==='POST'){
      if(log.filter(l=>l.method==='POST'&&l.url===req.url).length>1){res.statusCode=409;return res.end('{}')}
      return js({id:JSON.parse(b).id});
    }
    if(req.url.startsWith('/api/calendars/primary/events/')&&req.method==='PUT')return js({});
    if(req.method==='PROPFIND'){
      if(req.headers.authorization!=='Basic '+Buffer.from('me@icloud.com:'+PASS).toString('base64')){res.statusCode=401;return res.end()}
      res.statusCode=207;
      if(req.url==='/')return res.end('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>');
      if(req.url==='/123/principal/')return res.end('<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:propstat><D:prop><C:calendar-home-set><D:href>/123/calendars/</D:href></C:calendar-home-set></D:prop></D:propstat></D:response></D:multistatus>');
      return res.end('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/inbox/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop><d:displayname>Дом</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response></d:multistatus>');
    }
    if(req.method==='PUT'&&req.url.startsWith('/123/calendars/home/')){res.statusCode=201;return res.end()}
    res.statusCode=404;res.end();
  });
  return {srv,log};
}

async function setup(){
  const prov=fakeProviders(),pp=await listen(prov.srv),origin=`http://127.0.0.1:${pp}`;
  const config=loadConfig({PORT:'0',GOOGLE_CLIENT_ID:'cid',GOOGLE_CLIENT_SECRET:'sec',GOOGLE_AUTH_URL:origin+'/auth',GOOGLE_TOKEN_URL:origin+'/token',GOOGLE_API_URL:origin+'/api',APPLE_CALDAV_URL:origin});
  const store=createStore(mkdtempSync(join(tmpdir(),'tyler-')));
  const app=createApp(config,store),port=await listen(app);
  const call=(path,{method='GET',data,headers={}}={})=>new Promise((resolve,reject)=>{
    const h={...(data?{'content-type':'application/json','x-tyler':'1'}:{}),...headers};
    const r=http.request({host:'127.0.0.1',port,path,method,headers:h},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,json:()=>JSON.parse(d),text:d}))});
    r.on('error',reject);if(data)r.write(JSON.stringify(data));r.end();
  });
  return {prov,call,store,close:()=>{app.close();prov.srv.close()}};
}

test('env parser and config defaults',()=>{
  assert.deepEqual(parseEnv('# c\nA=1\nB="x y"\n\nC = z'),{A:'1',B:'x y',C:'z'});
  const c=loadConfig({});assert.equal(c.port,8080);assert.equal(c.google.redirectUri,'http://localhost:8080/api/google/callback');assert.equal(c.host,'127.0.0.1');
});

test('google event: MSK time zone, all-day end is exclusive, stable id',()=>{
  const get=id=>events.find(e=>e.id===id);
  const g=googleEvent(get('relations-10'));
  assert.equal(g.start.dateTime,'2026-11-10T18:00:00+03:00');assert.equal(g.start.timeZone,'Europe/Moscow');
  const d=googleEvent(get('social-school'));
  assert.deepEqual([d.start.date,d.end.date],['2026-11-20','2026-11-24']);
  assert.match(googleEventId('x'),/^[a-v0-9]{5,}$/);assert.equal(googleEventId('x'),googleEventId('x'));
});

test('caldav: only calendars that hold VEVENT',()=>{
  const xml='<d:multistatus xmlns:d="DAV:" xmlns:c="x"><d:response><d:href>/a/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response></d:multistatus>';
  assert.deepEqual(parseCalendars(xml,'http://h/'),[]);
});

test('store keeps secrets in a 0600 file',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tyler-'));const s=createStore(dir);s.set('apple',{password:'p'});
  assert.equal(statSync(join(dir,'accounts.json')).mode&0o777,0o600);assert.equal(createStore(dir).get('apple').password,'p');
});

test('api: guards against foreign host, cross-site posts and path traversal',async()=>{
  const {call,close}=await setup();
  try{
    assert.equal((await call('/api/status',{headers:{host:'evil.example'}})).status,403);
    assert.equal((await call('/api/sync',{method:'POST',headers:{'content-type':'text/plain'}})).status,403);
    assert.notEqual((await call('/%2e%2e/package.json')).status,200);
    assert.equal((await call('/')).status,200);
  }finally{close()}
});

test('google: login redirect, state check, token exchange, idempotent sync',async()=>{
  const {call,store,prov,close}=await setup();
  try{
    assert.equal((await call('/api/status')).json().google.connected,false);
    const login=await call('/api/google/login');assert.equal(login.status,302);
    const loc=new URL(login.headers.location);const state=loc.searchParams.get('state');
    assert.equal(loc.searchParams.get('client_id'),'cid');assert.match(loc.searchParams.get('scope'),/calendar\.events/);
    assert.match((await call('/api/google/callback?code=c&state=bad')).headers.location,/calendar=error/);
    assert.match((await call(`/api/google/callback?code=c&state=${state}`)).headers.location,/calendar=google/);
    assert.equal(store.get('google').refresh_token,'RT');
    const sync=()=>call('/api/sync',{method:'POST',data:{target:'google',eventIds:['relations-10']}}).then(r=>r.json());
    assert.deepEqual((await sync()).results.map(r=>r.ok),[true]);
    assert.deepEqual((await sync()).results.map(r=>r.ok),[true]);
    assert.ok(prov.log.some(l=>l.method==='PUT'&&l.url.startsWith('/api/calendars/primary/events/evt')));
    assert.equal((await call('/api/sync',{method:'POST',data:{target:'google',eventIds:['nope']}})).status,400);
    assert.ok(!(await call('/api/status')).text.includes('RT'));
  }finally{close()}
});

test('apple: wrong password rejected, connect discovers calendar, sync PUTs ics without METHOD, disconnect',async()=>{
  const {call,store,prov,close}=await setup();
  try{
    assert.equal((await call('/api/apple/connect',{method:'POST',data:{user:'me@icloud.com',password:'wrong'}})).status,500);
    assert.equal(store.get('apple'),null);
    const r=await call('/api/apple/connect',{method:'POST',data:{user:'me@icloud.com',password:'abcd abcd abcd abcd'}});
    const st=r.json();assert.deepEqual([st.apple.connected,st.apple.calendar],[true,'Дом']);assert.ok(!r.text.includes('abcd'));
    const s=(await call('/api/sync',{method:'POST',data:{target:'apple',eventIds:['relations-10','social-school']}})).json();
    assert.deepEqual(s.results.map(x=>x.ok),[true,true]);
    const put=prov.log.find(l=>l.method==='PUT');
    assert.match(put.url,/^\/123\/calendars\/home\/relations-10-2026\.ics$/);
    assert.ok(put.body.includes('BEGIN:VEVENT')&&!put.body.includes('METHOD:'));
    await call('/api/apple/disconnect',{method:'POST',data:{}});assert.equal(store.get('apple'),null);
    const none=(await call('/api/sync',{method:'POST',data:{target:'all',eventIds:['relations-10']}})).json();
    assert.ok(none.results.every(x=>!x.ok));
  }finally{close()}
});
