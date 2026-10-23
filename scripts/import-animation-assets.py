#!/usr/bin/env python3
"""Import native gesture frames and derive dialogue poses from the owned game."""
import hashlib
import json
import shutil
from pathlib import Path
from undertale_archive import Archive

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/undertale-original'
DEST = ROOT / 'public/daily-assets/animations'
ARCHIVE = Path.home() / 'Library/Application Support/Steam/steamapps/common/Undertale/UNDERTALE.app/Contents/Resources/game.ios'


def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    archive = Archive.open(ARCHIVE)
    assert hashlib.sha256(archive.data).hexdigest() == manifest['source']['archiveSha256']
    entries = archive.named('CODE')
    symbols = archive.symbols()
    event = archive.instructions(entries['gml_Object_obj_sansb_Alarm_6'], symbols)
    draw = archive.instructions(entries['gml_Object_obj_sansb_body_Draw_0'], symbols)
    turns = {}
    sweat = 0
    for turn in range(1, 24):
        # The first hit_try == N branch is the new-Fight dialogue branch.
        start = next(i for i, row in enumerate(event[:-3])
                     if row['op'] == 'push' and row.get('symbol') == 'hit_try'
                     and event[i + 1].get('value') == turn
                     and event[i + 2].get('comparison') == 3)
        end = event[start + 3]['target']
        block = [row for row in event[start + 4:] if row['address'] < end]
        pose = dict(face=0, torso=0, sweat=sweat)
        for i, row in enumerate(block):
            if row['op'] != 'pop':
                continue
            if row.get('symbol') == 'faceemotion':
                pose['face'] = block[i - 1]['value']
            elif row.get('symbol') == 'sweat':
                pose['sweat'] = block[i - 1]['value']
            elif row.get('symbol') == 'flag' and block[i - 1].get('value') == 20:
                pose['torso'] = block[i - 3]['value']
        sweat = pose['sweat']
        turns[str(turn)] = pose

    sprites = {}
    for name in ['spr_sansb_handup', 'spr_sansb_handdown', 'spr_sansb_rightstrike', 'spr_sansb_legs', 'spr_sansb_legs_sit']:
        sprite = manifest['sprites'][name]
        result = {key: sprite[key] for key in ['width', 'height', 'origin']}
        result['frames'] = []
        for index, frame in enumerate(sprite['frames']):
            relative = f'{name}/{index}.png'
            target = DEST / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / frame['url'], target)
            result['frames'].append(dict(url='../../daily-assets/animations/' + relative,
                                         bytes=target.stat().st_size,
                                         sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
        sprites[name] = result

    code = {}
    for name in ['gml_Object_obj_sansb_Alarm_5', 'gml_Object_obj_sansb_Alarm_6',
                 'gml_Object_obj_sansb_body_Draw_0', 'gml_Object_obj_base_writer_Draw_0']:
        pointer = entries[name]
        raw = archive.read(pointer + 12 + archive.i32(pointer + 12), archive.u32(pointer + 4))
        code[name] = hashlib.sha256(raw).hexdigest()
    gestures = {}
    for name, mode, sprite_name, axis in [
        ('HandRight', 1, 'spr_sansb_rightstrike', 'headx'),
        ('HandLeft', 4, 'spr_sansb_rightstrike', 'headx'),
        ('HandDown', 3, 'spr_sansb_handdown', 'heady'),
        ('HandUp', 2, 'spr_sansb_handup', 'heady'),
    ]:
        start = next(i for i, row in enumerate(draw[:-3])
                     if row['op'] == 'push' and row.get('symbol') == 'movearm'
                     and draw[i + 1].get('value') == mode
                     and draw[i + 2].get('comparison') == 3)
        end = draw[start + 3]['target']
        block = [row for row in draw[start + 4:] if row['address'] < end]
        rules = []
        for i, row in enumerate(block[:-3]):
            if row['op'] != 'push' or row.get('symbol') != 'arm_i' or block[i + 2]['op'] != 'cmp':
                continue
            comparison = block[i + 2]['comparison']
            stop = block[i + 3]['target']
            body = [r for r in block[i + 4:] if r['address'] < stop]
            for j, action in enumerate(body):
                if action['op'] == 'pop' and action.get('symbol') == axis:
                    rules.append((comparison, block[i + 1]['value'], body[j - 1]['value']))
        sprite = sprites[sprite_name]
        frames = list(range(len(sprite['frames'])))
        if name == 'HandLeft':
            frames.reverse()
        offset = 0
        head = []
        for frame in range(len(frames)):
            arm_i = frame * 2
            for comparison, value, result in rules:
                if {1: arm_i < value, 2: arm_i <= value, 3: arm_i == value,
                    4: arm_i != value, 5: arm_i >= value, 6: arm_i > value}[comparison]:
                    offset = result
            x, y = sprite['origin'][0], sprite['origin'][1] - 6
            head.append([x + offset / 2 if axis == 'headx' else x,
                         y + offset / 2 if axis == 'heady' else y])
        gestures[name] = dict(sprite=sprite_name, frames=frames,
                              anchor=[sprite['origin'][0], sprite['origin'][1] + 36], head=head)
    metadata = dict(sourceArchiveSha256=manifest['source']['archiveSha256'], code=code,
                    turns=turns, sprites=sprites,
                    groups=dict(opening=dict(face=4, torso=0, sweat=0),
                                threat=dict(face=5, torso=0, sweat=0),
                                afterOpening=dict(face=0, torso=0, sweat=0),
                                spare=dict(face=4, torso=0, sweat=2),
                                final=dict(face=9, torso=0, sweat=3)),
                    gestures=gestures)
    (ROOT / 'src/daily/animation-data.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Imported 19 original character frames and derived all 23 turn poses from native events.')


if __name__ == '__main__':
    main()
