import math
import struct
import zlib
from pathlib import Path


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def icon(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            color = (11, 17, 16)
            dx, dy = (x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5
            radius = math.hypot(dx, dy)
            if any(abs(radius - ring) < 0.006 for ring in (0.29, 0.22, 0.14)):
                color = (115, 158, 124)
            if abs(dx + dy) < 0.014 and radius < 0.32:
                color = (155, 211, 165)
            if radius < 0.036:
                color = (239, 244, 239)
            if abs(dx - 0.205) + abs(dy + 0.205) < 0.066:
                color = (242, 123, 84)
            rows.extend(color)
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    target = Path(__file__).resolve().parent.parent / "icons"
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        (target / name).write_bytes(icon(size))
