"""Build through Gradle in an isolated directory, supporting Windows Unicode source paths."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
ignored = shutil.ignore_patterns('node_modules', '.git', '.gradle', '.tools-cache', 'build', 'local-delivery')
with tempfile.TemporaryDirectory(prefix='wordmemo-build-') as temporary:
    work = Path(temporary)
    if os.name == 'nt' and not str(work).isascii():
        raise RuntimeError('Set TEMP and TMP to a writable ASCII path for the Android build')
    shutil.copytree(root, work, dirs_exist_ok=True, ignore=ignored)
    env = os.environ.copy()
    if os.name == 'nt' and not env.get('GRADLE_USER_HOME'):
        env['GRADLE_USER_HOME'] = str(Path(tempfile.gettempdir()) / 'wordmemo-gradle-cache')
    wrapper = work / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
    if os.name != 'nt':
        wrapper.chmod(wrapper.stat().st_mode | 0o111)
    subprocess.run([str(wrapper), '--no-daemon', 'clean', 'assembleDebug', 'testDebugUnitTest'], cwd=work, env=env, check=True)
    version = json.loads((root / 'app.config.json').read_text('utf-8'))['versionName']
    output = root / 'build' / 'android'
    output.mkdir(parents=True, exist_ok=True)
    apk = output / f'wordmemo-{version}-debug.apk'
    shutil.copy2(work / 'android/app/build/outputs/apk/debug/app-debug.apk', apk)
    shutil.copytree(work / 'android/app/build/test-results/testDebugUnitTest', output / 'unit-test-results', dirs_exist_ok=True)
    print(apk)
