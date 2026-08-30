"""Build the compact offline N5/N4 card bundle from licensed source datasets."""

from __future__ import annotations

import gzip
import json
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KANJI_LIST = ROOT / "tmp" / "jlpt-kanji-dictionary" / "jlpt-kanji.json"
KANJIDIC = ROOT / "tmp" / "kanjidic2.xml.gz"
DICTIONARY_DIR = ROOT / "tmp" / "jlpt-kanji-dictionary"
OUTPUT = ROOT / "src" / "data" / "cards.generated.json"
SENTENCE_ENRICHMENT = ROOT / "scripts" / "sentence_enrichment.json"

RU_FALLBACK = {
    "人": "человек", "入": "входить; вставлять", "名": "имя; известный",
    "聞": "слышать; спрашивать", "電": "электричество", "読": "читать",
    "休": "отдыхать; выходной", "自": "сам; себя", "思": "думать",
    "立": "стоять; вставать", "動": "двигаться; движение", "同": "одинаковый; тот же",
    "持": "держать; иметь", "不": "не-; отрицание", "開": "открывать",
    "教": "учить; учение", "近": "близкий; недалеко", "以": "посредством; начиная с",
    "界": "мир; граница", "使": "использовать; посылать", "仕": "служить; работа",
    "足": "нога; быть достаточным", "特": "особый", "起": "вставать; начинаться",
    "料": "плата; материал", "帰": "возвращаться домой", "広": "широкий; просторный",
    "住": "жить; проживать", "売": "продавать", "待": "ждать",
    "始": "начинать", "送": "посылать; провожать", "族": "семья; племя",
    "映": "отражать; показывать", "買": "покупать", "早": "рано; быстрый",
    "建": "строить", "止": "останавливать", "英": "Англия; английский; выдающийся",
    "走": "бежать", "答": "ответ; отвечать", "写": "копировать; фотографировать",
    "去": "уходить; прошлое", "研": "изучать; шлифовать", "飲": "пить",
    "究": "исследовать", "習": "учиться", "試": "пробовать; экзамен",
    "借": "брать взаймы; арендовать", "曜": "день недели", "漢": "Китай; китайский",
    "貸": "давать взаймы", "勉": "усилие; старание",
}

# Concise, learner-friendly meanings for entries where a single-character JMdict
# headword is archaic, grammatical, a surname, or otherwise misleading in a card.
RU_OVERRIDE = {
    "大": "большой; крупный", "見": "видеть; смотреть", "中": "середина; внутри",
    "生": "жизнь; рождение", "行": "идти; движение", "前": "впереди; перед",
    "後": "позади; после", "長": "длинный; глава", "下": "низ; под; спускаться",
    "来": "приходить; следующий", "話": "говорить; рассказ", "山": "гора",
    "書": "писать; книга", "金": "золото; деньги", "外": "снаружи; внешний",
    "先": "впереди; предыдущий", "東": "восток", "白": "белый", "車": "машина; транспорт",
    "半": "половина", "土": "земля; почва", "西": "запад", "校": "школа",
    "右": "правый; справа", "南": "юг", "左": "левый; слева", "友": "друг",
    "毎": "каждый", "午": "полдень", "言": "говорить; слово", "二": "два",
    "三": "три", "上": "верх; над; подниматься", "年": "год", "小": "маленький",
    "高": "высокий; дорогой", "家": "дом; семья", "私": "я; частный",
    "者": "человек; тот, кто", "事": "дело; вещь; обстоятельство", "会": "встречаться; собрание",
    "的": "цель; суффикс свойства", "方": "направление; способ", "目": "глаз; пункт",
    "場": "место", "代": "замена; поколение", "社": "компания; синтоистский храм",
    "知": "знать; мудрость", "理": "причина; логика", "発": "отправление; выпуск",
    "作": "делать; произведение", "新": "новый", "度": "степень; раз",
    "明": "светлый; ясный", "意": "намерение; смысл", "用": "применение; дело",
    "主": "главный; хозяин", "通": "проходить; движение", "文": "текст; письменность",
    "業": "работа; занятие", "道": "дорога; путь", "身": "тело; сам",
    "多": "много", "考": "думать; обдумывать", "問": "вопрос; спрашивать",
    "正": "правильный; справедливый", "真": "истина; настоящий", "切": "резать; важный",
    "重": "тяжёлый; важный", "集": "собирать; собрание", "員": "член; сотрудник",
    "公": "общественный; официальный", "画": "рисунок; черта", "安": "дешёвый; спокойный",
    "強": "сильный", "題": "тема; заголовок", "仕": "служить; работа",
    "足": "нога; хватать", "着": "прибывать; надевать", "元": "начало; основа",
    "風": "ветер; стиль", "空": "небо; пустой", "有": "иметь; существовать",
    "運": "переносить; удача", "楽": "удовольствие; лёгкий; музыка", "悪": "плохой; зло",
    "店": "магазин", "町": "городок; квартал", "古": "старый; древний",
    "終": "заканчивать; конец", "計": "считать; план", "院": "учреждение; палата",
    "台": "подставка; счётный суффикс", "室": "комната", "可": "можно; возможный",
    "転": "поворачивать; перемещаться", "工": "ремесло; строительство", "急": "спешить; срочный",
    "英": "Англия; английский", "注": "наливать; примечание", "館": "здание; зал",
    "験": "испытание; эффект", "服": "одежда", "洋": "океан; западный",
    "堂": "зал; храм", "弟": "младший брат", "夕": "вечер", "飯": "рис; еда",
    "肉": "мясо", "一": "один", "無": "ничто; отсутствие",
}


