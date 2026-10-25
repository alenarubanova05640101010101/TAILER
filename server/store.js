import {mkdirSync,readFileSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {join} from 'node:path';

// Токены Google и пароль приложения Apple лежат в одном JSON-файле с правами 0600.
// Файл живёт в .data/ (он в .gitignore) и не отдаётся браузеру: наружу уходят только флаги подключения.
export function createStore(dir){
  const file=join(dir,'accounts.json');
  let data={};
  try{data=JSON.parse(readFileSync(file,'utf8'))}catch{}
  const persist=()=>{
    mkdirSync(dir,{recursive:true,mode:0o700});
    const tmp=file+'.tmp';
    writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});
    renameSync(tmp,file);chmodSync(file,0o600);
  };
  return {
    get:key=>data[key]||null,
    set(key,value){data[key]=value;persist()},
    remove(key){delete data[key];persist()},
  };
}
