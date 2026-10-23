#!/usr/bin/env python3
"""Import the Sans fight's assets from an owned Steam copy into this workspace."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from pathlib import Path

from undertale_archive import Archive, ArchiveError, crop_rgba, decode_rgba, encode_rgba, sprite_pixels

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_APP = Path.home() / 'Library/Application Support/Steam/steamapps/common/Undertale/UNDERTALE.app'
SPRITES = {
    'spr_fightbt', 'spr_talkbt', 'spr_itembt', 'spr_sparebt', 'spr_gameoverbg', 'spr_hpname',
    'spr_blconsm', 'spr_blconsm2', 'spr_blconwd', 'spr_blconwdshrt', 'spr_heart', 'spr_heartblue',
    'spr_heartblue_r', 'spr_heartblue_l', 'spr_heartblue_u', 'spr_heart_battle_pl',
    'spr_heartbreak', 'spr_heartshards', 'spr_target', 'spr_targetchoice', 'spr_strike',
    'spr_dmgmiss_o', 'spr_boneplat', 'spr_boneplat_2', 'spr_sans_z', 'spr_sans_z_battle',
}
PREFIXES = ('spr_sansb_', 'spr_s_bone', 'spr_gasterblaster', 'spr_menubone')
FONTS = ('fnt_main', 'fnt_maintext', 'fnt_small', 'fnt_comicsans', 'fnt_dmg', 'fnt_plain')
# The native audio resource names, not filenames or recoded simulator effects.
SOUNDS = {
    'battletext': 'SND_TXT2', 'bonestab': 'snd_spearrise', 'ding': 'snd_bell',
    'flash': 'snd_noise', 'gasterblast': 'mus_sfx_rainbowbeam_1',
    'gasterblast2': 'mus_sfx_a_gigatalk', 'gasterblaster': 'mus_sfx_segapower',
    'heartshatter': 'snd_break2', 'heartsplit': 'snd_break1', 'menucursor': 'snd_movemenu',
    'menuselect': 'snd_select', 'playerdamaged': 'snd_hurt1', 'playerfight': 'snd_laz',
    'playerheal': 'snd_power', 'sansspeak': 'snd_txtsans', 'slam': 'snd_impact',
    'warning': 'snd_b', 'cinematiccut': 'mus_sfx_cinematiccut', 'vaporized': 'snd_vaporized',
}
MUSIC = {'battle': 'mus_zz_megalovania.ogg', 'ambient': 'mus_birdnoise.ogg', 'interlude': 'mus_chokedup.ogg'}


def locate_archive(path: Path) -> Path:
    path = path.expanduser().resolve()
    candidates = [path, path / 'Contents/Resources/game.ios', path / 'UNDERTALE.app/Contents/Resources/game.ios', path / 'game.ios', path / 'data.win', path / 'game.unx']
    for p in candidates:
        if p.is_file() and p.name in ('game.ios', 'data.win', 'game.unx'):
            return p
    raise ArchiveError(f'Could not find a GameMaker archive under {path}')


def import_game(archive_path: Path, output: Path) -> dict:
    archive = Archive.open(archive_path)
    resources = archive_path.parent
    source = dict(platform='macOS' if archive_path.suffix == '.ios' else 'GameMaker', archive=archive_path.name,
                  archiveSha256=hashlib.sha256(archive.data).hexdigest(), bytecode=archive.bytecode, runtime=list(archive.runtime))
    steam_manifest = archive_path.parents[5] / 'appmanifest_391540.acf' if len(archive_path.parents) > 5 else None
    if steam_manifest and steam_manifest.is_file():
        build = re.search(r'"buildid"\s+"(\d+)"', steam_manifest.read_text())
        if build:
            source['steamBuildId'] = build.group(1)
    pack = dict(schema=1, source=source, sprites={}, fonts={}, sounds={}, music={}, dialogue={})
    # SCR_TEXTTYPE passes spacing, line height, speed, font and sound explicitly
    # to SCR_TEXTSETUP. Native writer spacing differs from font glyph advances.
    code_entries = archive.named('CODE')
    instructions = archive.instructions(code_entries['gml_Script_SCR_TEXTTYPE'])
    pack['textStyles'] = {}
    style_ids = {1: 'narrator', 107: 'sans', 108: 'threat', 109: 'sansFast'}
    font_records = archive.entries('FONT')
    sound_records = archive.entries('SOND')
    for index, instruction in enumerate(instructions[:-3]):
        if instruction['op'] != 'pushglb' or instruction.get('symbol') != 'typer':
            continue
        style = style_ids.get(instructions[index + 1].get('value'))
        branch = instructions[index + 3]
        if not style or branch['op'] != 'bf':
            continue
        block = [row for row in instructions[index + 4:] if row['address'] < branch['target']]
        constants = [row['value'] for row in block if 'value' in row]
        pack['textStyles'][style] = dict(lineHeight=constants[0], spacing=constants[1],
                                        sound=archive.string(archive.u32(sound_records[constants[2]])),
                                        delay=constants[3], font=archive.string(archive.u32(font_records[constants[-2]])))
    if set(pack['textStyles']) != set(style_ids.values()):
        raise ArchiveError('Original writer style layout is unsupported')
    images = {}
    files = []

    def write(relative: str, data: bytes) -> str:
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        files.append(dict(path=relative, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
        return relative

    def page(index: int) -> tuple[int, int, bytes]:
        if index not in images:
            images[index] = decode_rgba(archive.texture_png(index))
        return images[index]

    for name, pointer in archive.named('SPRT').items():
        if name not in SPRITES and not name.startswith(PREFIXES):
            continue
        sprite = archive.sprite(pointer)
        for i, frame in enumerate(sprite['frames']):
            pixels = sprite_pixels(page(frame['page']), frame, sprite['width'], sprite['height'])
            frame['url'] = write(f'sprites/{name}/{i}.png', encode_rgba(sprite['width'], sprite['height'], pixels))
        pack['sprites'][name] = sprite

    fonts = archive.named('FONT')
    for name in FONTS:
        font = archive.font(fonts[name])
        item = font.pop('texture')
        width, height, pixels = crop_rgba(page(item['page']), item['source'])
        # Retain original glyph offsets, advances, and kerning. Never re-typeset a font.
        font.update(url=write(f'fonts/{name}.png', encode_rgba(width, height, pixels)), width=width, height=height)
        pack['fonts'][name] = font

    sounds = archive.named('SOND')
    for alias, name in SOUNDS.items():
        sound = archive.sound(sounds[name])
        if sound['group'] != 0:
            raise ArchiveError(f'Unsupported external audio group for {name}')
        if sound['audio'] >= 0:
            data = archive.audio(sound['audio'])
        else:
            data = (resources / sound['filename']).read_bytes()
        suffix = '.wav' if data[:4] == b'RIFF' else '.ogg' if data[:4] == b'OggS' else None
        if not suffix:
            raise ArchiveError(f'Unknown audio format for {name}')
        pack['sounds'][alias] = dict(name=name, url=write('audio/' + alias + suffix, data), volume=sound['volume'])

    for alias, filename in MUSIC.items():
        data = (resources / filename).read_bytes()
        if data[:4] != b'OggS':
            raise ArchiveError(f'Invalid soundtrack {filename}')
        pack['music'][alias] = dict(name=filename, url=write('audio/' + filename, data))

    # The English localization initializer places each translated value immediately
    # before its unique key in this build's STRG table. Keep the keys for audit.
    strings = [archive.string(pointer + 4) for pointer in archive.entries('STRG')]
    for index, key in enumerate(strings):
        if index and re.fullmatch(r'obj_sansb(?:_body)?_\d+', key):
            value = strings[index - 1]
            if not re.fullmatch(r'\w+_\d+', value):
                pack['dialogue'][key] = value

    code = {}
    for name, pointer in archive.named('CODE').items():
        if any(t in name for t in ['obj_sansb_', 'obj_sansb_body_', 'obj_boneplat_', 'obj_menubone', 'obj_heart_', 'gml_Script_SCR_TEXTTYPE', 'gml_Script_SCR_TEXTSETUP']):
            start = pointer + 12 + archive.i32(pointer + 12)
            data = archive.read(start, archive.u32(pointer + 4))
            code[name] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    pack['codeReference'] = code
    pack['files'] = files
    output.mkdir(parents=True, exist_ok=True)
    (output / 'manifest.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    return pack


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('installation', nargs='?', type=Path, default=DEFAULT_APP, help='UNDERTALE.app, its Resources directory, or the game archive')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/undertale-original')
    args = parser.parse_args()
    try:
        archive = locate_archive(args.installation)
        output = args.output.expanduser().resolve()
        # Build completely before replacing the manifest, so a failed extraction
        # cannot leave a manifest referring to missing assets.
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.undertale-import-', dir=output.parent) as temp:
            staging = Path(temp)
            pack = import_game(archive, staging)
            for entry in pack['files']:
                target = output / entry['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((staging / entry['path']).read_bytes())
            output.mkdir(parents=True, exist_ok=True)
            (output / 'manifest.json').write_bytes((staging / 'manifest.json').read_bytes())
        print(f"Imported {len(pack['sprites'])} sprites / {sum(len(s['frames']) for s in pack['sprites'].values())} frames, {len(pack['fonts'])} fonts, {len(pack['sounds'])} effects, {len(pack['music'])} music tracks.")
        print(f"Source SHA256: {pack['source']['archiveSha256']}")
        print(f'Manifest: {output / "manifest.json"}')
    except (ArchiveError, OSError, KeyError, ValueError) as error:
        parser.exit(1, f'Import failed: {error}\n')


if __name__ == '__main__':
    main()
