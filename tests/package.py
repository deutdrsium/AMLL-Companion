"""Validate the current portable ZIP after npm run pack, without launching it."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
package = root / f'release/AMLL-Companion-{version}-win-x64.zip'
directory = package.with_suffix('')
with zipfile.ZipFile(package) as archive:
    names = {name.replace('\\', '/'): name for name in archive.namelist()}
    assert not any(name.lower().startswith('alignment/') or name.lower().endswith(('.onnx', '.part'))
                   or 'python.exe' in name.lower() for name in names), 'Experimental runtime or model is bundled'
    required = ['AMLL Companion.exe', 'unilyric-bridge.exe', 'README.md', 'LICENSE',
                'THIRD-PARTY-NOTICES.md', 'wwwroot/index.html']
    required += ['wwwroot/assets/' + path.name for path in (root / 'dist/assets').iterdir()]
    for name in required:
        assert name in names, name
        assert archive.read(names[name]) == (directory / name).read_bytes(), name
    assert archive.testzip() is None, 'ZIP CRC check failed'
checksum = hashlib.sha256(package.read_bytes()).hexdigest()
package.with_suffix('.zip.sha256').write_text(checksum + '  ' + package.name + '\n', encoding='ascii')
print(f'PASS ZIP CRC, executable/assets, no alignment runtime or model; bytes={package.stat().st_size}')
print('SHA256', checksum)
