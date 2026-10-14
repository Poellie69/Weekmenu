"""Draws the app icons (a calendar on green) as PNGs without extra libraries.

Run: python3 scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

GREEN = (0x2F, 0x7A, 0x4A)
PAPER = (0xF3, 0xF6, 0xF2)
TOMATO = (0xC8, 0x46, 0x2F)


def in_round_rect(x, y, x0, y0, w, h, r):
    if not (x0 <= x < x0 + w and y0 <= y < y0 + h):
        return False
    cx = min(max(x, x0 + r), x0 + w - r)
    cy = min(max(y, y0 + r), y0 + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def color_at(x, y, maskable):
    # Coordinates are in the 512 design grid.
    if maskable:
        # Full-bleed background, artwork shrunk into the safe zone.
        x, y = 256 + (x - 256) / 0.8, 256 + (y - 256) / 0.8
    elif not in_round_rect(x, y, 0, 0, 512, 512, 112):
        return None
    if in_round_rect(x, y, 120, 150, 272, 232, 28):
        if y < 214:
            return TOMATO
        for cx, cy in [(176, 262), (256, 262), (336, 262), (176, 326), (256, 326)]:
            if (x - cx) ** 2 + (y - cy) ** 2 <= 16 * 16:
                return GREEN
        return PAPER
    return GREEN


def render(size, maskable=False, ss=3):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) * 512 / size
                    y = (py + (sy + 0.5) / ss) * 512 / size
                    c = color_at(x, y, maskable)
                    if c:
                        acc[0] += c[0]
                        acc[1] += c[1]
                        acc[2] += c[2]
                        acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            if a:
                row += bytes([acc[0] * 255 // acc[3], acc[1] * 255 // acc[3], acc[2] * 255 // acc[3], a])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


out = Path(__file__).resolve().parent.parent / "public" / "icons"
(out / "icon-192.png").write_bytes(render(192))
(out / "icon-512.png").write_bytes(render(512, ss=2))
(out / "icon-512-maskable.png").write_bytes(render(512, maskable=True, ss=2))
print("icons written to", out)
