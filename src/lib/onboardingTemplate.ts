import { isMac } from "./platform";

/**
 * Returns the interactive plain-text onboarding note template in the user's
 * active language.
 *
 * ChronoNote's onboarding is designed around "Learn by Doing" directly in an
 * authentic, editable, zero-lock-in UTF-8 `.txt` daily note. The user learns the
 * core semantic tokens (#, v, >, x, !, -, 1., =>, o, ., ,) by reading and
 * immediately executing their initial setup actions.
 */
export function getOnboardingTemplate(lang: string): string {
  const mod = isMac ? "Cmd" : "Ctrl";
  const normalized = (lang || "en").toLowerCase().slice(0, 2);

  switch (normalized) {
    case "nl":
      return `Welkom bij ChronoNote
=====================

! ChronoNote is een zero-lock-in dagelijkse notitietool waarin platte tekst verandert in je planning, actielijst en vergaderlogboek.
- Elke notitie is een gewoon .txt-bestand dat lokaal op je apparaat wordt bewaard.
- Je bladert door dagen als een kalender, en markeringen veranderen automatisch in visuele pictogrammen en interactieve items.

Eerst doen — Eerste configuratie
--------------------------------
# Kies je notitiemap (Klik op het map-icoon in de statusbalk of ${mod}+,)
  => Waar ChronoNote je platte UTF-8 tekstbestanden bewaart
# Vink deze actie direct af: druk op ${mod}+Spatie op deze regel
  => Zie hoe '#' verandert in 'v' en de regel subtiel groen wordt
# Optioneel: Verbind OneDrive-cloudsynchronisatie in Instellingen (${mod}+,)
  => Synchroniseert naadloos met andere apparaten en je telefoon

Vervolgens doen — Ontdek je dagelijkse workflow
----------------------------------------------
# Maak een kladblok voor snelle invoer (${mod}+N)
  => Kladblokken blijven in het geheugen tot ze worden opgeslagen met ${mod}+Shift+P
# Spring tussen open acties in deze notitie (Druk op ${mod}+J of ${mod}+Shift+J)
# Open de Actielade (${mod}+Shift+A)
  => Doorzoekt alle notities naar openstaande '#' acties
# Open het Opdrachten- en Navigatiepalet (${mod}+K)
  => Zoek opdrachten, spring naar datums of voer regelacties uit

Sneloverzicht markeringen (Probeer ze hieronder)
------------------------------------------------
# Openstaande actie — vereist aandacht
v Voltooide actie — alles afgerond!
> Uitgestelde actie — doorgeschoven naar morgen of volgende vergadering
x Geannuleerde actie — vervallen, niet meer van toepassing
! Belangrijke prioriteit of cruciale mijlpaal
- Neutraal opsommingsteken of journaalnotitie
1. Genummerde volgorde voor procedures stap voor stap
=> Gevolgregel of overdracht aan @collega

Vergaderagendapunten
--------------------
o Agendapunt om te bespreken in de stand-up van vandaag
. Besproken agendapunt (afgevinkt)
, Uitgesteld of niet-behandeld agendapunt (doorgeschoven)

=====================
Tips: Druk op ${mod}+1 t/m 4 om actietypen te wisselen, of ${mod}+5 t/m 7 voor agendapunten.
`;

    case "de":
      return `Willkommen bei ChronoNote
=========================

! ChronoNote ist ein lock-in-freies tägliches Notizwerkzeug, bei dem reiner Text zu Zeitplan, Aufgabenverwaltung und Besprechungsprotokoll wird.
- Jede Notiz ist eine normale .txt-Datei, die lokal auf Ihrem Gerät gespeichert ist.
- Sie navigieren durch Tage wie in einem Kalender, und Ihre Token werden automatisch zu visuellen Symbolen und interaktiven Elementen.

Zuerst erledigen — Erste Schritte
---------------------------------
# Notizenordner auswählen (Klicken Sie auf das Ordnersymbol in der Statusleiste oder ${mod}+,)
  => Wo ChronoNote Ihre UTF-8-Textdateien speichert
# Haken Sie diese Aufgabe jetzt ab: Drücken Sie ${mod}+Leertaste in dieser Zeile
  => Beobachten Sie, wie '#' zu 'v' wird und die Zeile grün abtönt
# Optional: OneDrive-Cloud-Synchronisierung in den Einstellungen verbinden (${mod}+,)
  => Synchronisiert nahtlos mit anderen Geräten und Ihrem Smartphone

Als Nächstes — Täglicher Workflow
---------------------------------
# Notizblock für schnelle Notizen erstellen (${mod}+N)
  => Notizblöcke bleiben im Speicher, bis sie mit ${mod}+Shift+P umgewandelt werden
# Zwischen offenen Aufgaben in dieser Notiz springen (${mod}+J oder ${mod}+Shift+J)
# Aktionsleiste öffnen (${mod}+Shift+A)
  => Durchsucht alle Notizen nach offenen '#'-Aufgaben
# Befehls- und Navigationspalette öffnen (${mod}+K)
  => Befehle suchen, zu Daten springen oder Zeilenaktionen ausführen

Token-Kurzübersicht (Unten ausprobieren)
---------------------------------------
# Offene Aufgabe — benötigt Aufmerksamkeit
v Erledigte Aufgabe — alles fertig!
> Verschobene Aufgabe — auf morgen oder das nächste Meeting vertagt
x Abgebrochene Aufgabe — entfällt, nicht mehr relevant
! Wichtiger Schwerpunkt oder entscheidender Meilenstein
- Neutraler Aufzählungspunkt oder Tagebucheintrag
1. Nummerierte Sequenz für Schritt-für-Schritt-Abläufe
=> Folgezeile oder Weiterleitung an @kollege

Tagesordnungsthemen
-------------------
o Thema für das heutige Standup
. Besprochenes Thema (als erledigt markiert)
, Verschobenes oder nicht erreichtes Thema (übertragen)

=====================
Tipps: Drücken Sie ${mod}+1 bis 4 zum Umschalten der Aktionstypen oder ${mod}+5 bis 7 für Themen.
`;

    case "es":
      return `Bienvenido a ChronoNote
=======================

! ChronoNote es una herramienta de notas diarias sin ataduras donde el texto plano se convierte en tu horario, gestor de tareas y registro de reuniones.
- Cada nota es un archivo .txt ordinario guardado localmente en tu dispositivo.
- Navegas los días como un calendario y tus fichas se convierten automáticamente en marcadores visuales e interactivos.

Hacer primero — Configuración inicial
-------------------------------------
# Elige tu carpeta de notas (Haz clic en el icono de carpeta en la barra de estado o ${mod}+,)
  => Donde ChronoNote guarda tus archivos de texto UTF-8
# Prueba a completar esta tarea ahora mismo: pulsa ${mod}+Espacio en esta línea
  => Observa cómo '#' cambia a 'v' y la línea pasa a verde tenue
# Opcional: Conecta la sincronización con OneDrive en Ajustes (${mod}+,)
  => Sincroniza a la perfección con otros dispositivos y tu teléfono

Siguiente paso — Descubre tu flujo diario
-----------------------------------------
# Crea un borrador rápido (${mod}+N)
  => Los borradores viven en memoria hasta que se guardan con ${mod}+Shift+P
# Salta entre tareas abiertas en esta nota (Pulsa ${mod}+J o ${mod}+Shift+J)
# Abre el Panel de Acciones (${mod}+Shift+A)
  => Busca tareas '#' pendientes en todas las notas
# Abre la Paleta de Comandos y Navegación (${mod}+K)
  => Busca comandos, salta a fechas o ejecuta acciones de línea

Guía rápida de fichas (Pruébalas abajo)
---------------------------------------
# Acción abierta — requiere atención
v Acción completada — ¡todo listo!
> Acción aplazada — pospuesta para mañana o la próxima reunión
x Acción cancelada — descartada, ya no es relevante
! Punto destacado importante o hito fundamental
- Punto neutro o nota de diario
1. Secuencia numerada para procedimientos paso a paso
=> Línea de consecuencia o delegación a @colega

Temas de reunión
----------------
o Tema a tratar en la reunión de hoy
. Tema tratado (marcado como completado)
, Tema pospuesto o no alcanzado (trasladado)

=====================
Consejos: Pulsa ${mod}+1 a 4 para cambiar tipos de acción, o ${mod}+5 a 7 para temas de reunión.
`;

    case "fr":
      return `Bienvenue sur ChronoNote
========================

! ChronoNote est un outil de notes quotidiennes sans verrouillage où le texte brut devient votre planning, suivi de tâches et journal de réunion.
- Chaque note est un fichier .txt ordinaire stocké localement sur votre appareil.
- Vous parcourez les jours comme un calendrier et vos jetons deviennent des marqueurs visuels et interactifs.

À faire en premier — Configuration initiale
-------------------------------------------
# Choisissez votre dossier de notes (Cliquez sur l'icône dossier dans la barre d'état ou ${mod}+,)
  => Où ChronoNote conserve vos fichiers texte UTF-8
# Cochez cette tâche dès maintenant : appuyez sur ${mod}+Espace sur cette ligne
  => Observez '#' devenir 'v' et la ligne prendre une teinte verte discrète
# Facultatif : Connectez la synchronisation OneDrive dans les Paramètres (${mod}+,)
  => Synchronisation transparente avec vos autres appareils et votre téléphone

Ensuite — Découvrez votre flux quotidien
----------------------------------------
# Créez un bloc-notes temporaire (${mod}+N)
  => Reste en mémoire jusqu'à sa promotion avec ${mod}+Shift+P
# Naviguez entre les tâches ouvertes de cette note (Appuyez sur ${mod}+J ou ${mod}+Shift+J)
# Ouvrez le Tiroir d'actions (${mod}+Shift+A)
  => Analyse toutes les notes pour lister les tâches '#' en suspens
# Ouvrez la Palette de commandes et navigation (${mod}+K)
  => Recherchez des commandes, sautez à une date ou exécutez des actions de ligne

Aide-mémoire des jetons (Essayez-les ci-dessous)
------------------------------------------------
# Action ouverte — nécessite votre attention
v Action terminée — tout est fait !
> Action différée — reportée à demain ou à la prochaine réunion
x Action annulée — abandonnée, n'est plus pertinente
! Remarque prioritaire ou jalon essentiel
- Puce neutre ou note de journal
1. Séquence numérotée pour les procédures étape par étape
=> Ligne de conséquence ou délégation à @collègue

Sujets de réunion
-----------------
o Sujet à aborder lors du point d'aujourd'hui
. Sujet discuté (marqué comme fait)
, Sujet reporté ou non abordé (reporté)

=====================
Conseils : Appuyez sur ${mod}+1 à 4 pour changer de type d'action, ou ${mod}+5 à 7 pour les sujets.
`;

    case "it":
      return `Benvenuto in ChronoNote
=======================

! ChronoNote è uno strumento di note giornaliere senza vincoli in cui il testo semplice diventa la tua agenda, promemoria e verbale delle riunioni.
- Ogni nota è un normale file .txt salvato localmente sul tuo dispositivo.
- Navighi i giorni come un calendario e i token diventano automaticamente indicatori visivi e interattivi.

Cosa fare prima — Configurazione iniziale
-----------------------------------------
# Scegli la cartella delle note (Fai clic sull'icona della cartella nella barra di stato o ${mod}+,)
  => Dove ChronoNote conserva i tuoi file di testo UTF-8
# Prova a completare questa attività adesso: premi ${mod}+Spazio su questa riga
  => Nota come '#' diventa 'v' e la riga assume un colore verde tenue
# Facoltativo: Connetti la sincronizzazione OneDrive in Impostazioni (${mod}+,)
  => Si sincronizza perfettamente con gli altri dispositivi e il tuo telefono

Passaggi successivi — Scopri il tuo flusso quotidiano
-----------------------------------------------------
# Crea un blocco appunti rapido (${mod}+N)
  => I blocchi rimangono in memoria fino a quando non vengono promossi con ${mod}+Shift+P
# Salta tra le attività aperte in questa nota (Premi ${mod}+J o ${mod}+Shift+J)
# Apri il Pannello azioni (${mod}+Shift+A)
  => Cerca in tutte le note le attività '#' in sospeso
# Apri la Tavolozza dei comandi e navigazione (${mod}+K)
  => Cerca comandi, salta alle date o esegui azioni di riga

Riferimento rapido dei token (Provali qui sotto)
-----------------------------------------------
# Elemento aperto — richiede attenzione
v Elemento completato — tutto fatto!
> Azione posticipata — rimandata a domani o alla prossima riunione
x Azione annullata — non necessaria, non più rilevante
! Avviso importante o traguardo fondamentale
- Punto elenco neutro o nota di diario
1. Sequenza numerata per procedure passo dopo passo
=> Riga di conseguenza o delega a @collega

Argomenti della riunione
------------------------
o Argomento da discutere nello standup di oggi
. Argomento discusso (completato)
, Argomento posticipato o non trattato (portato avanti)

=====================
Suggerimenti: Premi ${mod}+1 fino a 4 per cambiare tipo di azione, o ${mod}+5 fino a 7 per gli argomenti.
`;

    case "pl":
      return `Witaj w ChronoNote
==================

! ChronoNote to wolne od ograniczeń narzędzie do codziennych notatek, w którym zwykły tekst staje się Twoim planem dnia, listą zadań i dziennikiem spotkań.
- Każda notatka to zwykły plik .txt przechowywany lokalnie na Twoim urządzeniu.
- Przeglądasz dni jak w kalendarzu, a znaczniki automatycznie stają się czytelnymi symbolami i interaktywnymi elementami.

Zrób najpierw — Wstępna konfiguracja
------------------------------------
# Wybierz folder notatek (Kliknij ikonę folderu na pasku stanu lub ${mod}+,)
  => Gdzie ChronoNote przechowuje pliki tekstowe UTF-8
# Odznacz to zadanie już teraz: naciśnij ${mod}+Spacja w tym wierszu
  => Zobacz, jak '#' zmienia się w 'v', a linia przybiera stonowany zielony kolor
# Opcjonalnie: Połącz synchronizację OneDrive w Ustawieniach (${mod}+,)
  => Bezproblemowa synchronizacja z innymi urządzeniami i telefonem

Następnie — Poznaj codzienny tryb pracy
---------------------------------------
# Utwórz brudnopis do szybkiego zapisu (${mod}+N)
  => Brudnopisy istnieją w pamięci do momentu zapisania za pomocą ${mod}+Shift+P
# Przeskakuj między otwartymi zadaniami w tej notatce (Naciśnij ${mod}+J lub ${mod}+Shift+J)
# Otwórz Szufladę akcji (${mod}+Shift+A)
  => Wyszukuje otwarte zadania '#' we wszystkich notatkach
# Otwórz Paletę poleceń i nawigacji (${mod}+K)
  => Wyszukuj polecenia, przechodź do dat lub wykonuj akcje wiersza

Szybki przewodnik po znacznikach (Wypróbuj poniżej)
---------------------------------------------------
# Otwarte zadanie — wymaga uwagi
v Ukończone zadanie — zrobione!
> Odłożone zadanie — przesunięte na jutro lub kolejne spotkanie
x Anulowane zadanie — nieaktualne, bez znaczenia
! Ważne wyróżnienie lub kluczowy kamień milowy
- Zwykły punkt lub notatka w dzienniku
1. Numerowana sekwencja do procedur krok po kroku
=> Linia skutku lub delegacja do @współpracownik

Tematy spotkania
----------------
o Temat do omówienia na dzisiejszym spotkaniu
. Omówiony temat (oznaczony jako zrobiony)
, Odłożony lub nieporuszony temat (przeniesiony)

=====================
Wskazówki: Naciśnij ${mod}+1 do 4, aby zmienić typ akcji, lub ${mod}+5 do 7 dla tematów spotkań.
`;

    case "en":
    default:
      return `Welcome to ChronoNote
=====================

! ChronoNote is a zero-lock-in, daily note tool where plain text becomes your schedule, task tracker, and meeting log.
- Every note is an ordinary .txt file stored locally on your device.
- You navigate days like a calendar, and your tokens automatically turn into visual markers and interactive items.

Do First — Initial Setup
------------------------
# Pick your storage folder (Click the folder icon in the status bar or ${mod}+,)
  => Where ChronoNote keeps your plain UTF-8 text files
# Try checking off this task right now: press ${mod}+Space on this line
  => Notice how '#' changes to 'v' and the line turns muted green
# Optional: Connect OneDrive cloud sync in Settings (${mod}+,)
  => Syncs seamlessly with other devices and your phone

Do Next — Discover Your Daily Workflow
--------------------------------------
# Create a scratchpad for quick capture (${mod}+N)
  => Scratchpads live in memory until promoted with ${mod}+Shift+P
# Jump between open tasks in this note (Press ${mod}+J or ${mod}+Shift+J)
# Open the Action Drawer (${mod}+Shift+A)
  => Scans all notes for outstanding '#' tasks
# Open the Command & Navigation Palette (${mod}+K)
  => Search commands, jump to dates, or execute line actions

Token Quick Reference (Try them below)
--------------------------------------
# Open action item — needs attention
v Completed action item — all done!
> Deferred action — pushed to tomorrow or next meeting
x Cancelled action — won't do, no longer relevant
! Important priority callout or crucial milestone
- Neutral bullet point or journal note
1. Numbered sequence for step-by-step procedures
=> Consequence line or delegation to @colleague

Meeting Agenda Topics
---------------------
o Agenda topic to discuss in today's standup
. Discussed agenda topic (marked done)
, Postponed or unreached topic (carried forward)

=====================
Tips: Press ${mod}+1 through 4 to toggle action types, or ${mod}+5 through 7 for meeting topics.
`;
  }
}

const ONBOARDING_LANGS = ["en", "nl", "de", "es", "fr", "it", "pl"];

/** Helper to convert a current onboarding template to its legacy wording
 * where jumpAction was bound to F2 / Shift+F2 rather than Mod+J / Mod+Shift+J. */
export function toLegacyOnboardingTemplate(template: string): string {
  const mod = isMac ? "Cmd" : "Ctrl";
  return template.replace(`${mod}+Shift+J`, "Shift+F2").replace(`${mod}+J`, "F2");
}

/** True while `content` is still exactly the untouched onboarding note (in any
 * language). Used so the web app's welcome scratchpad can be closed without the
 * "unsaved scratchpad" warning — nothing the user wrote would be lost. Once
 * they edit it, it is an ordinary scratchpad again. Also recognises welcome notes
 * created before jumpAction was rebound from F2 / Shift+F2 to Mod+J / Mod+Shift+J. */
export function isPristineOnboardingNote(content: string): boolean {
  // Template literals are LF-normalised by the language, whatever the source
  // file's line endings, so a plain comparison is enough.
  return ONBOARDING_LANGS.some((l) => {
    const current = getOnboardingTemplate(l);
    return current === content || toLegacyOnboardingTemplate(current) === content;
  });
}
