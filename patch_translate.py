from pathlib import Path
p=Path('lib/translations.ts')
text=p.read_text(encoding='utf-8')
old = '''export function translate(

  language: LanguageCode,

  englishPhrase: string,

  fallbackUrdu?: string

): string {

  const entry = TRANSLATION_DICTIONARY[englishPhrase];

  if (entry) {
    if (language === 'english') {
      return entry[0];
    }
    if (language === 'urdu') {
      return entry[1];
    }
    return entry[0];
  }

  if (language === 'urdu') {
    return fallbackUrdu ?? englishPhrase;
  }

  return englishPhrase;

}
'''
new = '''export function translate(
  language: LanguageCode,
  englishPhrase: string,
  fallbackUrdu?: string
): string {
  const fixMojibake = (value: string) => {
    try {
      const decoded = Buffer.from(value, 'binary').toString('utf8')
      const hasArabic = /[\u0600-\u06FF]/.test(decoded)
      if (hasArabic):
        return decoded
    except Exception:
      pass
    return value
  }

  const entry = TRANSLATION_DICTIONARY[englishPhrase]

  if (entry):
    if (language == 'english'):
      return entry[0]
    if (language == 'urdu'):
      return fixMojibake(entry[1])
    return entry[0]

  if (language == 'urdu'):
    return fixMojibake(fallbackUrdu or englishPhrase)

  return englishPhrase

}
'''
if old not in text:
    print('old block not found')
else:
    p.write_text(text.replace(old, new), encoding='utf-8')
    print('replaced')
