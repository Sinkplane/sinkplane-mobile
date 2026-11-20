#!/usr/bin/env python3
"""Generates the Sinkplane "Nosedive" icon set from one geometry.

A paper plane (seen from above) dives nose-first through a waterline. Everything is drawn on a
1024 grid; the parts above and below the water are clipped here (not with SVG clip paths) so the
Icon Composer layers stay plain shapes.

    store/logo/make-icons.py      # needs Playwright's chrome-headless-shell and ffmpeg

Writes:
    store/logo/svg/*.svg                    the sources (committed)
    assets/sinkplane.icon/                  iOS Icon Composer icon (Liquid Glass layers)
    assets/images/icon.png                  1024, opaque (Expo's default / legacy icon)
    assets/images/android-icon-*.png        adaptive background / foreground / monochrome
    assets/images/splash-icon.png           rounded tile for the splash screen
    assets/images/favicon.png               48, web
    store/screenshots/play/icon-512.png     Play Console hi-res icon
    store/logo/svg/scene.svg                the plane and ripples alone, for wide artwork
"""

import glob
import json
import math
import os
import shutil
import subprocess
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SVG_DIR = os.path.join(ROOT, 'store', 'logo', 'svg')
IMAGES = os.path.join(ROOT, 'assets', 'images')
ICON_BUNDLE = os.path.join(ROOT, 'assets', 'sinkplane.icon')

# Palette
SKY_TOP, SKY_BOTTOM = '#1b3480', '#4d7bff'
DARK_SKY_TOP, DARK_SKY_BOTTOM = '#0d1a45', '#2a4bb8'  # iOS dark appearance
SEA_TOP, SEA_BOTTOM = '#0f2257', '#081233'
PLANE, PLANE_SHADE = '#ffffff', '#c8d5ff'

WATERLINE = 630
# Plane halves, nose at 0,0 pointing right (the far wing, then the near wing).
PLANE_HALVES = [[(0, 0), (-540, -210), (-400, 0)], [(0, 0), (-400, 0), (-540, 210)]]
DIVE = dict(x=740, y=720, angle=40, scale=0.85)
UNDERWATER_SHIFT = 12  # refraction: the submerged part sits a little to the right
UNDERWATER_OPACITY = 0.32
RIPPLES = [  # cx, cy, rx, ry, stroke width, opacity
    (628, 638, 220, 40, 12, 0.22),
    (628, 636, 135, 24, 14, 0.55),
]


def place(points, dx=0):
    a = math.radians(DIVE['angle'])
    s = DIVE['scale']
    return [
        (DIVE['x'] + dx + s * (x * math.cos(a) - y * math.sin(a)),
         DIVE['y'] + s * (x * math.sin(a) + y * math.cos(a)))
        for x, y in points
    ]


def clip(points, keep_above):
    """Sutherland-Hodgman against the waterline."""
    inside = (lambda p: p[1] <= WATERLINE) if keep_above else (lambda p: p[1] >= WATERLINE)
    out = []
    for i, cur in enumerate(points):
        prev = points[i - 1]
        if inside(cur) != inside(prev):
            t = (WATERLINE - prev[1]) / (cur[1] - prev[1])
            out.append((prev[0] + t * (cur[0] - prev[0]), WATERLINE))
        if inside(cur):
            out.append(cur)
    return out


def path(points):
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in points) + 'Z'


def plane_above(fills):
    return ''.join(
        f'<path d="{path(clip(place(h), True))}" {fill}/>' for h, fill in zip(PLANE_HALVES, fills)
    )


def plane_below(fill):
    shapes = [clip(place(h, UNDERWATER_SHIFT), False) for h in PLANE_HALVES]
    return ''.join(f'<path d="{path(s)}" {fill}/>' for s in shapes if s)


def ripples(color='#fff', opacity_scale=1.0, width_scale=1.0, only=None):
    picked = RIPPLES if only is None else [RIPPLES[i] for i in only]
    return ''.join(
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{color}" '
        f'stroke-opacity="{min(1, o * opacity_scale):.2f}" stroke-width="{w * width_scale:g}"/>'
        for cx, cy, rx, ry, w, o in picked
    )


GRADIENTS = (
    f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
    f'<stop offset="0" stop-color="{SKY_TOP}"/><stop offset="1" stop-color="{SKY_BOTTOM}"/>'
    f'</linearGradient><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">'
    f'<stop offset="0" stop-color="{SEA_TOP}"/><stop offset="1" stop-color="{SEA_BOTTOM}"/>'
    f'</linearGradient></defs>'
)
BACKDROP = (
    f'<rect width="1024" height="{WATERLINE}" fill="url(#sky)"/>'
    f'<rect y="{WATERLINE}" width="1024" height="{1024 - WATERLINE}" fill="url(#sea)"/>'
)
UNDER = plane_below(f'fill="#fff" fill-opacity="{UNDERWATER_OPACITY}"')
ABOVE = plane_above([f'fill="{PLANE}"', f'fill="{PLANE_SHADE}"'])


def svg(body, defs=''):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        f'viewBox="0 0 1024 1024">{defs}{body}</svg>\n'
    )


