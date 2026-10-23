#!/usr/bin/env python3
"""Extract the prototype's fireballs from the owned Steam archive, read-only."""
import hashlib
import json
from pathlib import Path
from undertale_archive import Archive, decode_rgba, encode_rgba, sprite_pixels

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path.home() / 'Library/Application Support/Steam/steamapps/common/Undertale/UNDERTALE.app/Contents/Resources/game.ios'


def main():
    archive = Archive.open(ARCHIVE)
    sprite = archive.sprite(archive.named('SPRT')['spr_firebullet'])
    dest = ROOT / 'public/daily-assets/toriel'
    dest.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, frame in enumerate(sprite.pop('frames')):
        pixels = sprite_pixels(decode_rgba(archive.texture_png(frame['page'])), frame, sprite['width'], sprite['height'])
        data = encode_rgba(sprite['width'], sprite['height'], pixels)
        name = f'fire-{index}.png'
        (dest / name).write_bytes(data)
        frames.append({'url': f'../../daily-assets/toriel/{name}', 'sha256': hashlib.sha256(data).hexdigest()})
    code = archive.named('CODE')
    sources = ['gml_Object_obj_torielboss_Step_0', 'gml_Object_obj_1sidegen_Alarm_0',
               'gml_Object_blt_firehelix1_Create_0', 'gml_Object_blt_firehelix1_Step_0',
               'gml_Object_blt_firehelix1_Collision_762', 'gml_Object_blt_parent_Collision_744',
               'gml_Script_scr_monstersetup', 'gml_Script_SCR_GAMESTART']
    references = {}
    for name in sources:
        pointer = code[name]
        start = pointer + 12 + archive.i32(pointer + 12)
        references[name] = hashlib.sha256(archive.read(start, archive.u32(pointer + 4))).hexdigest()
    result = {'sourceArchiveSha256': hashlib.sha256(archive.data).hexdigest(),
              'sprite': {'name': 'spr_firebullet', **sprite, 'frames': frames},
              'code': references}
    (ROOT / 'src/daily/toriel-assets.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'Extracted {len(frames)} original Toriel fireball frames.')


if __name__ == '__main__':
    main()
