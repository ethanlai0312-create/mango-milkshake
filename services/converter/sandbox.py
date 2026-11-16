"""Linux child launcher. Fails closed unless all isolation controls are installed."""
import ctypes, errno, os, resource, socket, sys

def restrict(uid, directory):
    if uid < 20000 or uid > 29999 or os.geteuid() != 0:
        raise RuntimeError('Sandbox requires a dedicated unprivileged UID')
    os.chdir(directory)
    os.umask(0o077)
    for limit, value in [(resource.RLIMIT_CPU,110),(resource.RLIMIT_AS,900_000_000),
                         (resource.RLIMIT_FSIZE,512*1024*1024),(resource.RLIMIT_NPROC,64),
                         (resource.RLIMIT_NOFILE,128),(resource.RLIMIT_CORE,0)]:
        resource.setrlimit(limit,(value,value))
    os.setgroups([])
    os.setgid(uid)
    os.setuid(uid)
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.prctl(38,1,0,0,0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise RuntimeError('Cannot enforce no-new-privileges')
    sec=ctypes.CDLL('libseccomp.so.2',use_errno=True)
    sec.seccomp_init.argtypes=[ctypes.c_uint32];sec.seccomp_init.restype=ctypes.c_void_p
    sec.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];sec.seccomp_syscall_resolve_name.restype=ctypes.c_int
    sec.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint]
    sec.seccomp_load.argtypes=[ctypes.c_void_p];sec.seccomp_release.argtypes=[ctypes.c_void_p]
    context=sec.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
    if not context: raise RuntimeError('Cannot create seccomp filter')
    class Compare(ctypes.Structure):
        _fields_=[('arg',ctypes.c_uint),('op',ctypes.c_int),('a',ctypes.c_uint64),('b',ctypes.c_uint64)]
    def deny(name,code=errno.EPERM,comparison=None):
        number=sec.seccomp_syscall_resolve_name(name.encode())
        if number < 0: return
        result=sec.seccomp_rule_add(context,0x50000|code,number,0) if comparison is None else sec.seccomp_rule_add(context,0x50000|code,number,1,comparison)
        if result != 0: raise RuntimeError('Cannot install syscall restriction')
    # LibreOffice needs local Unix sockets; all Internet, packet and netlink sockets are denied.
    deny('socket',comparison=Compare(0,1,socket.AF_UNIX,0))  # SCMP_CMP_NE
    deny('socketpair',comparison=Compare(0,1,socket.AF_UNIX,0))
    for name in ['ptrace','process_vm_readv','process_vm_writev','bpf','userfaultfd',
                 'io_uring_setup','io_uring_enter','io_uring_register','keyctl','add_key','request_key',
                 'unshare','setns','mount','umount2','pivot_root','chroot','reboot',
                 'swapon','swapoff','open_by_handle_at','perf_event_open','kexec_load']:
        deny(name)
    deny('clone3',errno.ENOSYS)  # libc falls back to ordinary clone for threads
    for namespace_flag in [0x20000,0x4000000,0x8000000,0x10000000,0x20000000,0x40000000]:
        deny('clone',comparison=Compare(0,7,namespace_flag,namespace_flag))
    if sec.seccomp_load(context) != 0: raise RuntimeError('Cannot enforce seccomp')
    sec.seccomp_release(context)

if __name__=='__main__':
    uid=int(sys.argv[1]);directory=sys.argv[2];command=sys.argv[3:]
    if not command: raise RuntimeError('Sandbox command missing')
    restrict(uid,directory)
    environment={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':directory+'/home',
                 'TMPDIR':directory+'/tmp','MANGO_OUTPUT':directory+'/output','LANG':'C.UTF-8'}
    os.execvpe(command[0],command,environment)
