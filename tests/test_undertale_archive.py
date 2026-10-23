import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from undertale_archive import Archive, ArchiveError, crop_rgba, decode_rgba, encode_rgba, sprite_pixels


class ImageExtractionTests(unittest.TestCase):
    def test_png_roundtrip_preserves_each_rgba_channel_and_transparency(self):
        pixels = bytes([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 7, 11, 13, 255])
        self.assertEqual(decode_rgba(encode_rgba(2, 2, pixels)), (2, 2, pixels))

    def test_trimmed_frame_is_restored_to_original_canvas_coordinates(self):
        pixels = bytes(range(4 * 3 * 4))
        image = (4, 3, pixels)
        frame = {'source': [1, 1, 2, 1], 'target': [2, 0, 2, 1]}
        restored = sprite_pixels(image, frame, 5, 2)
        expected = bytearray(40)
        expected[8:16] = pixels[20:28]
        self.assertEqual(restored, bytes(expected))

    def test_invalid_crop_and_png_checksum_are_rejected(self):
        with self.assertRaises(ArchiveError):
            crop_rgba((1, 1, b'\0' * 4), [1, 0, 1, 1])
        png = bytearray(encode_rgba(1, 1, b'\x01\x02\x03\xff'))
        png[50] ^= 1
        with self.assertRaises(ArchiveError):
            decode_rgba(png)

    def test_incomplete_archives_are_rejected(self):
        for data in [b'', b'FORM\0\0\0\0', b'FORM' + struct.pack('<I', 100) + b'GEN8']:
            with self.assertRaises(ArchiveError):
                Archive(data)


ARCHIVE = Path.home() / 'Library/Application Support/Steam/steamapps/common/Undertale/UNDERTALE.app/Contents/Resources/game.ios'
PACK = ROOT / 'public/undertale-original/manifest.json'


@unittest.skipUnless(ARCHIVE.is_file() and PACK.is_file(), 'Owned Steam copy and imported local pack are required for integration checks')
class InstalledCopyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = Archive.open(ARCHIVE)
        cls.pack = json.loads(PACK.read_text())
        cls.pages = {}

    def test_source_identity_and_every_generated_file_hash(self):
        self.assertEqual(hashlib.sha256(self.archive.data).hexdigest(), self.pack['source']['archiveSha256'])
        self.assertEqual(self.pack['source']['bytecode'], 16)
        for entry in self.pack['files']:
            data = (PACK.parent / entry['path']).read_bytes()
            self.assertEqual(len(data), entry['bytes'], entry['path'])
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'], entry['path'])

    def test_every_sprite_frame_has_the_original_pixels_origin_and_bounds(self):
        sprites = self.archive.named('SPRT')
        for name, imported in self.pack['sprites'].items():
            original = self.archive.sprite(sprites[name])
            for field in ['width', 'height', 'origin', 'bbox']:
                self.assertEqual(imported[field], original[field], name + ': ' + field)
            for index, frame in enumerate(original['frames']):
                page = frame['page']
                if page not in self.pages:
                    self.pages[page] = decode_rgba(self.archive.texture_png(page))
                expected = sprite_pixels(self.pages[page], frame, original['width'], original['height'])
                width, height, actual = decode_rgba((PACK.parent / imported['frames'][index]['url']).read_bytes())
                self.assertEqual((width, height), (original['width'], original['height']))
                self.assertEqual(actual, expected, name + ': ' + str(index))

    def test_embedded_effects_and_streamed_music_are_byte_identical(self):
        sounds = self.archive.named('SOND')
        for alias, imported in self.pack['sounds'].items():
            original = self.archive.sound(sounds[imported['name']])
            self.assertEqual((PACK.parent / imported['url']).read_bytes(), self.archive.audio(original['audio']), alias)
            self.assertEqual(imported['volume'], original['volume'])
        for imported in self.pack['music'].values():
            self.assertEqual((PACK.parent / imported['url']).read_bytes(), (ARCHIVE.parent / imported['name']).read_bytes())

    def test_font_glyph_metrics_and_texture_pixels_are_preserved(self):
        fonts = self.archive.named('FONT')
        for name, imported in self.pack['fonts'].items():
            original = self.archive.font(fonts[name])
            self.assertEqual(imported['glyphs'], original['glyphs'])
            texture = original['texture']
            expected = crop_rgba(decode_rgba(self.archive.texture_png(texture['page'])), texture['source'])
            self.assertEqual(decode_rgba((PACK.parent / imported['url']).read_bytes()), expected)

    def test_original_code_symbols_and_entry_boundaries_resolve(self):
        symbols = self.archive.symbols()
        code = self.archive.named('CODE')
        for name in self.pack['codeReference']:
            instructions = self.archive.instructions(code[name], symbols)
            self.assertTrue(instructions, name)
            self.assertTrue(all(i.get('symbol') != '<unresolved>' for i in instructions), name)
            self.assertEqual(sum(i['size'] for i in instructions) * 4, self.archive.u32(code[name] + 4))

    def test_writer_styles_match_the_installed_dialogue_profiles(self):
        styles = self.pack['textStyles']
        self.assertEqual((styles['narrator']['font'], styles['narrator']['spacing'], styles['narrator']['lineHeight']), ('fnt_main', 16, 32))
        self.assertEqual((styles['sans']['font'], styles['sans']['spacing'], styles['sans']['delay']), ('fnt_comicsans', 10, 2))
        self.assertEqual((styles['threat']['font'], styles['threat']['spacing'], styles['threat']['delay'], styles['threat']['sound']), ('fnt_plain', 9, 4, 'snd_nosound'))

    def test_toriel_frames_and_referenced_attack_code_match_the_owned_archive(self):
        metadata = json.loads((ROOT / 'src/daily/toriel-assets.json').read_text())
        self.assertEqual(metadata['sourceArchiveSha256'], self.pack['source']['archiveSha256'])
        original = self.archive.sprite(self.archive.named('SPRT')['spr_firebullet'])
        for field in ['width', 'height', 'origin', 'bbox']:
            self.assertEqual(metadata['sprite'][field], original[field])
        for index, frame in enumerate(original['frames']):
            pixels = sprite_pixels(decode_rgba(self.archive.texture_png(frame['page'])), frame, original['width'], original['height'])
            imported = ROOT / 'public/daily-assets/toriel' / f'fire-{index}.png'
            self.assertEqual(decode_rgba(imported.read_bytes()), (original['width'], original['height'], pixels))
        code = self.archive.named('CODE')
        for name, digest in metadata['code'].items():
            pointer = code[name]
            start = pointer + 12 + self.archive.i32(pointer + 12)
            self.assertEqual(hashlib.sha256(self.archive.read(start, self.archive.u32(pointer + 4))).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
