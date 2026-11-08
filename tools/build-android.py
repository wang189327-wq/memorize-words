"""Build through Gradle in an isolated directory, supporting Windows Unicode source paths."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--release', action='store_true', help='Release build; signing uses WORDMEMO_* environment variables')
parser.add_argument('--book', type=Path, help='Private local book override; do not publish its APK')
parser.add_argument('--app-name', help='Local display-name override')
parser.add_argument('--skip-tests', action='store_true', help='Only for a second resource variant after the same source passed tests')
args = parser.parse_args()
if args.book:
    args.book = args.book.resolve(strict=True)
ignored = shutil.ignore_patterns('node_modules', '.git', '.gradle', '.tools-cache', 'build', 'local-delivery')
with tempfile.TemporaryDirectory(prefix='wordmemo-build-') as temporary:
    work = Path(temporary)
    if os.name == 'nt' and not str(work).isascii():
        raise RuntimeError('Set TEMP and TMP to a writable ASCII path for the Android build')
    shutil.copytree(root, work, dirs_exist_ok=True, ignore=ignored)
    if args.app_name:
        config = json.loads((work / 'app.config.json').read_text('utf-8'))
        config['name'] = args.app_name
        (work / 'app.config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    env = os.environ.copy()
    if os.name == 'nt' and not env.get('GRADLE_USER_HOME'):
        env['GRADLE_USER_HOME'] = str(Path(tempfile.gettempdir()) / 'wordmemo-gradle-cache')
    wrapper = work / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
    if os.name != 'nt':
        wrapper.chmod(wrapper.stat().st_mode | 0o111)
    variant = 'release' if args.release else 'debug'
    tasks = [str(wrapper), '--no-daemon', 'clean', 'assembleRelease' if args.release else 'assembleDebug']
    if not args.skip_tests:
        tasks.append('testDebugUnitTest')
    if args.book:
        tasks.append('-PwordmemoBookPath=' + str(args.book))
    subprocess.run(tasks, cwd=work, env=env, check=True)
    version = json.loads((root / 'app.config.json').read_text('utf-8'))['versionName']
    output = root / 'build' / 'android'
    output.mkdir(parents=True, exist_ok=True)
    unsigned = args.release and not env.get('WORDMEMO_KEYSTORE')
    label = ('-private' if args.book else '') + '-' + variant + ('-unsigned' if unsigned else '')
    apk = output / f'wordmemo-{version}{label}.apk'
    name = 'app-' + variant + ('-unsigned' if unsigned else '') + '.apk'
    shutil.copy2(work / 'android/app/build/outputs/apk' / variant / name, apk)
    if not args.skip_tests:
        shutil.copytree(work / 'android/app/build/test-results/testDebugUnitTest', output / 'unit-test-results', dirs_exist_ok=True)
    print(apk)