def clean_gloss(value: str) -> str:
    value = re.sub(r"^\s*\d+[).]?\s*", "", value)
    value = re.sub(r"^\s*(?:\(+[^)]]*\)+|\{[^}]*\}|:)\s*", "", value)
    value = re.split(r"\s+(?:\(ср\.|\(\(ср\.|\{[^}]+\})", value, maxsplit=1)[0]
    value = re.sub(r"\s*\([^)]*\)\s*$", "", value)
    value = value.strip(" ;,.")
    if len(value) > 72:
        value = value.split(";")[0].strip()
    return value


def load_words() -> list[dict]:
    words: list[dict] = []
    for path in sorted(DICTIONARY_DIR.glob("dictionary_part_*.json")):
        words.extend(json.loads(path.read_text(encoding="utf-8")))
    return words


def load_kanjidic() -> dict[str, dict]:
    with gzip.open(KANJIDIC, "rb") as stream:
        root = ET.parse(stream).getroot()

    result: dict[str, dict] = {}
    for character in root.findall("character"):
        literal = character.findtext("literal")
        if not literal:
            continue
        readings = character.find("reading_meaning")
        groups = readings.findall("rmgroup") if readings is not None else []
        onyomi: list[str] = []
        kunyomi: list[str] = []
        meanings_en: list[str] = []
        for group in groups:
            for reading in group.findall("reading"):
                reading_type = reading.attrib.get("r_type")
                if reading_type == "ja_on":
                    onyomi.append(reading.text or "")
                elif reading_type == "ja_kun":
                    kunyomi.append(reading.text or "")
            for meaning in group.findall("meaning"):
                if "m_lang" not in meaning.attrib and meaning.text:
                    meanings_en.append(meaning.text)
        result[literal] = {
            "onyomi": list(dict.fromkeys(filter(None, onyomi))),
            "kunyomi": list(dict.fromkeys(filter(None, kunyomi))),
            "meanings_en": list(dict.fromkeys(filter(None, meanings_en))),
            "grade": int(character.findtext("misc/grade")) if character.findtext("misc/grade") else None,
        }
    return result


def entry_score(entry: dict, meanings: list[str]) -> int:
    entry_text = " ".join(entry.get("glossary_en", [])[:8]).lower()
    score = 4 if entry.get("glossary_ru") else 0
    for meaning in meanings:
        normalized = meaning.lower().strip()
        if normalized and normalized in entry_text:
            score += 8
        for token in re.findall(r"[a-z]{3,}", normalized):
            if token in entry_text:
                score += 1
    return score


