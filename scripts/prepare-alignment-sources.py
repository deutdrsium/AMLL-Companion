"""Preserve source archives corresponding to PyAV's Windows FFmpeg build."""
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1]
destination = root / '.tools/alignment-sources'
destination.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / 'alignment/ffmpeg-sources.json').read_text(encoding='utf-8'))
for item in manifest:
    extension = '.tar.xz' if item['source_url'].endswith('.tar.xz') else '.tar.bz2' if item['source_url'].endswith('.tar.bz2') else '.tar.gz'
    target = destination / (item['name'] + extension)
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
        print('Downloading source:', item['name'], flush=True)
        temporary = target.with_suffix(target.suffix + '.part')
        with urllib.request.urlopen(item['source_url'], timeout=90) as response, temporary.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Source hash mismatch: ' + item['name'])
        temporary.replace(target)
for name, url in {
    'pyav-ffmpeg-9.0.2-1.zip': 'https://codeload.github.com/PyAV-Org/pyav-ffmpeg/zip/refs/tags/9.0.2-1',
    'PyAV-19.0.2.zip': 'https://codeload.github.com/PyAV-Org/PyAV/zip/refs/tags/v19.0.2',
}.items():
    target = destination / name
    if not target.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            target.write_bytes(response.read())
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('FFmpeg sources ready:', destination)
