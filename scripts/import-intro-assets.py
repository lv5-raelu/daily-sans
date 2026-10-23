#!/usr/bin/env python3
"""Copy the opening's original assets from the optional local Steam asset import."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/undertale-original'
DEST = ROOT / 'public/daily-assets'


def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    DEST.mkdir(exist_ok=True)
    font = dict(manifest['fonts']['fnt_plain'])
    files = {'bubble-small.png': manifest['sprites']['spr_blconsm']['frames'][0]['url'],
             'plain.png': font['url'], 'birds.ogg': manifest['music']['ambient']['url']}
    digests = {}
    for name, source in files.items():
        shutil.copyfile(SOURCE / source, DEST / name)
        digests[name] = hashlib.sha256((DEST / name).read_bytes()).hexdigest()
    font['url'] = 'daily-assets/plain.png'
    bubble = manifest['sprites']['spr_blconsm']
    metadata = {'sourceArchiveSha256': manifest['source']['archiveSha256'],
                'font': font, 'style': manifest['textStyles']['threat'],
                'bubble': {key: bubble[key] for key in ['width', 'height']},
                'ambience': {'url': 'daily-assets/birds.ogg', 'loop': True, 'volume': 1,
                             'stopCue': 'BlackScreen,1', 'nativeStopEvent': 'obj_sansb Step con == 6'},
                'files': digests}
    (ROOT / 'src/daily/intro-assets.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Copied original small bubble, plain font and opening birds without modifying the assets.')


if __name__ == '__main__':
    main()
