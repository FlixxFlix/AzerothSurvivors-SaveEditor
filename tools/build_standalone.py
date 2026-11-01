#!/usr/bin/env python3
"""Build the downloadable editor: one self-contained HTML file and a ZIP around it.

    python tools/build_standalone.py            # version from package.json
    python tools/build_standalone.py v1.2.0     # explicit version (the release workflow passes the tag)

Writes:
    dist/AzerothSurvivors-SaveEditor.html   CSS, scripts and fonts inlined; opens from file:// with no network
    dist/AzerothSurvivors-SaveEditor.zip    that HTML plus README.txt, LICENSE.txt and FONT-LICENSES.txt

The ZIP is reproducible: entries are sorted and carry a fixed timestamp.
"""
import base64
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "AzerothSurvivors-SaveEditor"


def read(path, mode="r"):
    with open(os.path.join(ROOT, path), mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
        return f.read()


def inline_css(css: str, css_dir: str) -> str:
    def font(m):
        path = os.path.normpath(os.path.join(css_dir, m.group(1)))
        data = base64.b64encode(read(path, "rb")).decode("ascii")
        return f'url("data:font/woff2;base64,{data}")'
    out, n = re.subn(r'url\("([^"]+\.woff2)"\)', font, css)
    if n == 0:
        raise SystemExit("no fonts found in style.css")
    return out


def build_html(version: str) -> str:
    html = read("index.html")

    css_tag = '<link rel="stylesheet" href="src/style.css">'
    if css_tag not in html:
        raise SystemExit("stylesheet link not found in index.html")
    css = inline_css(read("src/style.css"), "src")
    html = html.replace(css_tag, "<style>\n" + css + "</style>")

    def script(m):
        code = read(m.group(1))
        if re.search(r"</script", code, re.I):
            raise SystemExit(f"{m.group(1)} contains </script")
        return "<script>\n" + code + "</script>"
    html, n = re.subn(r'<script src="(src/[\w.]+\.js)"></script>', script, html)
    if n != 5:
        raise SystemExit(f"expected 5 scripts in index.html, inlined {n}")

    if 'id="version">dev build<' not in html:
        raise SystemExit("version placeholder not found in index.html")
    html = html.replace('id="version">dev build<', f'id="version">{version}<')
    if re.search(r'(src|href)="(?!https?:|data:|#)[^"]+"', html):
        raise SystemExit("a local reference is left in the standalone HTML")
    return html


README_TXT = """Azeroth Survivors Save Editor {version}
======================================

Open {name}.html in your browser (double-click). It works offline;
nothing is uploaded and the page makes no network requests.

1. In the game: Options -> Saves -> download your save.
2. In the editor: paste the export, open the file, or drop it onto the page.
3. Edit gear, stars, collection, marks, zones, heroic levels or any raw line.
4. Press "Seal & export", then "Save .sav file" or "Copy".
5. In the game: Options -> Saves -> pick the file and confirm.

Keep your original export as a backup. Importing replaces the save in your browser.

Unofficial fan tool, not affiliated with the developer of Azeroth Survivors or
with Blizzard Entertainment.
Source, format notes and command-line tool:
https://github.com/FelixKucher/AzerothSurvivors-SaveEditor
"""


def main() -> None:
    version = sys.argv[1] if len(sys.argv) > 1 else "v" + json.loads(read("package.json"))["version"]
    html = build_html(version)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    html_path = os.path.join(ROOT, "dist", NAME + ".html")
    with open(html_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    fonts = "\n\n".join(
        f"===== {name} =====\n\n" + read(f"fonts/OFL-{key}.txt").strip()
        for key, name in (("cinzel", "Cinzel"), ("alegreya-sans", "Alegreya Sans"), ("ibm-plex-mono", "IBM Plex Mono"))
    )
    entries = {
        f"{NAME}/{NAME}.html": html,
        f"{NAME}/README.txt": README_TXT.format(version=version, name=NAME),
        f"{NAME}/LICENSE.txt": read("LICENSE"),
        f"{NAME}/FONT-LICENSES.txt": "The fonts embedded in the HTML file are licensed under the SIL Open Font License 1.1.\n\n" + fonts + "\n",
    }
    zip_path = os.path.join(ROOT, "dist", NAME + ".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for arc in sorted(entries):
            info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, entries[arc].replace("\r\n", "\n").encode("utf-8"))
    print(f"{version}: {os.path.relpath(html_path, ROOT)} ({len(html.encode()) // 1024} KiB), "
          f"{os.path.relpath(zip_path, ROOT)} ({os.path.getsize(zip_path) // 1024} KiB)")


if __name__ == "__main__":
    main()
