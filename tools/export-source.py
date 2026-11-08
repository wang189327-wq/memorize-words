"""Export only public source into a new or empty destination; verify every copied file."""
from pathlib import Path
import hashlib
import json
import shutil
import sys

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
if destination == root or root in destination.parents or destination in root.parents:
    raise RuntimeError('Destination must be separate from the source project')
if destination.exists() and any(destination.iterdir()):
    raise RuntimeError('Destination must be empty; no existing files are overwritten')
skip = {'.git', '.gradle', '.tools-cache', 'node_modules', 'build', 'local-delivery'}
files = [file for file in root.rglob('*') if file.is_file() and not skip.intersection(file.relative_to(root).parts)]
destination.mkdir(parents=True, exist_ok=True)
hashes = {}
for source in sorted(files):
    relative = source.relative_to(root)
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError(f'Copy mismatch: {relative}')
    hashes[relative.as_posix()] = digest
manifest = destination / 'SOURCE_SHA256.json'
manifest.write_text(json.dumps(hashes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'destination': str(destination), 'sourceFiles': len(hashes), 'sha256Verified': True}, ensure_ascii=False))