SOURCES = {
    # Full-bleed icon: App Store / Play / legacy icon.png.
    'full': svg(BACKDROP + UNDER + ripples() + ABOVE, GRADIENTS),
    # The plane and ripples on transparent, for wide artwork (store/frames: App Store header).
    'scene': svg(UNDER + ripples() + ABOVE),
    # Android adaptive layers (the launcher shows the middle 72 of 108dp, moved for parallax).
    'android-background': svg(BACKDROP + UNDER + ripples(), GRADIENTS),
    'android-foreground': svg(ABOVE),
    # Android 13+ themed icon and notification icon: one colour, shape from alpha.
    'monochrome': svg(
        plane_above(['fill="#fff"', 'fill="#fff" fill-opacity="0.6"'])
        + ripples('#fff', opacity_scale=10, width_scale=1.4, only=[1])
    ),
    # Icon Composer layers (iOS 26+). The sky is the document fill.
    'ios-sea': svg(
        f'<rect y="{WATERLINE}" width="1024" height="{1024 - WATERLINE}" fill="{SEA_TOP}"/>'
    ),
    'ios-under': svg(UNDER),
    'ios-ripples': svg(ripples()),
    'ios-plane': svg(ABOVE),
}


def srgb(hex_color, alpha=1.0):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f'srgb:{r:.5f},{g:.5f},{b:.5f},{alpha:.5f}'


ICON_JSON = {
    'fill-specializations': [
        {'value': {'linear-gradient': [srgb(SKY_TOP), srgb(SKY_BOTTOM)]}},
        {
            'appearance': 'dark',
            'value': {'linear-gradient': [srgb(DARK_SKY_TOP), srgb(DARK_SKY_BOTTOM)]},
        },
    ],
    'groups': [
        {
            'name': 'Plane',
            'layers': [
                {
                    'image-name': 'ios-plane.svg',
                    'name': 'plane',
                    # Without this, iOS tints the plane blue in dark mode.
                    'fill-specializations': [
                        {'appearance': 'dark', 'value': {'solid': srgb(PLANE)}},
                    ],
                }
            ],
            'shadow': {'kind': 'neutral', 'opacity': 0.5},
            'translucency': {'enabled': True, 'value': 0.2},
        },
        {
            'name': 'Water',
            'layers': [
                {'image-name': 'ios-ripples.svg', 'name': 'ripples'},
                {'image-name': 'ios-under.svg', 'name': 'submerged plane'},
                {'image-name': 'ios-sea.svg', 'name': 'sea'},
            ],
            'shadow': {'kind': 'none', 'opacity': 0.5},
            'translucency': {'enabled': False, 'value': 0.5},
        },
    ],
    'supported-platforms': {'squares': 'shared'},
}


def chromium():
    found = sorted(glob.glob(os.path.expanduser(
        '~/Library/Caches/ms-playwright/chromium_headless_shell-*/'
        'chrome-headless-shell-*/chrome-headless-shell')))
    if not found:
        raise SystemExit('No headless Chromium found (see store/demo/make-media.sh)')
    return found[-1]


def render(name, out, size, rounded=False, opaque=False):
    """Rasterises svg/<name>.svg to out at size × size."""
    radius = '22.37%' if rounded else '0'
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'page.html')
        with open(page, 'w') as f:
            f.write(
                '<html><body style="margin:0;background:transparent">'
                f'<img src="file://{SVG_DIR}/{name}.svg" '
                f'style="display:block;width:{size}px;height:{size}px;border-radius:{radius}">'
                '</body></html>'
            )
        shot = os.path.join(tmp, 'shot.png')
        subprocess.run(
            [chromium(), '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
             f'--user-data-dir={tmp}/profile', '--allow-file-access-from-files',
             '--force-device-scale-factor=1', '--default-background-color=00000000',
             f'--window-size={size},{size}', f'--screenshot={shot}', f'file://{page}'],
            check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Store icons must not have an alpha channel; everything else keeps it.
        fmt = 'rgb24' if opaque else 'rgba'
        subprocess.run(
            ['ffmpeg', '-loglevel', 'error', '-y', '-i', shot, '-pix_fmt', fmt, out], check=True,
        )
    print(os.path.relpath(out, ROOT))


def main():
    os.makedirs(SVG_DIR, exist_ok=True)
    for name, body in SOURCES.items():
        with open(os.path.join(SVG_DIR, f'{name}.svg'), 'w') as f:
            f.write(body)

    shutil.rmtree(ICON_BUNDLE, ignore_errors=True)
    os.makedirs(os.path.join(ICON_BUNDLE, 'Assets'))
    for layer in ('ios-plane', 'ios-ripples', 'ios-under', 'ios-sea'):
        shutil.copy(os.path.join(SVG_DIR, f'{layer}.svg'), os.path.join(ICON_BUNDLE, 'Assets'))
    with open(os.path.join(ICON_BUNDLE, 'icon.json'), 'w') as f:
        json.dump(ICON_JSON, f, indent=2)
        f.write('\n')
    print(os.path.relpath(ICON_BUNDLE, ROOT))

    render('full', os.path.join(IMAGES, 'icon.png'), 1024, opaque=True)
    render('android-background', os.path.join(IMAGES, 'android-icon-background.png'), 512)
    render('android-foreground', os.path.join(IMAGES, 'android-icon-foreground.png'), 512)
    render('monochrome', os.path.join(IMAGES, 'android-icon-monochrome.png'), 432)
    render('full', os.path.join(IMAGES, 'splash-icon.png'), 512, rounded=True)
    render('full', os.path.join(IMAGES, 'favicon.png'), 48, rounded=True)
    play = os.path.join(ROOT, 'store', 'screenshots', 'play')
    os.makedirs(play, exist_ok=True)
    render('full', os.path.join(play, 'icon-512.png'), 512, opaque=True)


if __name__ == '__main__':
    main()
