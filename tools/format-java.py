"""Run a pinned Google Java Format; cache is local and excluded from source exports."""
from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import sys
import urllib.request

root = Path(__file__).resolve().parents[1]
jar = root / '.tools-cache/google-java-format.jar'
checksum = '812f805f58112460edf01bf202a8e61d0fd1f35c0d4fabd54220640776ec57a1'
if not jar.exists():
    jar.parent.mkdir(exist_ok=True)
    with urllib.request.urlopen('https://github.com/google/google-java-format/releases/download/v1.24.0/google-java-format-1.24.0-all-deps.jar', timeout=60) as response:
        jar.write_bytes(response.read())
if hashlib.sha256(jar.read_bytes()).hexdigest() != checksum:
    raise RuntimeError('Formatter checksum mismatch')
java = Path(os.environ['JAVA_HOME']) / 'bin' / ('java.exe' if os.name == 'nt' else 'java') if os.environ.get('JAVA_HOME') else shutil.which('java')
if not java:
    raise RuntimeError('Set JAVA_HOME to JDK 21')
options = ['--dry-run', '--set-exit-if-changed'] if '--check' in sys.argv else ['--replace']
subprocess.run([str(java), '-jar', str(jar), *options, *map(str, sorted((root / 'android/app/src').rglob('*.java')))], check=True)
