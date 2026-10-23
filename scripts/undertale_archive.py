"""Read-only reader for GameMaker Studio 1.4 bytecode-16 archives.

Format reference: UndertaleModTool's UndertaleModLib models. No third-party
code, packages, game installation changes, or executable game code are required.
"""
from __future__ import annotations

import binascii
import struct
import zlib
from pathlib import Path


class ArchiveError(ValueError):
    pass


class Archive:
    def __init__(self, data: bytes):
        self.data = data
        if len(data) < 8 or data[:4] != b'FORM' or self.u32(4) + 8 != len(data):
            raise ArchiveError('Expected a complete GameMaker FORM archive')
        self.chunks: dict[str, tuple[int, int]] = {}
        at = 8
        while at < len(data):
            tag = self.read(at, 4).decode('ascii')
            size = self.u32(at + 4)
            self.read(at + 8, size)
            if tag in self.chunks:
                raise ArchiveError(f'Duplicate chunk {tag}')
            self.chunks[tag] = (at + 8, size)
            at += 8 + size
        if 'GEN8' not in self.chunks:
            raise ArchiveError('Missing GEN8 chunk')
        gen = self.chunks['GEN8'][0]
        self.bytecode = self.data[gen + 1]
        self.runtime = struct.unpack_from('<4I', data, gen + 44)
        if self.bytecode != 16 or self.runtime[0] != 1:
            raise ArchiveError(f'Unsupported format: bytecode {self.bytecode}, runtime {self.runtime}')

    @classmethod
    def open(cls, path: Path) -> Archive:
        return cls(path.read_bytes())

    def read(self, at: int, size: int) -> bytes:
        if at < 0 or size < 0 or at + size > len(self.data):
            raise ArchiveError(f'Archive pointer out of bounds at {at} ({size} bytes)')
        return self.data[at:at + size]

    def u32(self, at: int) -> int:
        return struct.unpack('<I', self.read(at, 4))[0]

    def i32(self, at: int) -> int:
        return struct.unpack('<i', self.read(at, 4))[0]

    def string(self, pointer: int) -> str:
        size = self.u32(pointer - 4)
        value = self.read(pointer, size)
        if self.read(pointer + size, 1) != b'\0':
            raise ArchiveError('Unterminated archive string')
        return value.decode('utf-8')

    def entries(self, tag: str) -> list[int]:
        start, size = self.chunks[tag]
        count = self.u32(start)
        if 4 + count * 4 > size:
            raise ArchiveError(f'Invalid {tag} pointer list')
        pointers = list(struct.unpack('<' + 'I' * count, self.read(start + 4, count * 4)))
        for pointer in pointers:
            self.read(pointer, 1)
        return pointers

    def named(self, tag: str) -> dict[str, int]:
        return {self.string(self.u32(p)): p for p in self.entries(tag)}

    def texture_item(self, pointer: int) -> dict:
        sx, sy, sw, sh, tx, ty, tw, th, bw, bh, page = struct.unpack('<10Hh', self.read(pointer, 22))
        if page < 0 or page >= len(self.entries('TXTR')):
            raise ArchiveError(f'Invalid texture page {page}')
        return dict(source=[sx, sy, sw, sh], target=[tx, ty, tw, th], bounding=[bw, bh], page=page)

    def sprite(self, pointer: int) -> dict:
        values = struct.unpack('<14I', self.read(pointer, 56))
        count = self.u32(pointer + 56)
        if count == 0xFFFFFFFF or count > 10000:
            raise ArchiveError('Unsupported special sprite')
        frames = [self.texture_item(self.u32(pointer + 60 + i * 4)) for i in range(count)]
        return dict(width=values[1], height=values[2], origin=[self.i32(pointer + 48), self.i32(pointer + 52)], bbox=[values[3], values[6], values[4], values[5]], frames=frames)

    def texture_png(self, page: int) -> bytes:
        pointer = self.entries('TXTR')[page]
        at = self.u32(pointer + 4)
        start = at
        if self.read(at, 8) != b'\x89PNG\r\n\x1a\n':
            raise ArchiveError('Unsupported texture encoding (expected PNG)')
        at += 8
        while True:
            size = struct.unpack('>I', self.read(at, 4))[0]
            tag = self.read(at + 4, 4)
            self.read(at + 8, size + 4)
            at += 12 + size
            if tag == b'IEND':
                return self.read(start, at - start)

    def font(self, pointer: int) -> dict:
        texture = self.texture_item(self.u32(pointer + 28))
        count = self.u32(pointer + 40)
        glyphs = {}
        for i in range(count):
            p = self.u32(pointer + 44 + i * 4)
            char, x, y, w, h, shift, offset = struct.unpack('<5H2h', self.read(p, 14))
            pairs = struct.unpack('<H', self.read(p + 14, 2))[0]
            kerning = [list(struct.unpack('<2h', self.read(p + 16 + j * 4, 4))) for j in range(pairs)]
            glyphs[str(char)] = dict(x=x, y=y, w=w, h=h, shift=shift, offset=offset, kerning=kerning)
        return dict(emSize=self.u32(pointer + 8), texture=texture, glyphs=glyphs, scale=list(struct.unpack('<2f', self.read(pointer + 32, 8))))

    def sound(self, pointer: int) -> dict:
        flags = self.u32(pointer + 4)
        filename = self.string(self.u32(pointer + 12))
        volume, pitch = struct.unpack('<2f', self.read(pointer + 20, 8))
        group, audio = struct.unpack('<2i', self.read(pointer + 28, 8))
        return dict(flags=flags, filename=filename, volume=volume, pitch=pitch, group=group, audio=audio)

    def audio(self, index: int) -> bytes:
        p = self.entries('AUDO')[index]
        return self.read(p + 4, self.u32(p))

    def symbols(self) -> dict[int, str]:
        names = {}
        for tag in ('VARI', 'FUNC'):
            start, size = self.chunks[tag]
            if tag == 'VARI':
                records = range(start + 12, start + size, 20)
                occurrence_offset = 12
            else:
                records = range(start + 4, start + 4 + self.u32(start) * 12, 12)
                occurrence_offset = 4
            for record in records:
                name = self.string(self.u32(record))
                count = self.u32(record + occurrence_offset)
                address = self.u32(record + occurrence_offset + 4)
                for i in range(count):
                    names[address] = name
                    if i < count - 1:
                        address += self.u32(address + 4) & 0x07FFFFFF
        return names

    def instructions(self, pointer: int, symbols: dict[int, str] | None = None) -> list[dict]:
        symbols = symbols if symbols is not None else self.symbols()
        strings = self.entries('STRG')
        opcodes = {7: 'conv', 8: 'mul', 9: 'div', 10: 'rem', 11: 'mod', 12: 'add', 13: 'sub', 14: 'and', 15: 'or', 16: 'xor', 17: 'neg', 18: 'not', 19: 'shl', 20: 'shr', 21: 'cmp', 69: 'pop', 132: 'pushi', 134: 'dup', 156: 'ret', 157: 'exit', 158: 'popz', 182: 'b', 183: 'bt', 184: 'bf', 186: 'pushenv', 187: 'popenv', 192: 'push', 193: 'pushloc', 194: 'pushglb', 195: 'pushbltn', 217: 'call', 255: 'break'}
        start = pointer + 12 + self.i32(pointer + 12)
        end = start + self.u32(pointer + 4)
        at, result = start, []
        while at < end:
            word = self.u32(at)
            op, type1, type2 = word >> 24, (word >> 16) & 15, (word >> 20) & 15
            if op not in opcodes:
                raise ArchiveError(f'Unknown opcode {op:#x} at {at}')
            instruction = dict(address=(at - start) // 4, op=opcodes[op], type=type1, type2=type2)
            size = 4
            if op in (0xC0, 0xC1, 0xC2, 0xC3, 0x84):
                if type1 == 15:
                    instruction['value'] = struct.unpack('<h', self.read(at, 2))[0]
                elif type1 in (0, 3):
                    size = 12
                    instruction['value'] = struct.unpack('<d' if type1 == 0 else '<q', self.read(at + 4, 8))[0]
                else:
                    size = 8
                    if type1 == 6:
                        instruction['value'] = self.string(strings[self.u32(at + 4)] + 4)
                    elif type1 == 5:
                        instruction['symbol'] = symbols.get(at, '<unresolved>')
                        instruction['scope'] = struct.unpack('<h', self.read(at, 2))[0]
                        instruction['referenceType'] = self.u32(at + 4) >> 24 & 0xF8
                    else:
                        instruction['value'] = self.i32(at + 4)
            elif op == 0x45 and type1 != 15:
                size = 8
                instruction.update(symbol=symbols.get(at, '<unresolved>'), scope=struct.unpack('<h', self.read(at, 2))[0], referenceType=self.u32(at + 4) >> 24 & 0xF8)
            elif op == 0xD9:
                size = 8
                instruction.update(symbol=symbols.get(at, '<unresolved>'), argc=word & 0xFFFF)
            elif op in (0xB6, 0xB7, 0xB8, 0xBA, 0xBB):
                offset = word & 0x7FFFFF
                if offset & 0x400000:
                    offset -= 0x800000
                instruction['target'] = instruction['address'] + offset
            elif op == 0x15:
                instruction['comparison'] = (word >> 8) & 255
            elif op == 0x86:
                instruction['extra'] = word & 255
            instruction['size'] = size // 4
            result.append(instruction)
            at += size
        if at != end:
            raise ArchiveError('Instruction exceeds its code entry')
        return result


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', binascii.crc32(tag + data) & 0xFFFFFFFF)


def encode_rgba(width: int, height: int, pixels: bytes) -> bytes:
    if len(pixels) != width * height * 4:
        raise ArchiveError('Invalid RGBA pixel count')
    stride = width * 4
    rows = b''.join(b'\0' + pixels[y * stride:(y + 1) * stride] for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0)) + png_chunk(b'IDAT', zlib.compress(rows, 9)) + png_chunk(b'IEND', b'')


