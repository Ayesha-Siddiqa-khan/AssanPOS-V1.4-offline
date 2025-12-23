from pathlib import Path
p=Path('lib/translations.ts')
text=p.read_text(encoding='utf-8')
start=text.index('export function translate')
end=text.index('export function registerTranslation', start)
new_block = '''export function translate(
  language: LanguageCode,
  englishPhrase: string,
  fallbackUrdu?: string
): string {
  const fixMojibake = (value: string) => {
    try {
      const decoded = Buffer.from(value, 'binary').toString('utf8');
      const hasArabic = /[\u0600-\u06ff]/.test(decoded);
      if (hasArabic) {
        return decoded;
      }
    } catch {
      // ignore decode issues
    }
    return value;
  };

  const entry = TRANSLATION_DICTIONARY[englishPhrase];

  if (entry) {
    if (language === 'english') {
      return entry[0];
    }
    if (language === 'urdu') {
      return fixMojibake(entry[1]);
    }
    return entry[0];
  }

  if (language === 'urdu') {
    return fixMojibake(fallbackUrdu ?? englishPhrase);
  }

  return englishPhrase;
}
'''
text = text[:start] + new_block + text[end:]
p.write_text(text, encoding='utf-8')
print('translate block rewritten')
