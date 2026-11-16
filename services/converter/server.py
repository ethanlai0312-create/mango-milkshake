"""Single-job production worker. Broker token never enters the sandbox environment."""
import json, os, pathlib, re, threading, time, urllib.request, urllib.error, shutil, signal
from http.server import BaseHTTPRequestHandler, HTTPServer
from sandbox_runner import prepare,execute,read_output,cleanup

API=os.environ.get('MANGO_API','')
TOKEN=os.environ.get('MANGO_WORKER_TOKEN','')
last_broker_ok=0.0
stopping=threading.Event()
from urllib.parse import urlsplit
_api_host=urlsplit(API).hostname or ''
ORIGINS={_api_host,_api_host.replace('.supabase.co','.storage.supabase.co')}
TARGETS={'pdf','docx','odt','txt','html','xlsx','csv','ods','pptx','odp','png'}
if not TOKEN.startswith('mw_') or len(TOKEN)<40: raise RuntimeError('Scoped worker token is required')
if not API.startswith('https://') or not _api_host: raise RuntimeError('Set MANGO_API to your HTTPS broker URL')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): raise ValueError('Unexpected redirect')
opener=urllib.request.build_opener(NoRedirect)

def broker(action,**parameters):
    global last_broker_ok
    request=urllib.request.Request(API,data=json.dumps({'action':action,**parameters}).encode(),
       headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},method='POST')
    with opener.open(request,timeout=25) as response:
        data=json.loads(response.read(1_000_000))
    last_broker_ok=time.time()
    return data.get('data')

def storage_url(value):
    from urllib.parse import urlsplit
    parsed=urlsplit(value)
    if parsed.scheme!='https' or parsed.hostname not in ORIGINS or parsed.port not in (None,443) or parsed.username or not parsed.path.startswith('/storage/v1/object/'):
        raise ValueError('Untrusted storage URL')
    return value

def work():
    count=0
    while not stopping.is_set():
        job=None;root=None;stage='claim'
        try:
            job=broker('workerClaim')
            if not job: stopping.wait(10);continue
            stage='prepare';count+=1;uid=20000+count%10000;root=prepare(uid)
            ext=job['input_name'].rsplit('.',1)[-1].lower();target=job['target']
            if not re.fullmatch('[a-z0-9]{1,8}',ext) or target not in TARGETS: raise ValueError('格式不受支持')
            stage='download'
            source=root/'input'/('input.'+ext)
            with opener.open(storage_url(job['input_url']),timeout=120) as response, source.open('wb') as destination:
                expected=int(response.headers.get('Content-Length','0'))
                if expected and expected+512*1024*1024>shutil.disk_usage(root).free: raise ValueError('服务器可用磁盘不足，请稍后重试')
                while True:
                    chunk=response.read(1024*1024)
                    if not chunk: break
                    if shutil.disk_usage(root).free<512*1024*1024: raise ValueError('服务器可用磁盘不足，请稍后重试')
                    destination.write(chunk)
            if not source.stat().st_size or expected and source.stat().st_size!=expected: raise ValueError('输入文件下载不完整，请重试')
            os.chown(source,uid,uid);source.chmod(0o400)
            stage='sandbox'
            execute(root,uid,['/usr/local/bin/python','/app/convert.py',str(source),target])
            stage='output'
            with read_output(root,target,stream=True) as output:
                request=urllib.request.Request(storage_url(job['output_url']),data=output,method='PUT',headers={'Content-Type':'application/octet-stream','Content-Length':str(os.fstat(output.fileno()).st_size)})
                stage='upload'
                with opener.open(request,timeout=180) as response: response.read(1000)
            stage='finish';broker('workerFinish',id=job['id'],lease=job['lease_id'],success=True)
            print('conversion completed',job['id'],flush=True)
        except Exception as error:
            # Only controlled user-facing error messages leave this worker. Never log signed URLs,
            # document text, HTTP authorization headers, or provider responses.
            message=str(error) if isinstance(error,ValueError) else '转换服务临时失败，请重试'
            if job:
                try: broker('workerFinish',id=job['id'],lease=job['lease_id'],success=False,error=message[:300])
                except Exception: pass
                print('conversion failed',job['id'],stage,type(error).__name__,flush=True)
            stopping.wait(5)
        finally:
            if root:
                try: cleanup(root)
                except Exception: print('temporary cleanup failed',flush=True)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/healthz','/wake'):
            self.send_error(404);return
        self.send_response((200 if time.time()-last_broker_ok<300 else 503) if self.path=='/healthz' else 202)
        self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers()
        self.wfile.write(b'{"status":"ready"}')
    def log_message(self,*args): pass

broker('workerHealth')
class Server(HTTPServer):
    request_queue_size=16
    def get_request(self):
        connection,address=super().get_request();connection.settimeout(5);return connection,address
server=Server(('0.0.0.0',int(os.environ.get('PORT','10000'))),Handler)
worker=threading.Thread(target=work)
def stop(*_):
    stopping.set()
    threading.Thread(target=server.shutdown,daemon=True).start()
signal.signal(signal.SIGTERM,stop)
worker.start()
try: server.serve_forever()
finally:
    stopping.set();server.server_close();worker.join()
