"""Build a production FC ZIP using the root lockfile and dependency overrides."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / 'build' / 'cloud'
output.mkdir(parents=True, exist_ok=True)
version = json.loads((root / 'cloud/package.json').read_text('utf-8'))['version']
archive = output / f'wordmemo-sync-{version}.zip'
with tempfile.TemporaryDirectory(prefix='wordmemo-cloud-') as temporary:
    staging = Path(temporary)
    (staging / 'cloud').mkdir()
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(root / name, staging / name)
    for name in ['server.cjs', 'store.cjs', 'rating-contract.cjs', 'package.json']:
        shutil.copy2(root / 'cloud' / name, staging / 'cloud' / name)
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise RuntimeError('npm is required')
    subprocess.run([npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=staging, check=True)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name in ['server.cjs', 'store.cjs', 'rating-contract.cjs', 'package.json']:
            bundle.write(staging / 'cloud' / name, name)
        for directory, dirs, files in os.walk(staging / 'node_modules', followlinks=False):
            # Do not follow links in dependency caches.
            dirs[:] = [name for name in dirs if not (Path(directory) / name).is_symlink() and not (Path(directory) / name).is_junction()]
            for name in files:
                file = Path(directory) / name
                if not file.is_symlink():
                    bundle.write(file, file.relative_to(staging).as_posix())
with zipfile.ZipFile(archive) as bundle:
    assert all('environment' not in name and not name.endswith(('.p12', '.jks', '.apk')) for name in bundle.namelist())
    assert 'node_modules/protobufjs/minimal.js' in bundle.namelist()
print(json.dumps({'file': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'booksIncluded': False}))
