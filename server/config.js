import {readFileSync} from 'node:fs';

// Минимальный разбор .env: KEY=VALUE, комментарии с #, значения можно брать в кавычки.
export function parseEnv(text){
  const out={};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const i=line.indexOf('=');if(i<1)continue;
    let v=line.slice(i+1).trim();
    if(/^(["']).*\1$/.test(v))v=v.slice(1,-1);
    out[line.slice(0,i).trim()]=v;
  }
  return out;
}

export function loadDotEnv(file,env=process.env){
  let text;try{text=readFileSync(file,'utf8')}catch{return}
  for(const [k,v] of Object.entries(parseEnv(text)))if(env[k]===undefined)env[k]=v;
}

// Адреса внешних сервисов вынесены в конфиг, чтобы тесты могли подставить локальные заглушки.
export function loadConfig(env=process.env){
  const port=Number(env.PORT)||8080;
  return {
    host:'127.0.0.1',
    port,
    dataDir:env.DATA_DIR||'.data',
    google:{
      clientId:env.GOOGLE_CLIENT_ID||'',
      clientSecret:env.GOOGLE_CLIENT_SECRET||'',
      redirectUri:env.GOOGLE_REDIRECT_URI||`http://localhost:${port}/api/google/callback`,
      authUrl:env.GOOGLE_AUTH_URL||'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl:env.GOOGLE_TOKEN_URL||'https://oauth2.googleapis.com/token',
      apiUrl:env.GOOGLE_API_URL||'https://www.googleapis.com/calendar/v3',
    },
    apple:{caldavUrl:env.APPLE_CALDAV_URL||'https://caldav.icloud.com'},
  };
}
