"""Download OFL-licensed Noto fonts and create compact offline subsets."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
CARDS = ROOT / "src" / "data" / "cards.generated.json"
TEMP = ROOT / "tmp" / "fonts"
OUTPUT = ROOT / "src" / "assets" / "fonts"

FONTS = {
    "NotoSansJP": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
    "NotoSerifJP": "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifjp/NotoSerifJP%5Bwght%5D.ttf",
}


def download(url: str, target: Path) -> None:
    if target.exists():
        return
    print(f"Downloading {target.name}")
    urllib.request.urlretrieve(url, target)


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cards = json.loads(CARDS.read_text(encoding="utf-8"))

    codepoints = set(range(0x20, 0x100))
    codepoints.update(range(0x400, 0x530))
    codepoints.update(range(0x3000, 0x3100))
    codepoints.update(ord(character) for card in cards for field in (
        card["kanji"], card["furigana"], "".join(card["onyomi"]), "".join(card["kunyomi"]),
    ) for character in field)

    for name, url in FONTS.items():
        source = TEMP / f"{name}.ttf"
        target = OUTPUT / f"{name}.woff2"
        download(url, source)
        font = TTFont(source)
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
        options.name_legacy = True
        options.name_languages = [0x409]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        font.save(target)
        print(f"Wrote {target.name}: {target.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
