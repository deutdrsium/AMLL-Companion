"""Download only pinned CTC model assets; never execute model repository code."""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'alignment/model.json').read_text(encoding='utf-8'))
cache = root/'.tools/ctc-model'
destination = root/'.tools/ctc-runtime/models'
cache.mkdir(parents=True, exist_ok=True)
destination.mkdir(parents=True, exist_ok=True)
for remote, expected in manifest['files'].items():
    path = cache/Path(remote).name
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        url = f"https://huggingface.co/{manifest['repository']}/resolve/{manifest['revision']}/{remote}"
        temporary = path.with_suffix(path.suffix+'.part')
        with urllib.request.urlopen(url, timeout=90) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
            raise ValueError('Model checksum mismatch: '+remote)
        temporary.replace(path)
    target = destination/path.name
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        shutil.copyfile(path, target)
shutil.copyfile(root/'alignment/model.json', destination/'model.json')
shutil.copyfile(root/'alignment/MODEL.md', destination/'MODEL.md')
print('Pinned CTC model verified')
