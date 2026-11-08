const spanish = new Set(
  'el la los las de del en y que por para con una un es se al las sus como'.split(
    ' ',
  ),
);
const english = new Set(
  'the a an of in and that for with is are to on this from as by it'.split(' '),
);

export function detectLanguage(text: string): 'es' | 'en' | 'unknown' {
  let es = 0;
  let en = 0;
  for (const word of text.toLowerCase().match(/[a-záéíóúñ]+/g) ?? []) {
    if (spanish.has(word)) es++;
    if (english.has(word)) en++;
  }
  return es === en ? 'unknown' : es > en ? 'es' : 'en';
}