def decode_rgba(png: bytes) -> tuple[int, int, bytes]:
    if png[:8] != b'\x89PNG\r\n\x1a\n':
        raise ArchiveError('Not a PNG')
    width, height, depth, color, compression, filtering, interlace = struct.unpack_from('>2I5B', png, 16)
    if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise ArchiveError('Expected noninterlaced 8-bit RGBA texture')
    parts, at = [], 8
    while at < len(png):
        size = struct.unpack_from('>I', png, at)[0]
        tag = png[at + 4:at + 8]
        payload = png[at + 8:at + 8 + size]
        if len(payload) != size or binascii.crc32(tag + payload) & 0xFFFFFFFF != struct.unpack_from('>I', png, at + 8 + size)[0]:
            raise ArchiveError('Invalid PNG chunk')
        if tag == b'IDAT':
            parts.append(payload)
        at += size + 12
    raw = zlib.decompress(b''.join(parts))
    stride = width * 4
    if len(raw) != (stride + 1) * height:
        raise ArchiveError('Invalid PNG pixel payload')
    pixels = bytearray(stride * height)
    previous = bytearray(stride)
    for y in range(height):
        at = y * (stride + 1)
        kind = raw[at]
        row = bytearray(raw[at + 1:at + stride + 1])
        if kind not in range(5):
            raise ArchiveError('Invalid PNG row filter')
        if kind:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                above = previous[x]
                upper_left = previous[x - 4] if x >= 4 else 0
                if kind == 1:
                    predictor = left
                elif kind == 2:
                    predictor = above
                elif kind == 3:
                    predictor = (left + above) // 2
                else:
                    p = left + above - upper_left
                    distances = [abs(p - left), abs(p - above), abs(p - upper_left)]
                    predictor = [left, above, upper_left][distances.index(min(distances))]
                row[x] = (row[x] + predictor) & 255
        pixels[y * stride:(y + 1) * stride] = row
        previous = row
    return width, height, bytes(pixels)


def crop_rgba(image: tuple[int, int, bytes], rect: list[int]) -> tuple[int, int, bytes]:
    width, height, pixels = image
    x, y, w, h = rect
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height:
        raise ArchiveError(f'Invalid texture rectangle {rect} in {width}×{height}')
    return w, h, b''.join(pixels[((y + row) * width + x) * 4:((y + row) * width + x + w) * 4] for row in range(h))


def sprite_pixels(image: tuple[int, int, bytes], frame: dict, width: int, height: int) -> bytes:
    sw, sh, crop = crop_rgba(image, frame['source'])
    x, y, tw, th = frame['target']
    if (sw, sh) != (tw, th) or x + sw > width or y + sh > height:
        raise ArchiveError('Scaled or out-of-bounds texture target is unsupported')
    pixels = bytearray(width * height * 4)
    for row in range(sh):
        start = ((y + row) * width + x) * 4
        pixels[start:start + sw * 4] = crop[row * sw * 4:(row + 1) * sw * 4]
    return bytes(pixels)
