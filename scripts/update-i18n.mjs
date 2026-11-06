import fs from 'node:fs';

const translations = {
  en: {
    shortcut: 'Start a new ad-hoc call in Peek',
    palette: 'New call',
    newCall: 'New call',
    switcher: 'Meetings on now',
  },
  nl: {
    shortcut: 'Start een nieuw ad-hocgesprek in Peek',
    palette: 'Nieuw gesprek',
    newCall: 'Nieuw gesprek',
    switcher: 'Lopende vergaderingen',
  },
  de: {
    shortcut: 'Neuen Ad-hoc-Anruf in Peek starten',
    palette: 'Neuer Anruf',
    newCall: 'Neuer Anruf',
    switcher: 'Laufende Besprechungen',
  },
  fr: {
    shortcut: 'Démarrer un nouvel appel ad-hoc dans Peek',
    palette: 'Nouvel appel',
    newCall: 'Nouvel appel',
    switcher: 'Réunions en cours',
  },
  es: {
    shortcut: 'Iniciar una nueva llamada ad-hoc en Peek',
    palette: 'Nueva llamada',
    newCall: 'Nueva llamada',
    switcher: 'Reuniones en curso',
  },
  it: {
    shortcut: 'Avvia una nuova chiamata ad-hoc in Peek',
    palette: 'Nuova chiamata',
    newCall: 'Nuova chiamata',
    switcher: 'Riunioni in corso',
  },
  pl: {
    shortcut: 'Rozpocznij nową rozmowę ad-hoc w Peek',
    palette: 'Nowa rozmowa',
    newCall: 'Nowa rozmowa',
    switcher: 'Trwające spotkania',
  },
};

// 1. Update schema.ts
const schemaPath = 'src/lib/i18n/schema.ts';
let schemaCode = fs.readFileSync(schemaPath, 'utf8');
const eol = schemaCode.includes('\r\n') ? '\r\n' : '\n';

if (!schemaCode.includes('"shortcuts.newCall.label"')) {
  const target1 = `  "shortcuts.togglePeekMode.label": undefined;`;
  const repl1 = `  "shortcuts.togglePeekMode.label": undefined;${eol}  "shortcuts.newCall.label": undefined;`;
  if (!schemaCode.includes(target1)) throw new Error('schema target1 not found');
  schemaCode = schemaCode.replace(target1, repl1);

  const target2 = `  "commandPalette.togglePeekMode": undefined;`;
  const repl2 = `  "commandPalette.togglePeekMode": undefined;${eol}  "commandPalette.newCall": undefined;`;
  if (!schemaCode.includes(target2)) throw new Error('schema target2 not found');
  schemaCode = schemaCode.replace(target2, repl2);

  const target3 = `  "peek.prev": undefined;`;
  const repl3 = `  "peek.switch": undefined;${eol}  "peek.newCall": undefined;${eol}  "peek.prev": undefined;`;
  if (!schemaCode.includes(target3)) throw new Error('schema target3 not found');
  schemaCode = schemaCode.replace(target3, repl3);

  fs.writeFileSync(schemaPath, schemaCode, 'utf8');
  console.log('Updated schema.ts');
}

// 2. Update 7 locale files
for (const [lang, t] of Object.entries(translations)) {
  const locPath = `src/lib/i18n/locales/${lang}.ts`;
  let locCode = fs.readFileSync(locPath, 'utf8');
  const locEol = locCode.includes('\r\n') ? '\r\n' : '\n';

  if (locCode.includes('"shortcuts.newCall.label"')) {
    console.log(`Skipping ${lang}.ts (already updated)`);
    continue;
  }

  // Find shortcuts.togglePeekMode.label block
  const scKey = `"shortcuts.togglePeekMode.label"`;
  const scIdx = locCode.indexOf(scKey);
  if (scIdx === -1) throw new Error(`scKey not found in ${lang}.ts`);
  // Find closing comma of this entry
  const scEnd = locCode.indexOf(`,${locEol}`, scIdx);
  if (scEnd === -1) throw new Error(`scEnd not found in ${lang}.ts`);
  const scInsertPos = scEnd + 1 + locEol.length;
  const scEntry = `  "shortcuts.newCall.label": () =>${locEol}    ${JSON.stringify(t.shortcut)},${locEol}`;
  locCode = locCode.slice(0, scInsertPos) + scEntry + locCode.slice(scInsertPos);

  // Find commandPalette.togglePeekMode block
  const cpKey = `"commandPalette.togglePeekMode"`;
  const cpIdx = locCode.indexOf(cpKey);
  if (cpIdx === -1) throw new Error(`cpKey not found in ${lang}.ts`);
  const cpEnd = locCode.indexOf(`,${locEol}`, cpIdx);
  if (cpEnd === -1) throw new Error(`cpEnd not found in ${lang}.ts`);
  const cpInsertPos = cpEnd + 1 + locEol.length;
  const cpEntry = `  "commandPalette.newCall": () =>${locEol}    ${JSON.stringify(t.palette)},${locEol}`;
  locCode = locCode.slice(0, cpInsertPos) + cpEntry + locCode.slice(cpInsertPos);

  // Find peek.prev block
  const prevKey = `"peek.prev"`;
  const prevIdx = locCode.indexOf(prevKey);
  if (prevIdx === -1) throw new Error(`prevKey not found in ${lang}.ts`);
  const peekEntries = `  "peek.switch": () => ${JSON.stringify(t.switcher)},${locEol}  "peek.newCall": () => ${JSON.stringify(t.newCall)},${locEol}`;
  locCode = locCode.slice(0, prevIdx) + peekEntries + locCode.slice(prevIdx);

  fs.writeFileSync(locPath, locCode, 'utf8');
  console.log(`Updated ${lang}.ts`);
}

console.log('i18n updates complete.');