def main() -> None:
    levels = json.loads(KANJI_LIST.read_text(encoding="utf-8"))
    selected = {item["kanji"]: item for item in levels if item["jlpt"] in {"N5", "N4"}}
    words = load_words()
    kanjidic = load_kanjidic()
    sentence_examples = json.loads(SENTENCE_ENRICHMENT.read_text(encoding="utf-8"))

    exact: dict[str, list[dict]] = {}
    containing: dict[str, list[dict]] = {kanji: [] for kanji in selected}
    for word in words:
        text = word.get("kanji", "")
        if text in selected:
            exact.setdefault(text, []).append(word)
        if 1 < len(text) <= 4:
            for kanji in set(text) & selected.keys():
                if len(containing[kanji]) < 12:
                    containing[kanji].append(word)

    cards: list[dict] = []
    missing_ru: list[str] = []
    for kanji, base in selected.items():
        detail = kanjidic.get(kanji, {})
        exact_options = sorted(
            exact.get(kanji, []),
            key=lambda value: (-entry_score(value, detail.get("meanings_en", [])), int(value.get("sequence") or 9_999_999)),
        )
        best = exact_options[0] if exact_options else {}
        ru_items = [clean_gloss(item) for item in best.get("glossary_ru", []) if clean_gloss(item)]
        en_items = detail.get("meanings_en", []) or best.get("glossary_en", [])
        meaning_ru = RU_OVERRIDE.get(kanji, ru_items[0] if ru_items else "")
        if not meaning_ru:
            missing_ru.append(kanji)
            meaning_ru = RU_FALLBACK.get(kanji, "; ".join(en_items[:3]))

        examples = []
        for word in containing.get(kanji, []):
            gloss_ru = [clean_gloss(item) for item in word.get("glossary_ru", []) if clean_gloss(item)]
            gloss_en = [clean_gloss(item) for item in word.get("glossary_en", []) if clean_gloss(item)]
            if not word.get("reading") or not (gloss_ru or gloss_en):
                continue
            examples.append({
                "word": word["kanji"],
                "reading": word["reading"],
                "meaning_ru": "; ".join(gloss_ru[:2]),
                "meaning_en": "; ".join(gloss_en[:2]),
            })
            if len(examples) == 2:
                break

        if usage := sentence_examples.get(kanji):
            examples.insert(0, {
                "word": usage["word"],
                "reading": usage["reading"],
                "meaning_ru": "",
                "meaning_en": "",
                "sentence": usage["sentence"],
                "sentence_ru": usage["sentence_ru"],
                "sentence_en": usage["sentence_en"],
                "ruby": usage["ruby"],
            })
            examples = examples[:2]

        kunyomi = detail.get("kunyomi", [])
        onyomi = detail.get("onyomi", [])
        furigana = (best.get("reading") or (kunyomi[0] if kunyomi else (onyomi[0] if onyomi else ""))).replace(".", "")
        cards.append({
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"kanjiwidget:{kanji}")),
            "kanji": kanji,
            "onyomi": onyomi,
            "kunyomi": kunyomi,
            "furigana": furigana,
            "meaning_ru": meaning_ru,
            "meaning_en": "; ".join(en_items[:4]),
            "jlpt": base["jlpt"],
            "grade": detail.get("grade"),
            "strokes": base.get("strokes"),
            "tags": [base["jlpt"]],
            "examples": examples,
        })

    cards.sort(key=lambda item: (item["jlpt"] != "N5", selected[item["kanji"]].get("frequency") or 99999))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(cards, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(cards)} cards to {OUTPUT}")
    untranslated = [item["kanji"] for item in cards if not re.search(r"[а-яё]", item["meaning_ru"], re.I)]
    print(f"Cards using curated Russian fallback: {len(missing_ru)}")
    print(f"Cards still missing Russian text: {len(untranslated)}")


if __name__ == "__main__":
    main()
