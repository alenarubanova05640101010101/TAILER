# Скачивает фото из исходных Telegram-постов событий в dist/img/ и пишет dist/images.js.
# Нет фото у поста — события нет в images.js, и приложение оставляет старую обложку.
import re,json,os,subprocess
S=os.path.dirname(os.path.abspath(__file__));D=os.path.join(S,'..','dist')
def sh(*a):return subprocess.run(a,capture_output=True)
evs=json.loads(sh('node','--input-type=module','-e',f"import {{events}} from '{D}/events.js';console.log(JSON.stringify(events.map(e=>({{id:e.id,source:e.source}}))))").stdout)
os.makedirs(f'{D}/img',exist_ok=True)
out={}
for e in evs:
    m=re.match(r'https://t\.me/([^/]+)/(\d+)',e.get('source') or '')
    if not m:print(e['id'],'нет source');continue
    h=sh('curl','-s','-m','20',f'https://t.me/{m[1]}/{m[2]}?embed=1&mode=tme').stdout.decode('utf8','ignore')
    p=re.search(r'tgme_widget_message_photo_wrap[^>]*background-image:url\(\'(https://[^\']+)\'\)',h)
    if not p:print(e['id'],'нет фото');continue
    f=f"img/{e['id']}.jpg"
    r=sh('curl','-s','-m','30','-o',f'{D}/{f}','-w','%{http_code}',p[1])
    if r.stdout!=b'200' or os.path.getsize(f'{D}/{f}')<2000:print(e['id'],'не скачалось');continue
    out[e['id']]=f;print(e['id'],'ok')
open(f'{D}/images.js','w').write('// Фото из исходных постов Telegram (tools/fetch_images.py).\nexport const images='+json.dumps(out,ensure_ascii=False,indent=1)+';\n')
