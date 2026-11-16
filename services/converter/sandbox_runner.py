import os, pathlib, shutil, stat, subprocess, tempfile, time
ROOT=pathlib.Path('/work/jobs')
ROOT.mkdir(parents=True,exist_ok=True,mode=0o755)
OUTPUT_BUDGET=512*1024*1024
WORK_BUDGET=1024*1024*1024
LOG_BUDGET=1024*1024

def check_workspace(root):
    used=0
    count=0
    for name in ['output','tmp','home']:
        for directory, directories, files in os.walk(root/name, followlinks=False):
            count+=len(directories)+len(files)
            if count>20000: raise ValueError('转换产生的临时文件数量超过限制')
            for file in files:
                try: info=os.stat(os.path.join(directory,file),follow_symlinks=False)
                except FileNotFoundError: continue
                if stat.S_ISREG(info.st_mode):
                    used+=info.st_size
                    if used>WORK_BUDGET: raise ValueError('转换临时文件容量超过限制')

def prepare(uid):
    if not 20000<=uid<=29999: raise ValueError('Invalid job UID')
    root=pathlib.Path(tempfile.mkdtemp(prefix='job-',dir=ROOT))
    os.chown(root,uid,uid);root.chmod(0o700)
    for name in ['input','output','tmp','home']:
        directory=root/name;directory.mkdir(mode=0o700);os.chown(directory,uid,uid)
    return root

def execute(root,uid,command):
    stdout_file=tempfile.TemporaryFile();stderr_file=tempfile.TemporaryFile()
    process=subprocess.Popen(['/usr/local/bin/python','/app/sandbox.py',str(uid),str(root),*command],
                             stdout=stdout_file,stderr=stderr_file,start_new_session=True,
                             env={'PATH':'/usr/local/bin:/usr/bin:/bin'})
    try:
        deadline=time.monotonic()+120
        while process.poll() is None:
            if time.monotonic()>deadline: raise subprocess.TimeoutExpired(command,120)
            if shutil.disk_usage(root).free<512*1024*1024: raise ValueError('服务器磁盘不足，转换已中止，请清理空间后重试')
            if os.fstat(stdout_file.fileno()).st_size+os.fstat(stderr_file.fileno()).st_size>LOG_BUDGET:
                raise ValueError('转换日志超过容量限制')
            check_workspace(root)
            time.sleep(.25)
        check_workspace(root)
        if process.returncode:
            stderr_file.seek(0,2);stderr_file.seek(max(0,stderr_file.tell()-4000))
            message=stderr_file.read(4000).decode(errors='replace')
            if 'Scanned PDF requires OCR' in message: raise ValueError('此PDF需要OCR，当前暂不支持')
            if 'Archive expansion exceeds limit' in message: raise ValueError('文档解压后超过资源限制')
            if 'PDF over 100 pages' in message: raise ValueError('PDF超过当前转换服务的100页处理能力，请拆分后重试')
            if 'pixel budget' in message: raise ValueError('图片或PDF页面像素过大，请降低分辨率后重试')
            if 'Unsafe document archive' in message: raise ValueError('文档包含不安全路径')
            raise ValueError('转换失败，文档可能损坏、资源超限或格式不受支持')
        stdout_file.seek(0);return stdout_file.read(8192)
    except subprocess.TimeoutExpired:
        raise ValueError('转换超过120秒资源限制')
    finally:
        # Drop to the job UID in a trusted helper. This works without CAP_KILL,
        # including for processes that created a separate process group.
        reaped=subprocess.run(['/usr/local/bin/python','/app/reap.py',str(uid),str(process.pid)],
                              env={'PATH':'/usr/local/bin:/usr/bin:/bin'},
                              stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
        if reaped.returncode not in (0,1): raise RuntimeError('Job cleanup failed')
        process.wait(timeout=5)
        stdout_file.close();stderr_file.close()

def read_output(root,target,stream=False):
    filename=root/'output'/('result.'+('zip' if target=='png' else target))
    descriptor=os.open(filename,os.O_RDONLY|os.O_NOFOLLOW)
    file=os.fdopen(descriptor,'rb')
    info=os.fstat(file.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_size<1:
        file.close();raise ValueError('输出文件无效或为空')
    if info.st_size>OUTPUT_BUDGET:
        file.close();raise ValueError('转换输出超过512 MiB')
    if stream: return file
    with file: return file.read()

def cleanup(root):
    resolved=root.resolve()
    if resolved.parent!=ROOT.resolve(): raise ValueError('Unsafe cleanup path')
    shutil.rmtree(root)
