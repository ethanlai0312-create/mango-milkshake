"""Install the official embedded-data build, retaining --sandbox DOCX support."""
import hashlib,io,os,subprocess,tarfile,urllib.request,zipfile
url='https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-amd64.tar.gz'
expected='d0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8'
with urllib.request.urlopen(url,timeout=90) as response: content=response.read(50_000_001)
if len(content)>50_000_000 or hashlib.sha256(content).hexdigest()!=expected: raise ValueError('Official Pandoc checksum mismatch')
with tarfile.open(fileobj=io.BytesIO(content),mode='r:gz') as archive:
 members=[m for m in archive.getmembers() if m.name.endswith('/bin/pandoc') and m.isfile()]
 if len(members)!=1: raise ValueError('Unexpected official archive')
 with open('/usr/local/bin/pandoc','wb') as destination: destination.write(archive.extractfile(members[0]).read())
os.chmod('/usr/local/bin/pandoc',0o755)
subprocess.run(['pandoc','--sandbox','-f','markdown','-t','docx','-o','/tmp/sandbox-test.docx'],input='# Sandbox acceptance\n\nHello.',text=True,check=True,timeout=30)
with zipfile.ZipFile('/tmp/sandbox-test.docx') as document:
 if b'Sandbox acceptance' not in document.read('word/document.xml'): raise ValueError('Sandbox DOCX self-test failed')
os.remove('/tmp/sandbox-test.docx')
