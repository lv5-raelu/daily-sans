#!/usr/bin/env python3
"""Write a local, auditable disassembly of selected original fight events."""
import argparse
import json
from pathlib import Path
from undertale_archive import Archive

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=Path, default=Path.home() / 'Library/Application Support/Steam/steamapps/common/Undertale/UNDERTALE.app/Contents/Resources/game.ios')
parser.add_argument('--filter', default='obj_sansb|obj_boneplat|obj_menubone|obj_heart_|obj_blcon|scr_blcon|obj_bonestab|SCR_TEXTTYPE|SCR_TEXTSETUP')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'reference/steam-build/code')
args = parser.parse_args()
archive = Archive.open(args.archive)
symbols = archive.symbols()
args.output.mkdir(parents=True, exist_ok=True)
count = 0
for name, pointer in archive.named('CODE').items():
    if not any(part in name for part in args.filter.split('|')):
        continue
    instructions = archive.instructions(pointer, symbols)
    lines = [f'; Original installed game: {name}', '; Address is in 4-byte VM words. Values and symbols are preserved.']
    for instruction in instructions:
        values = {k: v for k, v in instruction.items() if k not in ['address', 'op', 'size']}
        lines.append(f"{instruction['address']:06d}  {instruction['op']:<9} {json.dumps(values, ensure_ascii=False)}")
    (args.output / (name + '.asm')).write_text('\n'.join(lines) + '\n')
    count += 1
print(f'Wrote {count} original code event listings to {args.output}')
