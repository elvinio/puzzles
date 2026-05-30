#!/usr/bin/env python3
"""Dependency-free PWA icon generator (stdlib only).

Paints the Puzzles app icon (dark rounded tile + purple panel + 2x2 game tiles)
at 192 & 512 px with 3x supersampling for smooth edges, and writes PNGs via
zlib. Used as a fallback when no SVG rasterizer (rsvg/ImageMagick/inkscape) is
available. Run: python3 tools/gen-icons.py
"""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
SS = 3  # supersample factor

BG     = (0x13, 0x11, 0x1c)
PANEL  = (0x6d, 0x28, 0xd9)
TILE   = (0xa7, 0x8b, 0xfa)


def rrect_cov(x, y, x0, y0, x1, y1, r):
    """Coverage (0/1) of point (x,y) inside a rounded rect."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    # corners
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r),
                   (x0 + r, y1 - r), (x1 - r, y1 - r)):
        in_corner_box = (
            (x < x0 + r and y < y0 + r and cx == x0 + r and cy == y0 + r) or
            (x > x1 - r and y < y0 + r and cx == x1 - r and cy == y0 + r) or
            (x < x0 + r and y > y1 - r and cx == x0 + r and cy == y1 - r) or
            (x > x1 - r and y > y1 - r and cx == x1 - r and cy == y1 - r)
        )
        if in_corner_box:
            return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return True


def render(size):
    S = size * SS
    # Big buffer at supersample resolution, RGB tuples.
    buf = [[BG[0], BG[1], BG[2]] for _ in range(S * S)]

    def put(px, py, color):
        buf[py * S + px] = [color[0], color[1], color[2]]

    # geometry in supersample space
    bg_r    = int(0.1875 * S)
    panel_i = int(0.109 * S)               # inset
    panel_r = int(0.14 * S)
    tile_gap = int(0.045 * S)
    p0 = panel_i
    p1 = S - panel_i
    pw = p1 - p0
    tile_r = int(0.06 * S)
    half = (pw - tile_gap) / 2.0
    tiles = [
        (p0, p0, p0 + half, p0 + half),
        (p0 + half + tile_gap, p0, p1, p0 + half),
        (p0, p0 + half + tile_gap, p0 + half, p1),
        (p0 + half + tile_gap, p0 + half + tile_gap, p1, p1),
    ]

    for py in range(S):
        for px in range(S):
            # background rounded tile
            if not rrect_cov(px, py, 0, 0, S - 1, S - 1, bg_r):
                continue
            put(px, py, BG)
            # panel
            if rrect_cov(px, py, p0, p0, p1, p1, panel_r):
                put(px, py, PANEL)
                # game tiles
                for (tx0, ty0, tx1, ty1) in tiles:
                    if rrect_cov(px, py, tx0, ty0, tx1, ty1, tile_r):
                        put(px, py, TILE)
                        break

    # downsample SSxSS box average -> size, with alpha (transparent outside bg)
    out = bytearray()
    for y in range(size):
        out.append(0)  # filter type 0
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    sx, sy = x * SS + dx, y * SS + dy
                    inside = rrect_cov(sx, sy, 0, 0, S - 1, S - 1, bg_r)
                    if inside:
                        c = buf[sy * S + sx]
                        r += c[0]; g += c[1]; b += c[2]; a += 255
            n = SS * SS
            out += bytes((r // n, g // n, b // n, a // n))
    return png_bytes(size, size, bytes(out))


def png_bytes(w, h, raw):
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main():
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        data = render(s)
        with open(os.path.join(OUT, "icon-%d.png" % s), "wb") as f:
            f.write(data)
        print("wrote icon-%d.png (%d bytes)" % (s, len(data)))
    # maskable reuses the 512 art (glyph sits well inside the safe zone)
    import shutil
    shutil.copy(os.path.join(OUT, "icon-512.png"), os.path.join(OUT, "icon-512-maskable.png"))
    print("wrote icon-512-maskable.png")


if __name__ == "__main__":
    main()
