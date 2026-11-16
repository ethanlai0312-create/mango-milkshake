"""Runs only inside the locked-down, network-disabled disposable container."""
import csv, os, pathlib, subprocess, sys, zipfile, tempfile
source=pathlib.Path(sys.argv[1]); target=sys.argv[2]; out=pathlib.Path(os.environ.get('MANGO_OUTPUT','/output')); out.mkdir(exist_ok=True)
temporary=pathlib.Path(tempfile.gettempdir())
ext=source.suffix.lower().lstrip('.')
if zipfile.is_zipfile(source):
 with zipfile.ZipFile(source) as z:
  if len(z.infolist())>10000 or sum(x.file_size for x in z.infolist())>250_000_000: raise ValueError('Archive expansion exceeds limit')
  if any('..' in pathlib.PurePosixPath(x.filename).parts or x.filename.startswith('/') for x in z.infolist()): raise ValueError('Unsafe document archive')
def run(args): subprocess.run(args,check=True,timeout=100,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
result=out/('result.'+('zip' if target=='png' else target))
if ext=='pdf' and target=='docx':
 from pdf_tools import pdf_to_docx
 pdf_to_docx(source,result)
elif ext=='pdf' and target=='txt':
 from pdf_tools import pdf_to_text
 pdf_to_text(source,result)
elif ext=='pdf' and target=='png':
 from pdf_tools import pdf_to_png
 pdf_to_png(source,result)
elif ext in ['png','jpg','jpeg','webp','gif','bmp','tif','tiff'] and target=='pdf':
 from pdf_tools import image_to_pdf
 image_to_pdf(source,result)
elif ext=='csv' and target=='xlsx':
 import openpyxl
 book=openpyxl.Workbook(); sheet=book.active
 import re,math
 def safe_cell(value):
  if len(value)>32767: raise ValueError('CSV cell exceeds spreadsheet limit')
  if re.fullmatch(r'[-+]?(?:0|[1-9]\d*)(?:\.\d+)?',value):
   number=float(value)
   if math.isfinite(number) and abs(number)<1e15: return int(number) if number.is_integer() else number
  return "'"+value if value.startswith(('=','+','-','@')) else value
 with source.open(encoding='utf-8-sig',newline='') as f:
  for i,row in enumerate(csv.reader(f)):
   if i>=100000 or len(row)>256: raise ValueError('CSV exceeds supported row/column limits')
   sheet.append([safe_cell(x) for x in row])
 book.save(result)
elif ext=='md' and target=='html': run(['pandoc','--sandbox',str(source),'-t','html5','--standalone','-o',str(result)])
else:
 work=source
 if ext in ['md','epub']:
  work=temporary/'intermediate.docx';run(['pandoc','--sandbox',str(source),'-t','docx','-o',str(work)])
 if ext in ['html','htm']:
  # Refuse scripts, embedded remote content, and local-file links before Office loads HTML.
  content=work.read_text(encoding='utf-8',errors='replace')
  import re
  content=re.sub(r'<script\b[^>]*>.*?</script\s*>','',content,flags=re.I|re.S)
  content=re.sub(r'(src|href)\s*=\s*[\"\'][^\"\']*[\"\']','',content,flags=re.I)
  sanitized=temporary/'sanitized.html';sanitized.write_text(content,encoding='utf-8');work=temporary/'intermediate.docx';run(['pandoc','--sandbox',str(sanitized),'-t','docx','-o',str(work)])
 profile=temporary/'lo-profile'/'user';profile.mkdir(parents=True,exist_ok=True)
 (profile/'registrymodifications.xcu').write_text('''<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>''')
 fmt={'txt':'txt:Text','csv':'csv:Text - txt - csv (StarCalc)','html':'html'}.get(target,target)
 run(['libreoffice','-env:UserInstallation='+str((temporary/'lo-profile').as_uri()),'--headless','--norestore','--nodefault','--nolockcheck','--convert-to',fmt,'--outdir',str(out),str(work)])
 candidates=list(out.glob('*.'+target))
 if not candidates: raise ValueError('Converter produced no supported output')
 candidates[0].rename(result)
if not result.exists() or result.stat().st_size==0: raise ValueError('Output missing or empty')
print(result.name)
