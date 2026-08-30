"""Create compact sentence, translation and ruby data for built-in cards.

The resulting JSON is checked in, so runtime users do not need Python models.
Use --translate to refresh Russian translations with Helsinki-NLP/opus-mt-en-ru.
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON_NLP = ROOT / "tmp" / "python-nlp"
if PYTHON_NLP.exists():
    sys.path.insert(0, str(PYTHON_NLP))

SOURCE = ROOT / "tmp" / "jlpt-kanji-dictionary"
OUTPUT = ROOT / "scripts" / "sentence_enrichment.json"
KANJI_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

# Prefer useful, neutral vocabulary when the shortest source example happens to
# be obscure or unsuitable for a beginner-facing learning card.
SENTENCE_WORD_OVERRIDES = {
    "一": "一案",
    "年": "何年",
    "生": "生活",
    "十": "十年",
    "女": "女王",
    "国": "英国",
    "本": "本棚",
    "田": "田んぼ",
    "名": "名誉",
    "近": "付近",
    "品": "粗品",
    "時": "時計",
    "医": "医師",
    "漢": "漢詩",
}

# The translation model is used only to create a draft. These strings are
# deliberately post-edited and kept in source control for reproducible builds.
RU_SENTENCE_OVERRIDES = {
    "一": "Это, безусловно, один из вариантов.",
    "大": "Мы столкнулись с серьёзным кризисом.",
    "年": "На строительство ушло много лет.",
    "出": "Эта пьеса была поставлена им.",
    "本": "Этот книжный шкаф легко собрать.",
    "国": "Вы когда-нибудь бывали в Великобритании?",
    "中": "На склоне холма стоял дом.",
    "子": "Пожалуйста, угощайтесь этими сладостями.",
    "上": "Дорога здесь плавно поднимается.",
    "生": "Старайтесь жить по средствам.",
    "自": "Он умеет постоять за себя.",
    "行": "У неё безупречные манеры.",
    "間": "Сквозь облака пробился луч света.",
    "時": "Который час по вашим часам?",
    "気": "У меня болят суставы, когда холодает.",
    "十": "Мой дядя живёт в Париже уже десять лет.",
    "女": "Королева была одета в роскошный наряд.",
    "三": "Он старше меня на три года.",
    "方": "Местонахождение подозреваемого всё ещё неизвестно.",
    "入": "В стиле этого писателя много вставных конструкций.",
    "場": "Актриса трижды появлялась на сцене.",
    "学": "Немного знаний — опасная вещь.",
    "月": "Завтра состоится вечер любования луной.",
    "田": "Раньше здесь были рисовые поля.",
    "何": "Сколько лет вам исполнится в следующем году?",
    "来": "В газетах объявили о втором издании.",
    "理": "Тебе стоит прибраться в комнате.",
    "同": "Среди женщин о ней хорошо отзываются.",
    "発": "Его несправедливо обвиняют.",
    "高": "Фудзи — самая высокая гора Японии.",
    "作": "Пьеса была создана по роману.",
    "世": "Она сетовала на нынешние времена.",
    "書": "Верни эти книги на книжную полку.",
    "力": "Это зависит от силы огня, посуды и вида моллюсков.",
    "名": "Для меня большая честь быть приглашённым.",
    "金": "Отливка легко вышла из формы.",
    "通": "Подпишите один экземпляр и верните его нам.",
    "文": "Говорят, этот перевод верен оригиналу.",
    "屋": "Я купил бутылку пива в магазине спиртных напитков.",
    "業": "Компания отметила его достижения повышением.",
    "持": "Мы всецело тебя поддерживаем.",
    "道": "Я случайно встретил её на улице.",
    "先": "Хватит пустой лести.",
    "口": "Хватит пустой лести.",
    "川": "Нас обдувал прохладный ветер с реки.",
    "開": "Они провели серию концертов.",
    "教": "Ты решил стать учителем?",
    "近": "В этих окрестностях много современных зданий.",
    "語": "Переведи этот отрывок слово за словом.",
    "問": "Немного знаний — опасная вещь.",
    "水": "Сотни полей оказались затоплены.",
    "真": "Тебе лучше знать правду.",
    "界": "Пьеса высмеивает политический мир.",
    "無": "Я остро ощущаю бренность жизни.",
    "重": "В газетах объявили о втором издании.",
    "員": "Он метит на должность директора.",
    "画": "Изображение на экране телевизора было размытым.",
    "安": "Тебе следует немного полежать в покое.",
    "万": "Я буду на твоей стороне, несмотря ни на что.",
    "仕": "Офицер приказал солдатам наступать.",
    "品": "Это скромный подарок, но, пожалуйста, примите его.",
    "電": "Если коснуться этого провода, ударит током.",
    "音": "Эта гитара настроена.",
    "元": "Он скоро покинет родительский дом.",
    "父": "Отец пристально посмотрел мне в лицо.",
    "風": "Пьеса высмеивает политический мир.",
    "車": "Мне не хотелось, но пришлось расстаться с любимой машиной.",
    "夜": "Сегодня вечером мы устраиваем вечеринку.",
    "空": "Эта еда утолила его голод.",
    "有": "Кен делит комнату со старшим братом.",
    "楽": "Оркестр исполнил несколько маршей.",
    "歩": "Научный прогресс не останавливается.",
    "悪": "Сейчас распространяется сильная простуда.",
    "広": "Товар рекламировали по телевизору.",
    "町": "Я нашёл в городе кое-что необычное.",
    "住": "Остатки пищи становятся рассадником вредителей.",
    "西": "Послеобеденное солнце светит прямо в мою комнату.",
    "古": "Стол, которым пользуется Кен, уже старый.",
    "始": "Я всё время думаю о тебе.",
    "終": "Где конечная остановка этой линии?",
    "校": "Школьный двор был очень маленьким.",
    "計": "Перед измерением разровняйте сахар.",
    "院": "Она выписалась из больницы час назад.",
    "送": "В район бедствия срочно доставили гуманитарную помощь.",
    "族": "Английский и немецкий принадлежат к одной языковой семье.",
    "病": "Медсестра ухаживала за больным.",
    "左": "Он сердито покачал головой.",
    "医": "Этот господин, должно быть, врач.",
    "字": "Ты слишком цепляешься за формулировки.",
    "急": "В район бедствия срочно доставили гуманитарную помощь.",
    "図": "Перечислите членов рода Токугава.",
    "花": "Цветочную клумбу нужно полить.",
    "走": "Не высовывайтесь из окна на ходу.",
    "青": "Весной леса зеленеют.",
    "火": "Это зависит от силы огня, посуды и вида моллюсков.",
    "赤": "Этот красный цвет портит весь узор.",
    "写": "Вчера вечером состоялся специальный предпоказ.",
    "研": "Начало семинара запланировано на 16:00.",
    "飲": "Эта вода пригодна для питья.",
    "肉": "Курица хорошо прожарена.",
    "服": "Он недовольно надул губы.",
    "漢": "Вы когда-нибудь читали китайские стихи?",
    "秋": "Поздняя осень в Шотландии довольно холодная.",
    "堂": "Учитель собрал студентов в актовом зале.",
    "試": "Я ради пробы поднялся на эту гору.",
    "弟": "Я одолжил у двоюродного брата 1000 иен.",
    "雨": "Буря гремела ставнями.",
    "駅": "Я купил эту книгу в книжном магазине возле станции.",
    "昼": "Он не появлялся примерно до полудня.",
    "冬": "По долгосрочному прогнозу, зима будет тёплой.",
    "勉": "Студент проводит много времени за учёбой.",
}


def load_words() -> list[dict]:
    words: list[dict] = []
    for path in glob.glob(str(SOURCE / "dictionary_part_*.json")):
        words.extend(json.loads(Path(path).read_text(encoding="utf-8")))
    return words


def sentence_candidates(kanji: str, words: list[dict]) -> list[dict]:
    candidates: list[dict] = []
    for word in words:
        headword = word.get("kanji", "")
        if kanji not in headword or len(headword) > 4:
            continue
        glossary = word.get("glossary_en", [])
        for index, sentence in enumerate(glossary[:-1]):
            translation = glossary[index + 1].strip()
            if not re.search(r"[。！？]$", sentence.strip()) or not re.search(r"[A-Za-z]", translation):
                continue
            if headword not in sentence or len(sentence) > 72:
                continue
            candidates.append({
                "word": headword,
                "reading": word.get("reading", ""),
                "sentence": sentence.strip(),
                "sentence_en": translation,
                "sequence": int(word.get("sequence") or 9_999_999),
            })
    return candidates


def choose_sentence(kanji: str, words: list[dict]) -> dict:
    candidates = sentence_candidates(kanji, words)
    if not candidates:
        raise RuntimeError(f"No example sentence for {kanji}")
    preferred_word = SENTENCE_WORD_OVERRIDES.get(kanji)
    if preferred_word:
        preferred = [item for item in candidates if item["word"] == preferred_word]
        if preferred:
            candidates = preferred
    word_length_rank = {2: 0, 3: 1, 1: 2, 4: 3}
    return min(candidates, key=lambda item: (
        word_length_rank.get(len(item["word"]), 4),
        abs(len(item["sentence"]) - 15),
        len(item["word"]),
        item["sequence"],
    ))


def split_ruby_segment(original: str, reading: str) -> list[dict]:
    if not KANJI_RE.search(original):
        return [{"text": original}]
    leading = re.match(r"^[\u3040-\u30ffー]+", original)
    trailing = re.search(r"[\u3040-\u30ffー]+$", original)
    prefix = leading.group(0) if leading else ""
    suffix = trailing.group(0) if trailing else ""
    core_end = len(original) - len(suffix) if suffix else len(original)
    core = original[len(prefix):core_end]
    ruby = reading
    if prefix and ruby.startswith(prefix):
        ruby = ruby[len(prefix):]
    if suffix and ruby.endswith(suffix):
        ruby = ruby[:-len(suffix)]
    segments: list[dict] = []
    if prefix:
        segments.append({"text": prefix})
    if core:
        segments.append({"text": core, "reading": ruby or reading})
    if suffix:
        segments.append({"text": suffix})
    return segments


def make_ruby(sentence: str) -> list[dict]:
    import jaconv
    from sudachipy import SplitMode, dictionary

    result: list[dict] = []
    tokenizer = dictionary.Dictionary().create()
    for token in tokenizer.tokenize(sentence, SplitMode.C):
        original = token.surface()
        reading = jaconv.kata2hira(token.reading_form())
        result.extend(split_ruby_segment(original, reading))
    merged: list[dict] = []
    for segment in result:
        if merged and "reading" not in segment and "reading" not in merged[-1]:
            merged[-1]["text"] += segment["text"]
        else:
            merged.append(segment)
    return merged


def translate(sentences: list[str]) -> list[str]:
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    model_name = "Helsinki-NLP/opus-mt-en-ru"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    translations: list[str] = []
    for offset in range(0, len(sentences), 24):
        batch = tokenizer(sentences[offset:offset + 24], return_tensors="pt", padding=True, truncation=True)
        output = model.generate(**batch, max_new_tokens=96, num_beams=4)
        translations.extend(tokenizer.batch_decode(output, skip_special_tokens=True))
        print(f"Translated {min(offset + 24, len(sentences))}/{len(sentences)}")
    return translations


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--translate", action="store_true")
    args = parser.parse_args()
    levels = json.loads((SOURCE / "jlpt-kanji.json").read_text(encoding="utf-8"))
    kanji = [item["kanji"] for item in levels if item["jlpt"] in {"N5", "N4"}]
    words = load_words()
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    entries = {character: choose_sentence(character, words) for character in kanji}
    if args.translate:
        russian = translate([entries[character]["sentence_en"] for character in kanji])
    else:
        russian = [
            existing.get(character, {}).get("sentence_ru", "")
            if existing.get(character, {}).get("sentence_en") == entries[character]["sentence_en"]
            else ""
            for character in kanji
        ]
    for character, translation in zip(kanji, russian, strict=True):
        translation = RU_SENTENCE_OVERRIDES.get(character, translation)
        entries[character]["sentence_ru"] = translation
        entries[character]["ruby"] = make_ruby(entries[character]["sentence"])
        entries[character].pop("sequence", None)
    OUTPUT.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(entries)} sentence examples to {OUTPUT}")


if __name__ == "__main__":
    main()
