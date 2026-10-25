// Клиент локального сервера синхронизации (server/server.js). Без сервера (npm run start:static) status() вернёт null,
// и приложение остаётся на кнопках «ссылка в Google» / «скачать .ics».
async function call(path,data){
  const res=await fetch(path,data===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-tyler':'1'},body:JSON.stringify(data)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body.error||`Ошибка ${res.status}`);
  return body;
}
export const status=()=>call('/api/status').catch(()=>null);
export const connectApple=(user,password)=>call('/api/apple/connect',{user,password});
export const disconnect=target=>call(`/api/${target}/disconnect`,{});
export const sync=(target,eventIds)=>call('/api/sync',{target,eventIds});
export const googleLoginUrl='/api/google/login';

// Короткая сводка результата для уведомления.
export function summarize(results){
  const ok=results.filter(r=>r.ok).length,bad=results.filter(r=>!r.ok);
  return bad.length?`Добавлено: ${ok}. Не удалось: ${bad.length} — ${bad[0].error}`:`Добавлено в календарь: ${ok}`;
}
