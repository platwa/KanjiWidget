const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo', りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  いぇ: 'ye', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che',
  てぃ: 'ti', てゅ: 'tyu', とぅ: 'tu', でぃ: 'di', でゅ: 'dyu', どぅ: 'du',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', ゔゅ: 'vyu',
}

const MACRON: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' }

function hiragana(value: string) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0)
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character
  }).join('')
}

function nextSyllable(value: string, index: number) {
  const pair = value.slice(index, index + 2)
  return KANA[pair] ? { value: KANA[pair], length: 2 } : { value: KANA[value[index]] ?? value[index], length: 1 }
}

function lengthen(result: string, vowel?: string) {
  if (!vowel) return result
  const index = result.lastIndexOf(vowel)
  return index < 0 ? result : `${result.slice(0, index)}${MACRON[vowel]}${result.slice(index + 1)}`
}

/** Modified Hepburn rōmaji for a kana reading. */
export function romanizeKana(reading: string) {
  const value = hiragana(reading.trim())
  if (!value || /[々〇〻㐀-鿿豈-﫿]/u.test(value)) return ''
  let result = ''
  let previousVowel = ''
  let geminate = false
  for (let index = 0; index < value.length;) {
    const character = value[index]
    if (character === 'っ') {
      geminate = true
      index += 1
      continue
    }
    if (character === 'ー') {
      result = lengthen(result, previousVowel)
      index += 1
      continue
    }
    const syllable = nextSyllable(value, index)
    let latin = syllable.value
    if (character === 'ん') {
      const following = nextSyllable(value, index + syllable.length).value
      if (/^[aeiouy]/.test(following)) latin = "n'"
    }
    if (geminate) {
      latin = `${latin.startsWith('ch') ? 't' : latin.match(/^[bcdfghjklmnpqrstvwxyz]/)?.[0] ?? ''}${latin}`
      geminate = false
    }
    const vowel = latin.match(/[aeiou](?!.*[aeiou])/)?.[0] ?? ''
    const isLong = previousVowel && (vowel === previousVowel || (previousVowel === 'o' && latin === 'u'))
    if (isLong && result && (/^[aiueo]$/.test(latin) || (previousVowel === 'o' && latin === 'u'))) {
      result = lengthen(result, previousVowel)
    } else {
      result += latin
    }
    previousVowel = vowel
    index += syllable.length
  }
  return result
}
