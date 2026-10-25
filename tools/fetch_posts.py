import re,sys,html,json,subprocess,os
from datetime import datetime
S=os.path.dirname(os.path.abspath(__file__))
def get(url):
    return subprocess.run(['curl','-s','-m','20',url],capture_output=True,text=True).stdout
CUT=sys.argv[1] if len(sys.argv)>1 else '2026-09-25'
out={}
for ch in open(f'{S}/channels.txt').read().split():
    posts=[];before=None
    for _ in range(6):
        h=get(f'https://t.me/s/{ch}'+(f'?before={before}' if before else ''))
        parts=re.split(r'<div class="tgme_widget_message_wrap',h)[1:]
        if not parts:break
        ids=[]
        for p in parts:
            m=re.search(r'data-post="[^/]+/(\d+)"',p); 
            d=re.search(r'<time datetime="([^"]+)"',p)
            t=re.search(r'class="tgme_widget_message_text[^>]*>(.*?)</div>',p,re.S)
            if not(m and d):continue
            ids.append(int(m.group(1)))
            txt=''
            if t:
                txt=re.sub(r'<br/?>','\n',t.group(1));txt=html.unescape(re.sub(r'<[^>]+>','',txt))
            posts.append({'id':int(m.group(1)),'date':d.group(1),'text':txt})
        if not ids or min(p['date'] for p in posts)[:10]<CUT:break
        before=min(ids)
    posts=[p for p in posts if p['date'][:10]>=CUT]
    out[ch]=sorted({p['id']:p for p in posts}.values(),key=lambda p:p['id'])
    print(ch,len(out[ch]),flush=True)
json.dump(out,open(f'{S}/posts.json','w'),ensure_ascii=False)
