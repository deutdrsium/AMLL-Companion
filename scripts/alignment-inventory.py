"""Record the exact runtime distributions and their preserved upstream licenses."""
import importlib.metadata
import json
from pathlib import Path
import sys

root = Path(sys.executable).parent.parent
items = []
for distribution in importlib.metadata.distributions():
    files = distribution.files or []
    licenses = [str(file).replace('\\', '/') for file in files
                if any(part.lower().startswith(('license', 'copying', 'notice')) for part in file.parts)]
    items.append({'name': distribution.metadata['Name'], 'version': distribution.version,
                  'license': distribution.metadata.get('License-Expression') or distribution.metadata.get('License', ''),
                  'licenseFiles': licenses})
(root / 'DEPENDENCIES.json').write_text(json.dumps(sorted(items, key=lambda x: x['name'].lower()), indent=2), encoding='utf-8')
print('Recorded', len(items), 'runtime dependencies')
