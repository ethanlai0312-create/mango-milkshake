"""Executed by development CI inside the production container; no private user files."""
import json,os,pathlib,zipfile
from sandbox_runner import prepare,execute,read_output,cleanup

secret=pathlib.Path('/app/root-secret');secret.write_text('sentinel-not-a-real-secret');secret.chmod(0o600)
root=prepare(20001)
try:
    probe=r'''
import os,socket,ctypes,errno,json,resource
assert os.getuid()==20001
assert 'MANGO_WORKER_TOKEN' not in os.environ
for family in [socket.AF_INET,socket.AF_INET6,socket.AF_NETLINK]:
 try: socket.socket(family,socket.SOCK_STREAM);raise AssertionError('network allowed')
 except OSError as e: assert e.errno==errno.EPERM
for path,mode in [('/app/root-secret','r'),('/app/modified','w')]:
 try: open(path,mode);raise AssertionError('protected filesystem accessible')
 except PermissionError: pass
libc=ctypes.CDLL(None,use_errno=True)
assert libc.ptrace(0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM
assert resource.getrlimit(resource.RLIMIT_NPROC)==(64,64)
print(json.dumps({'uid':os.getuid(),'internet_denied':True,'secrets_denied':True,'ptrace_denied':True,'resources_limited':True}))
'''
    print(execute(root,20001,['python','-c',probe]).decode(),flush=True)
    source=root/'input'/'fixture.docx'
    with zipfile.ZipFile(source,'w') as archive:
        archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Mango sandbox acceptance 苹果与学校</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
    os.chown(source,20001,20001);source.chmod(0o400)
    execute(root,20001,['python','/app/convert.py',str(source),'pdf'])
    output=read_output(root,'pdf')
    from pypdf import PdfReader
    import io
    text=''.join(page.extract_text() for page in PdfReader(io.BytesIO(output)).pages)
    assert 'Mango sandbox acceptance' in text and '苹果' in text
    print(json.dumps({'docx_to_pdf':True,'chinese_preserved':True,'bytes':len(output)}),flush=True)
    pdf_source=root/'input'/'fixture.pdf';pdf_source.write_bytes(output);os.chown(pdf_source,20001,20001);pdf_source.chmod(0o400)
    execute(root,20001,['python','/app/convert.py',str(pdf_source),'docx'])
    from docx import Document
    reconstructed=Document(io.BytesIO(read_output(root,'docx')))
    reconstructed_text=' '.join(p.text for p in reconstructed.paragraphs)
    assert 'Mango sandbox acceptance' in reconstructed_text and '苹果' in reconstructed_text
    execute(root,20001,['python','/app/convert.py',str(pdf_source),'png'])
    png_archive=zipfile.ZipFile(io.BytesIO(read_output(root,'png')))
    png=png_archive.read('page-001.png');assert png.startswith(b'\x89PNG\r\n\x1a\n')
    image_source=root/'input'/'fixture.png';image_source.write_bytes(png);os.chown(image_source,20001,20001);image_source.chmod(0o400)
    execute(root,20001,['python','/app/convert.py',str(image_source),'pdf'])
    image_pdf=PdfReader(io.BytesIO(read_output(root,'pdf')));assert len(image_pdf.pages[0].images)>0
    print(json.dumps({'pdf_to_docx':True,'pdf_to_png':True,'image_to_pdf':True,'chinese_text_preserved':True}),flush=True)
    (root/'output'/'result.pdf').unlink()
    execute(root,20001,['python','-c',"import os;os.symlink('/app/root-secret',os.environ['MANGO_OUTPUT']+'/result.pdf')"])
    try: read_output(root,'pdf');raise AssertionError('symlink followed')
    except OSError: pass
    print(json.dumps({'output_symlink_rejected':True}),flush=True)
finally:
    cleanup(root);secret.unlink()
