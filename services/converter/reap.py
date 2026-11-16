"""Trusted job cleanup: signal only processes owned by the dedicated job UID."""
import os, signal, sys

uid, group = map(int, sys.argv[1:])
if os.geteuid() != 0 or not 20000 <= uid <= 29999 or group <= 1:
    raise RuntimeError('Invalid cleanup identity')
os.setgroups([])
os.setgid(uid)
os.setuid(uid)
# Some hosting runtimes omit CAP_KILL even for UID 0. The job's own UID can
# terminate its processes without granting the broker additional capabilities.
try:
    os.killpg(group, signal.SIGKILL)
except (ProcessLookupError, PermissionError):
    pass
os.execve('/usr/bin/pkill', ['pkill', '-KILL', '-u', str(uid)], {'PATH':'/usr/bin:/bin'})
