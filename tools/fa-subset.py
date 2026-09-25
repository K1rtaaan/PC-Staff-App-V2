#!/usr/bin/env python3
"""Purge Font Awesome 6.5.1 CSS to the icons used in public/index.html and subset the woff2 fonts.
Needs: npm install (for @fortawesome/fontawesome-free) and `pip install fonttools brotli`.
Output: public/assets/fa/fa.css + public/assets/fa/fa-solid-900.woff2 + fa-regular-400.woff2
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FA = os.path.join(HERE, 'node_modules', '@fortawesome', 'fontawesome-free')
OUT = os.path.join(ROOT, 'public', 'assets', 'fa')
os.makedirs(OUT, exist_ok=True)
html = open(os.path.join(ROOT, 'public', 'index.html'), encoding='utf-8').read()
# 3.0: the redesigned screens live in assets/v3.js
_v3 = os.path.join(ROOT, 'public', 'assets', 'v3.js')
if os.path.exists(_v3): html += open(_v3, encoding='utf-8').read()
used = set(re.findall(r'fa-[a-z0-9-]+', html))
css = open(os.path.join(FA, 'css', 'fontawesome.css'), encoding='utf-8').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
rules = re.findall(r'([^{}]+)\{([^{}]*)\}', css)
keep, cps = [], set()
for sel, body in rules:
    sel = sel.strip()
    m = re.search(r'content:\s*"\\([0-9a-f]+)"', body)
    if m and all(re.fullmatch(r'\.fa-[a-z0-9-]+::before', s.strip()) for s in sel.split(',')):
        names = [s.strip()[1:-8] for s in sel.split(',')]
        hit = [n for n in names if n in used]
        if not hit: continue
        cps.add(int(m.group(1), 16))
        sel = ',\n'.join('.' + n + '::before' for n in hit)
    keep.append(sel + '{' + ' '.join(body.split()) + '}')
face = ''
for name, weight in (('fa-solid-900', 900), ('fa-regular-400', 400)):
    face += ("@font-face{font-family:'Font Awesome 6 Free';font-style:normal;font-weight:%d;font-display:block;"
             "src:url('%s.woff2') format('woff2')}\n" % (weight, name))
face += ":root,:host{--fa-style-family-classic:'Font Awesome 6 Free';--fa-font-solid:normal 900 1em/1 'Font Awesome 6 Free';--fa-font-regular:normal 400 1em/1 'Font Awesome 6 Free'}\n"
face += '.fas,.fa-solid{font-weight:900}\n.far,.fa-regular{font-weight:400}\n'
hdr = '/* Font Awesome Free 6.5.1 (subset for PCR Staff App) - https://fontawesome.com - License: Icons CC BY 4.0, Fonts SIL OFL 1.1, Code MIT */\n'
open(os.path.join(OUT, 'fa.css'), 'w').write(hdr + face + '\n'.join(keep) + '\n')
from fontTools import subset
for name in ('fa-solid-900', 'fa-regular-400'):
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']
    font = subset.load_font(os.path.join(FA, 'webfonts', name + '.woff2'), opts)
    s = subset.Subsetter(opts); s.populate(unicodes=cps); s.subset(font)
    subset.save_font(font, os.path.join(OUT, name + '.woff2'), opts)
print('icons used:', len([u for u in used]), 'codepoints:', len(cps))
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))
