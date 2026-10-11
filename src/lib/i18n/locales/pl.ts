import type { Dictionary } from "../schema";

/** Polish locale. */
export const pl = {
  "common.system": () => "Systemowy",
  "common.close": () => "Zamknij",
  "common.closeDialog": () => "Zamknij okno",
  "common.allKeys": () => "Wszystkie klawisze",
  "common.loading": () => "Ładowanie",
  "settings.modal.title": () => "Ustawienia",
  "settings.tabs.appearance": () => "Wygląd",
  "settings.tabs.notesAndSync": () => "Notatki i synchronizacja",
  "settings.tab.about": () => "O programie",
  "settings.back": () => "Wstecz",
  "settings.appearance.sectionLabel": () => "Wygląd",
  "settings.appearance.theme.label": () => "Motyw",
  "settings.appearance.theme.light": () => "Jasny",
  "settings.appearance.theme.dark": () => "Ciemny",
  "settings.appearance.theme.hint": () => "Systemowy dopasowuje się do motywu jasnego/ciemnego Twojego systemu.",
  "settings.appearance.language.label": () => "Język",
  "settings.appearance.language.hint": () => "Systemowy dopasowuje się do języka wyświetlania Twojego systemu.",
  "settings.appearance.language.community": () => "(tłumaczenie społeczności)",
  "settings.appearance.glyphs.label": () => "Glify",
  "settings.appearance.glyphs.color": () => "Kolorowe",
  "settings.appearance.glyphs.grayscale": () => "Odcienie szarości",
  "settings.appearance.glyphs.hint": () =>
    "Kolor: czerwone otwarte, bursztynowe przełożone, zielone wykonane. Odcienie szarości różnią je tylko grubością.",
  "settings.appearance.pureBlack.label": () => "Czysta czerń (OLED)",
  "settings.appearance.pureBlack.hint": () =>
    "Absolutne tło #000000 dla ekranów OLED i oszczędzania baterii. Działa tylko w trybie ciemnym.",
  "settings.appearance.statusBar.label": () => "Pokaż pasek stanu",
  "settings.appearance.statusBar.hint": () =>
    "Wyświetlaj wiersz, kolumnę, liczbę słów i stan zadań na dole okna",
  "settings.appearance.tabLabels.label": () => "Etykiety kart",
  "settings.appearance.tabLabels.hint": () =>
    "Jak nazywane są karty z datą; pełna data jest zawsze w podpowiedzi.",
  "settings.appearance.tabLabels.iso": () => "Data ISO",
  "settings.appearance.tabLabels.friendly": () => "Czytelne",
  "settings.editor.sectionLabel": () => "Edytor",
  "settings.editor.width.label": () => "Szerokość tekstu",
  "settings.editor.width.full": () => "Pełna",
  "settings.editor.width.wrap": () => "Zawijanie",
  "settings.editor.width.readingColumn": () => "Kolumna do czytania",
  "settings.editor.width.hint": () =>
    "Pełna zachowuje linie bez zawijania — siatka o stałej szerokości pozostaje nienaruszona dla tabel i kolumn. Zawijanie dopasowuje długie wiersze do okna. Kolumna do czytania ogranicza tekst do wygodnej, wyśrodkowanej szerokości.",
  "settings.editor.fontSize.label": () => "Rozmiar czcionki",
  "settings.editor.fontSize.ariaLabel": () => "Rozmiar czcionki edytora",
  "settings.editor.lineSpacing.label": () => "Interlinia",
  "settings.editor.lineSpacing.ariaLabel": () => "Interlinia edytora",
  "settings.calendar.sectionLabel": () => "Kalendarz",
  "settings.calendar.showButtonToggle": () => 'Pokaż „Synchronizuj kalendarz na ten dzień”',
  "settings.calendar.agendaHint.before": () => "Odczytuje spotkania z pliku ",
  "settings.calendar.agendaHint.after": () =>
    " w Twoim folderze notatek — aktualizowanego przez dowolny proces, którego używasz, a nie przez samo ChronoNote. Spotkania są dopasowywane do sekcji po tytule — zachowaj tytuły sekcji zgodne z kalendarzem. Dwa spotkania o tym samym tytule w tym samym dniu są nierozróżnialne.",
  "settings.calendar.agendaMissing.before": () => "Nie znaleziono pliku ",
  "settings.calendar.agendaMissing.after": () =>
    " w tym folderze notatek — przycisk synchronizacji pozostaje nieaktywny, dopóki plik nie powstanie.",
  "settings.startup.sectionLabel": () => "Uruchamianie",
  "settings.startup.label": () => "Pierwsze uruchomienie w danym dniu",
  "settings.startup.today": () => "Dzisiaj",
  "settings.startup.smart": () => "Ostatnia notatka",
  "settings.startup.todayHint": () => "Zawsze otwiera dzisiejszą notatkę przy pierwszym uruchomieniu w danym dniu.",
  "settings.startup.smartHint": () =>
    "Otwiera dzisiejszą notatkę, jeśli masz sporządzone notatki lub zaplanowane spotkania; w przeciwnym razie przywraca ostatnie miejsce pracy.",
  "settings.oneDrive.sectionLabel": () => "Synchronizacja w chmurze OneDrive",
  "settings.oneDrive.safariTip.label": () => "Wskazówka dla Safari:",
  "settings.oneDrive.safariTip.hint": () =>
    "Dodaj ChronoNote do ekranu początkowego, aby Apple nie usuwało notatek offline po 7 dniach bezczynności.",
  "settings.oneDrive.connectedAs.before": () => "Połączono jako ",
  "settings.oneDrive.connectedAs.after": ({ email }) => `(${email})`,
  "settings.oneDrive.signInExpired.title": () => "Twoje logowanie do OneDrive wygasło.",
  "settings.oneDrive.signInExpired.body": () =>
    "Twoje notatki są bezpieczne na tym urządzeniu i nie zostałeś wylogowany. Zaloguj się ponownie, aby kontynuować synchronizację; zmiany wprowadzone od ostatniej synchronizacji zostaną zachowane i wysłane.",
  "settings.oneDrive.connecting": () => "Łączenie…",
  "settings.oneDrive.noFolderSelected": () => "Nie wybrano jeszcze folderu",
  "settings.oneDrive.chooseFolder": () => "Wybierz folder…",
  "settings.oneDrive.syncNow": () => "Synchronizuj teraz",
  "settings.oneDrive.chooseFolderFirstTitle": () => "Najpierw wybierz folder OneDrive",
  "settings.oneDrive.signOut": () => "Wyloguj się",
  "settings.oneDrive.signOutHint": () =>
    "Wylogowanie przełączy z powrotem na pamięć przeglądarki, ładując notatki, które są tam zapisane i nie zostały zmigrowane.",
  "settings.oneDrive.removeLocalOnSignOut": () =>
    "Usuń również notatki OneDrive z tej przeglądarki. Niezsynchronizowane zmiany zostaną utracone. Notatki w usłudze OneDrive pozostaną nienaruszone.",
  "settings.oneDrive.noFolderYetHint": () =>
    "Wybierz folder OneDrive, z którym mają synchronizować się notatki. Do tego momentu nic nie zostanie zsynchronizowane.",
  "settings.oneDrive.connectHint": () =>
    "Połącz swoje konto Microsoft, aby używać folderu OneDrive jako folderu notatek. Notatki będą synchronizowane na wszystkich urządzeniach.",
  "settings.oneDrive.connectHintWebSuffix": () =>
    " Po połączeniu notatki z pamięci przeglądarki mogą zostać przeniesione do OneDrive.",
  "settings.oneDrive.connectMicrosoftAccount": () => "Połącz konto Microsoft",
  "settings.oneDrive.waitingForBrowser": () => "Oczekiwanie na dokończenie logowania w przeglądarce…",
  "settings.oneDrive.pasteCodeHint": () => "Wklej adres URL przekierowania lub kod autoryzacji z przeglądarki:",
  "settings.oneDrive.codeInputPlaceholder": () => "chrononote://auth?code=... lub kod",
  "settings.oneDrive.submitCode": () => "Prześlij kod",
  "settings.oneDrive.exchangingCode": () => "Wymiana kodu…",
  "settings.oneDrive.enterCodeManually": () => "Wprowadź kod autoryzacji ręcznie",
  "settings.oneDrive.hideAdvanced": () => "Ukryj zaawansowane",
  "settings.oneDrive.showAdvanced": () => "Zaawansowane (konta służbowe/szkolne)",
  "settings.oneDrive.advancedHint": () =>
    "Zabezpieczona organizacja Entra może odrzucać ogólny punkt logowania i wymagać własnej rejestracji aplikacji. Pozostaw puste dla osobistego konta Microsoft.",
  "settings.oneDrive.clientIdLabel": () => "Własny identyfikator klienta (Client ID)",
  "settings.oneDrive.clientIdPlaceholder": () => "(domyślny) konta osobiste",
  "settings.oneDrive.tenantIdLabel": () => "Własny identyfikator dzierżawy (Tenant ID) lub domena",
  "settings.oneDrive.tenantIdPlaceholder": () => "common",
  "settings.oneDrive.save": () => "Zapisz",
  "settings.oneDrive.saving": () => "Zapisywanie…",
  "settings.oneDrive.savedHint": () => "Zapisano — wyloguj się i połącz ponownie, aby zastosować.",
  "settings.notesLocation.sectionLabel": () => "Lokalizacja notatek",
  "settings.notesLocation.hint": () =>
    "Zmiana tego ustawienia przełącza całą przestrzeń roboczą — otwarte karty zostaną zamknięte, a wszystko załaduje się z nowego folderu. Istniejące pliki nie zostaną przeniesione.",
  "settings.data.sectionLabel": () => "Dane",
  "settings.data.export": () => "Eksportuj wszystkie notatki…",
  "settings.data.exporting": () => "Eksportowanie…",
  "settings.data.import": () => "Importuj notatki z pliku…",
  "settings.data.webHint": () =>
    "Twoje notatki znajdują się tylko w tej przeglądarce — wyczyszczenie danych witryny, okno prywatne lub limity pamięci Safari mogą je usunąć. Eksportuj kopię zapasową od czasu do czasu lub zainstaluj aplikację na komputer.",
  "settings.data.desktopHint": () =>
    "Import odczytuje plik eksportu ChronoNote (z aplikacji webowej lub innej instalacji) i zapisuje notatki tutaj.",
  "settings.data.couldntReadFile": () => "Nie udało się odczytać tego pliku.",
  "settings.data.noteCountInFile": ({ count }) =>
    count === 1 ? "1 notatka w tym pliku." : `${count} notatek w tym pliku.`,
  "settings.data.importMode.merge": () => "Scal (pomiń duplikaty)",
  "settings.data.importMode.replace": () => "Zastąp wszystko",
  "settings.data.replaceWarning": () =>
    "Spowoduje to najpierw usunięcie wszystkich obecnych tu notatek — operacja jest nieodwracalna.",
  "settings.data.importing": () => "Importowanie…",
  "settings.data.importAction": () => "Importuj",
  "settings.updates.checkOnStart": () => "Sprawdzaj aktualizacje przy uruchomieniu ChronoNote",
  "settings.updates.checkOnStartHint": () =>
    "Dyskretne zapytanie do github.com — nigdy nic nie pobiera ani nie instaluje bez Twojej zgody.",
  "common.browse": () => "Przeglądaj…",

  "shortcuts.commandPalette.label": () =>
    "Paleta poleceń — uruchom polecenie, przejdź do karty, daty lub zadania",
  "shortcuts.newScratchpad.label": () => "Nowy brudnopis",
  "shortcuts.reopenClosedTab.label": () => "Otwórz ponownie ostatnio zamkniętą kartę",
  "shortcuts.openDateNote.label": () => "Otwórz/utwórz notatkę z datą",
  "shortcuts.closeTab.label": () => "Zamknij bieżącą kartę / zamknij kartę",
  "shortcuts.cycleTab.label": () => "Następna / poprzednia karta",
  "shortcuts.indentDedent.label": () => "Zwiększ / zmniejsz wcięcie (w edytorze)",
  "shortcuts.undoRedo.label": () => "Cofnij / ponów (oddzielnie dla każdej karty)",
  "shortcuts.cycleLineState.label": () => "Ukończ otwarte zadanie pod kursorem (# → v, w edytorze)",
  "shortcuts.cycleLineStateReverse.label": () => "Otwórz ponownie ukończone zadanie pod kursorem (v → #, w edytorze)",
  "shortcuts.markSelectionOpen.label": () =>
    "Otwórz zadanie pod kursorem lub w każdym zaznaczonym wierszu (nigdy nie zamienia zwykłego tekstu)",
  "shortcuts.setActionOpen.label": () =>
    "Ustaw zadanie pod kursorem lub w zaznaczeniu jako otwarte; zwykły wiersz staje się zadaniem",
  "shortcuts.setActionDone.label": () =>
    "Ustaw zadanie pod kursorem lub w zaznaczeniu jako wykonane; zwykły wiersz staje się zadaniem",
  "shortcuts.setActionDeferred.label": () =>
    "Ustaw zadanie pod kursorem lub w zaznaczeniu jako odłożone; zwykły wiersz staje się zadaniem",
  "shortcuts.setActionWontDo.label": () =>
    "Ustaw zadanie pod kursorem lub w zaznaczeniu jako zaniechane; zwykły wiersz staje się zadaniem",
  "shortcuts.setTopicToDiscuss.label": () =>
    "Ustaw temat pod kursorem lub w zaznaczeniu jako do omówienia; zwykły wiersz staje się tematem",
  "shortcuts.setTopicDiscussed.label": () =>
    "Ustaw temat pod kursorem lub w zaznaczeniu jako omówiony; zwykły wiersz staje się tematem",
  "shortcuts.setTopicNotDiscussed.label": () =>
    "Ustaw temat pod kursorem lub w zaznaczeniu jako nieomówiony; zwykły wiersz staje się tematem",
  "shortcuts.jumpAction.label": () => "Przejdź do następnego / poprzedniego otwartego zadania (w edytorze, w pętli)",
  "shortcuts.caretLineNav.label": () =>
    "Kursor na początek wiersza, potem poprzedni wiersz / początek następnego wiersza (w edytorze)",
  "shortcuts.convertToSection.label": () => "Przekształć bieżący wiersz w nagłówek sekcji",
  "shortcuts.openActions.label": () => "Zadania",
  "shortcuts.openHistory.label": () => "Historia sekcji",
  "shortcuts.findInNote.label": () => "Znajdź w tej notatce (pasek podręczny; Enter / Shift+Enter aby przejść)",
  "shortcuts.crossTabSearch.label": () => "Wyszukiwanie w kartach",
  "shortcuts.syncCalendar.label": () => "Synchronizuj kalendarz na ten dzień",
  "shortcuts.openSettings.label": () => "Ustawienia",
  "shortcuts.openAbout.label": () => "O programie ChronoNote",
  "shortcuts.openShortcutsHelp.label": () => "Ten panel",
  "shortcuts.copyToNextOccurrence.label": () =>
    "Skopiuj zaznaczenie (lub bieżący wiersz) do następnego wystąpienia tej sekcji",
  "shortcuts.toggleZenMode.label": () => "Tryb Zen (przestrzeń bez rozpraszaczy)",
  "shortcuts.togglePeekMode.label": () =>
    "Peek: kompaktowe, półprzezroczyste okno notatek dla sekcji przy kursorze",
  "commandPalette.togglePeekMode": () =>
    "Przełącz Peek (kompaktowe okno notatek na rozmowy)",
  "peek.toast.noSection": () =>
    "Umieść kursor w sekcji, aby w nią zerknąć.",
  "peek.toast.titleExists": () =>
    "Ta notatka ma już sekcję o tym tytule.",
  "peek.expand": () =>
    "Wróć do pełnego okna",
  "peek.minimize": () =>
    "Minimalizuj",
  "peek.rename": () =>
    "Kliknij, aby nazwać tę rozmowę",
  "peek.prev": () =>
    "Poprzednie wystąpienie",
  "peek.next": () =>
    "Następne wystąpienie",
  "occurrence.settings.title": () =>
    "Wystąpienia sekcji",
  "occurrence.settings.hint.label": () =>
    "Pokazuj wskaźnik wystąpień po tytułach sekcji",
  "occurrence.settings.hint.hint": () =>
    "Domyślnie wyłączone. Pokazuje < (2/5) > po tytule sekcji, gdy ta sama sekcja jest w innych notatkach; kliknij strzałki, aby tam przejść. Alt+Strzałka w lewo / Alt+Strzałka w prawo działają w sekcji zawsze, ze wskaźnikiem lub bez niego.",
  "toast.boot.failedToSave.occurrenceHint": () => "Nie udało się zapisać ustawienia wskaźnika wystąpień",
  "peek.settings.callShortcut.label": () =>
    "Skrót: notatki do trwającego spotkania (działa z każdej aplikacji)",
  "commandPalette.peekCall": () =>
    "Peek: notatki do trwającego spotkania",
  "call.adhocTitle": ({ time }) => `'Rozmowa ${time}`,
  "peek.settings.title": () =>
    "Peek (kompaktowe notatki podczas rozmowy)",
  "occurrence.peek": () =>
    "Peek na tę sekcję",
  "peek.settings.fitSection.label": () =>
    "Dopasuj wysokość okna do sekcji",
  "peek.settings.opacity.label": () =>
    "Krycie tła, bez fokusu",
  "peek.settings.opacityHover.label": () =>
    "Krycie tła, z fokusem",
  "peek.settings.fadeSeconds.label": () =>
    "Wygaś do braku fokusu po (sekundach)",
  "peek.settings.fadeSeconds.never": () =>
    "Nigdy",
  "peek.settings.alwaysOnTop.label": () =>
    "Trzymaj nad innymi oknami",
  "peek.settings.header.label": () =>
    "Pasek nagłówka",
  "peek.settings.header.always": () =>
    "Zawsze",
  "peek.settings.header.hover": () =>
    "Po najechaniu",
  "peek.settings.header.never": () =>
    "Ukryty",
  "peek.settings.hint": () =>
    "Peek zmniejsza okno do sekcji, w której jest kursor. Alt+Strzałka w lewo / Alt+Strzałka w prawo przechodzą do poprzedniego / następnego wystąpienia; edycje są zwykłymi edycjami. Naciśnij skrót ponownie, aby wrócić.",
  "shortcuts.stepOccurrence.label": () =>
    "Poprzednie / następne wystąpienie tej sekcji",
  "shortcuts.clickGlyph.label": () =>
    "Ukończ zadanie glifu lub otwórz je ponownie, jeśli jest ukończone, odłożone lub zaniechane; najechanie pokazuje podgląd",
  "shortcuts.escape.label": () => "Zamknij otwarte okno dialogowe",
  "shortcuts.switchPane.label": () => "Przełącz fokus między notatką a panelem Historii / Działań (skrót panelu działa tak samo)",
  "shortcuts.zoomFont.label": () => "Większy / mniejszy tekst w notatce (zapisywany)",
  "shortcuts.keyTips.label": () => "Naciśnij Alt: litera przy każdym poleceniu paska tytułu; naciśnij ją, aby wykonać polecenie",

  "shortcuts.modal.title": () => "Skróty i symbole",
  "shortcuts.modal.tab.shortcuts": () => "Skróty",
  "shortcuts.modal.tab.glyphs": () => "Glify i symbole",
  "shortcuts.modal.group.keyboardShortcuts": () => "Skróty klawiszowe",
  "shortcuts.modal.group.symbolsToGlyphs": () => "Symbole → glify",
  "shortcuts.modal.group.sectionHeaders": () => "Nagłówki sekcji",
  "shortcuts.modal.glyph.open": () => "Otwarte zadanie — coś do zrobienia",
  "shortcuts.modal.glyph.done": () => "Wykonane",
  "shortcuts.modal.glyph.deferred": () => "Odłożone — przesunięte do późniejszej notatki",
  "shortcuts.modal.glyph.wontDo": () => "Zaniechane — zamknięte bez realizacji",
  "shortcuts.modal.glyph.toDiscuss": () => "Do omówienia — otwarty temat spotkania",
  "shortcuts.modal.glyph.discussed": () => "Omówione — temat zakończony na tym spotkaniu",
  "shortcuts.modal.glyph.notDiscussed": () => "Nieomówione — odłożone na inne spotkanie",
  "shortcuts.modal.glyph.bullet": () =>
    "Element listy punktowanej (Enter kontynuuje, pusty kończy, Tab tworzy wcięcie o 2 spacje)",
  "shortcuts.modal.glyph.followUp": () => "Kontynuacja — zwykła notatka wynikająca z tego wiersza",
  "shortcuts.modal.topicTag": () =>
    "Etykieta tematu — grupuje zadania według wątku, wyświetlana jako pigułka zaraz po symbolu zadania; nawiasy pojawiają się przy edycji",
  "shortcuts.modal.dimmedLines": () =>
    "Wiersze wykonane, odłożone i zaniechane oraz omówione lub odłożone punkty agendy są przygaszone; otwarte pozostają w pełni wyraźne (punkt z otwartym dalszym krokiem jest przygaszony tylko do strzałki)",
  "shortcuts.modal.boldEmphasis": () => "Pogrubienie dla reszty wiersza",
  "shortcuts.modal.numberedList": () =>
    "Element listy numerowanej — zwykły tekst, bez glifu. Enter kontynuuje z kolejnym numerem, pusty kończy listę, Tab tworzy wcięcie o 2 spacje; numery nie są modyfikowane. Podelementy:",
  "shortcuts.modal.consequenceAction": ({ shortcutHint }) =>
    `Zadanie wynikowe — kontynuacja z własnym stanem otwarte/wykonane/odłożone/zaniechane, zmienianym tak jak każde zadanie (kliknij glif, aby zamknąć lub otworzyć, lub ${shortcutHint}, aby ustawić bezpośrednio)`,
  "shortcuts.modal.delegated.part1": () => "Oddelegowane — zadanie przypisane do kogoś. Oznaczenie ",
  "shortcuts.modal.delegated.part2": () => " jest wyróżnione w każdym miejscu, w dowolnym wierszu, pozostając edytowalnym tekstem; po ",
  "shortcuts.modal.delegated.part3": () => " wskazuje, kto zajmie się dalszym krokiem. Kilka osób: ",
  "shortcuts.modal.sectionHeaderHint.part1": () =>
    "Wiersz tekstu, po którym bezpośrednio następuje wiersz z co najmniej czterema znakami ",
  "shortcuts.modal.sectionHeaderHint.part2": () => ", staje się tytułem sekcji — np. ",
  "shortcuts.modal.sectionHeaderHint.exampleTitle": () => "Cotygodniowa synchronizacja",
  "shortcuts.modal.sectionHeaderHint.part3": () => " a następnie ",
  "shortcuts.modal.sectionHeaderHint.part4": () =>
    " w kolejnym wierszu. W ten sposób Zadania, Historia sekcji i wyszukiwanie oznaczają każdy element, a Historia sekcji łączy cykliczne spotkania (ignorując datę na początku lub końcu).",
  "shortcuts.modal.adhocSection": () =>
    "Rozmowa ad hoc — zacznij tytuł sekcji od ' (np. 'Szybka rozmowa z Dave'em). Synchronizacja kalendarza nigdy jej nie dopasowuje, nie oznacza ani nie usuwa.",

  "actionDrawer.modal.ariaLabel": () => "Zadania",
  "actionDrawer.filterPlaceholder": () => "Filtruj zadania (wpisz @ dla oddelegowanych)…",
  "actionDrawer.counter": ({ open, listed }) => `${open} otwartych / ${listed} na liście`,
  "actionDrawer.scope.openTabs.label": () => "Otwarte karty",
  "actionDrawer.scope.openTabs.title": () => "Notatki aktualnie otwarte w kartach",
  "actionDrawer.scope.otherNotes.label": () => "Inne notatki",
  "actionDrawer.scope.otherNotes.title": () => "Notatki na dysku, które nie są otwarte w kartach",
  "actionDrawer.scope.allFiles.label": () => "Wszystkie pliki",
  "actionDrawer.scope.allFiles.title": () => "Wszystkie notatki, otwarte lub nie",
  "actionDrawer.onlyOpen.label": () => "Tylko otwarte",
  "actionDrawer.onlyOpen.title": () =>
    "Pokaż tylko otwarte zadania — ukryj wykonane, odłożone i zaniechane",
  "actionDrawer.empty.noMatch": ({ filter }) => `Brak zadań pasujących do „${filter}”.`,
  "actionDrawer.empty.filterSubtitle": () =>
    "Spróbuj innego słowa kluczowego lub wyczyść filtr wyszukiwania.",
  "actionDrawer.empty.allResolved": () => "Wszystko gotowe — wszystkie zadania są rozwiązane.",
  "actionDrawer.empty.allResolvedSubtitle": () =>
    "Brak oczekujących zadań. Dodaj nowe działania w swoich notatkach za pomocą #.",
  "actionDrawer.item.lineTag": ({ line }) => `Wrsz ${line}`,
  "actionDrawer.footer.goToLine": () => "Do wiersza",
  "actionDrawer.footer.forwardToToday": () => "Przełóż na dzisiaj",
  "actionDrawer.footer.changeState": () => "Zmień stan",

  "history.modal.ariaLabel": () => "Historia sekcji",
  "history.modal.titlePrefix": ({ header }) => `Historia sekcji: „${header}”`,
  "history.modal.loadingCounter": () => "Ładowanie…",
  "history.modal.dateCount": ({ count }) => (count === 1 ? "1 data" : `${count} daty`),
  "history.strip.scrollLeft": () => "Przewiń daty w lewo",
  "history.strip.scrollRight": () => "Przewiń daty w prawo",
  "history.strip.ariaLabel": () => "Wystąpienia",
  "history.occ.title.hasContent": ({ date }) => `Kliknij dwukrotnie, aby przejść do ${date}`,
  "history.occ.title.empty": ({ date }) => `Brak treści — kliknij dwukrotnie, aby przejść do ${date}`,
  "history.strip.loading": () => "Ładowanie historii…",
  "history.strip.emptyTitle": () => "Brak historii sekcji",
  "history.strip.empty": () => "Nie znaleziono wcześniejszych wystąpień w otwartych ani zamkniętych notatkach.",
  "history.body.emptySection": () => "(brak treści w tej sekcji)",
  "history.takeover.wholeLine": () => "Cały wiersz",
  "history.takeover.actionOnly": () => "Tylko zadanie",
  "history.takeover.asAgenda": () => "Jako agenda",
  "history.takeover.asAgendaTitle": () =>
    "Tak jak Cały wiersz (otwarte pozycje są tu oznaczane jako odłożone), ale każdy punkt agendy jest w nowym miejscu otwarty.",
  "history.takeover.agendaHint": () =>
    "Przenosi zaznaczone wiersze na koniec tej sekcji jak Cały wiersz, z otwartymi pozycjami oznaczonymi tu jako odłożone, i otwiera tam każdy punkt agendy (o), także omówione.",
  "history.takeover.hint": () =>
    "Przenosi zaznaczone wiersze na koniec tej sekcji — oznaczone jako odłożone (») w tym wystąpieniu, bez usuwania.",
  "history.takeover.none": () => "Brak innego miejsca do przeniesienia z tego wystąpienia.",
  "history.body.selectPrompt": () => "Wybierz wystąpienie, aby je przejrzeć.",
  "history.footer.selectLine": () => "Wybierz wiersz",
  "history.footer.switchDate": () => "Inna data",
  "history.footer.openNote": () => "Otwórz notatkę",
  "history.footer.choices": () => "Opcje",

  "history.destination.addToQuoted": ({ name }) => `Dodaj do „${name}”`,
  "history.destination.addToToday": () => "Dodaj do dzisiaj",
  "history.destination.addToDate": ({ date }) => `Dodaj do ${date}`,
  "history.destination.addToNextOccurrence": ({ date }) => `Dodaj do kolejnego wystąpienia (${date})`,

  "commandPalette.modal.ariaLabel": () => "Paleta poleceń",
  "commandPalette.modal.queryAriaLabel": () => "Zapytanie palety poleceń",
  "commandPalette.modal.placeholder": () => "Wpisz polecenie…",
  "commandPalette.modal.resultsAriaLabel": () => "Wyniki",
  "commandPalette.legend.commands": () => "polecenia",
  "commandPalette.legend.actions": () => "zadania",
  "commandPalette.legend.dates": () => "daty",
  "commandPalette.legend.shortcuts": () => "skróty",
  "commandPalette.footer.select": () => "Wybierz",
  "commandPalette.footer.run": () => "Uruchom",
  "commandPalette.footer.filters": () => "Filtry",
  "commandPalette.noMatches": () => "Brak wyników.",
  "commandPalette.emptySubtitle": () =>
    "Spróbuj innego hasła wyszukiwania lub naciśnij klawisz Esc, aby zamknąć.",

  "commandPalette.group.commands": () => "Polecenia",
  "commandPalette.group.currentLine": () => "Bieżący wiersz",
  "commandPalette.group.help": () => "Pomoc",
  "commandPalette.group.openTabs": () => "Otwarte karty",
  "commandPalette.group.openActions": () => "Otwarte zadania",
  "commandPalette.group.dates": () => "Daty",

  "commandPalette.reopenLastClosedTab": () => "Otwórz ponownie ostatnio zamkniętą kartę",
  "commandPalette.closeCurrentTab": () => "Zamknij bieżącą kartę",
  "commandPalette.nextTab": () => "Następna karta",
  "commandPalette.previousTab": () => "Poprzednia karta",
  "commandPalette.openDatedNote": () => "Otwórz notatkę z datą…",
  "commandPalette.exportNotes.label": () => "Eksportuj wszystkie notatki do pliku (.json)",
  "commandPalette.exportNotes.hint": () => "Eksport",
  "commandPalette.toggleZenMode": () => "Przełącz tryb Zen (przestrzeń bez rozpraszaczy)",
  "commandPalette.toggleStatusBar": () => "Przełącz pasek stanu",
  "commandPalette.line.closeOpenAction": () => "Ukończ otwarte zadanie w bieżącym wierszu",
  "commandPalette.line.reopenDoneAction": () => "Otwórz ponownie ukończone zadanie w bieżącym wierszu",
  "commandPalette.line.setOpen": () => "Ustaw wiersz/zaznaczenie jako Otwarte",
  "commandPalette.line.setDone": () => "Ustaw wiersz/zaznaczenie jako Wykonane",
  "commandPalette.line.setDeferred": () => "Ustaw wiersz/zaznaczenie jako Odłożone",
  "commandPalette.line.setWontDo": () => "Ustaw wiersz/zaznaczenie jako Zaniechane",
  "commandPalette.line.setTopicToDiscuss": () => "Ustaw wiersz/zaznaczenie jako Do omówienia",
  "commandPalette.line.setTopicDiscussed": () => "Ustaw wiersz/zaznaczenie jako Omówione",
  "commandPalette.line.setTopicNotDiscussed": () => "Ustaw wiersz/zaznaczenie jako Nieomówione",
  "commandPalette.line.jumpNext": () => "Przejdź do następnego otwartego zadania",
  "commandPalette.line.jumpPrev": () => "Przejdź do poprzedniego otwartego zadania",
  "commandPalette.wrap.enable": () => "Włącz zawijanie wierszy",
  "commandPalette.wrap.disable": () => "Wyłącz zawijanie wierszy",
  "commandPalette.readable.enable": () => "Włącz wygodną szerokość linii",
  "commandPalette.readable.disable": () => "Wyłącz wygodną szerokość linii",
  "commandPalette.color.toColor": () => "Włącz kolorowe glify",
  "commandPalette.color.toGrayscale": () => "Włącz glify w odcieniach szarości",
  "commandPalette.keyboardShortcuts": () => "Skróty klawiszowe",
  "commandPalette.symbolsLegend": () => "Legenda symboli i sekcji",
  "commandPalette.checkForUpdates": () => "Sprawdź dostępność aktualizacji",
  "commandPalette.openTabs.scratchpadHint": () => "brudnopis",
  "commandPalette.openTabs.openTabHint": () => "otwarta karta",
  "commandPalette.help.openShortcutsDrawer": () => "Otwórz panel skrótów klawiszowych",
  "commandPalette.emptyActionFallback": () => "(puste zadanie)",
  "commandPalette.jumpToDate": ({ date }) => `Przejdź do ${date}`,
  "commandPalette.dateHint": () => "data",
  "commandPalette.existingNoteHint": () => "istniejąca notatka",

  "topBar.openTabsList.title": () => "Lista otwartych kart",
  "topBar.openTabsList.ariaLabel": ({ count }) =>
    `Lista otwartych kart (${count} otwart${count === 1 ? "a" : count > 1 && count < 5 ? "e" : "ych"})`,
  "topBar.activeTabAriaLabel": ({ label }) => `Aktywna karta: ${label} (otwiera listę kart)`,
  "topBar.scrollTabsLeft": () => "Przewiń karty w lewo",
  "topBar.scrollTabsRight": () => "Przewiń karty w prawo",
  "topBar.tabStatus.memoryOnly": () => "Tylko w pamięci (niezapisane na dysku)",
  "topBar.tabStatus.saveFailed": () => "Ostatni zapis tej notatki nie powiódł się",
  "topBar.closeTab": () => "Zamknij kartę",
  "topBar.newScratchpad.title": ({ combo }) => `Nowy brudnopis (${combo})`,
  "topBar.openDateNote.title": ({ combo }) => `Otwórz notatkę z datą (${combo})`,
  "topBar.label.date": () => "Data",
  "topBar.newTabMenu": () => "Nowy…",
  "topBar.moreActions.title": () => "Więcej czynności",
  "topBar.actions.title": ({ combo }) => `Zadania (${combo})`,
  "topBar.history.title": ({ combo }) => `Historia sekcji (${combo})`,
  "topBar.search.title": ({ combo }) => `Wyszukiwanie w kartach (${combo})`,
  "topBar.label.search": () => "Szukaj",
  "topBar.calendarSync.titleReady": ({ combo }) => `Synchronizuj kalendarz na ten dzień (${combo})`,
  "topBar.calendarSync.titleNoAgendaFile": () => "Brak pliku .agenda.json w Twoim folderze notatek",
  "topBar.calendarSync.titleNotAvailable": () => "Dostępne tylko dla notatki z datą dzisiejszą lub przyszłą",
  "topBar.label.calendarSync": () => "Synchronizuj kalendarz",
  "topBar.promote.title": () => "Przenieś brudnopis do dzisiejszej notatki",
  "topBar.label.promote": () => "Przenieś",
  "topBar.settings.title": ({ combo }) => `Ustawienia (${combo})`,
  "topBar.window.minimize": () => "Minimalizuj okno",
  "topBar.window.restore": () => "Przywróć okno",
  "topBar.window.maximize": () => "Maksymalizuj okno",
  "topBar.window.close": () => "Zamknij okno",
  "topBar.contextMenu.ariaLabel": () => "Działania na kartach",
  "topBar.contextMenu.close": () => "Zamknij kartę",
  "topBar.contextMenu.closeOthers": () => "Zamknij inne karty",
  "topBar.contextMenu.closeToTheRight": () => "Zamknij karty po prawej",
  "topBar.contextMenu.closeTabsWithNoOpenActions": () => "Zamknij karty bez otwartych zadań",
  "topBar.contextMenu.renameScratchpad": () => "Zmień nazwę brudnopisu",
  "topBar.contextMenu.duplicateScratchpad": () => "Duplikuj brudnopis",
  "topBar.contextMenu.copyDate": () => "Kopiuj datę",
  "topBar.contextMenu.copyPath": () => "Kopiuj ścieżkę pliku",

  "infoBar.dismiss": () => "Odrzuć",
  "infoBar.updateAvailable": ({ version }) => `Dostępna jest wersja ChronoNote ${version}.`,
  "infoBar.viewUpdate": () => "Zobacz aktualizację",
  "infoBar.updated": ({ version }) => `Zaktualizowano do ${version}.`,
  "infoBar.resolve": () => "Rozwiąż",
  "statusBar.oneDrive.signInExpired": () =>
    "Twoje logowanie do OneDrive wygasło. Kliknij, aby zalogować się ponownie.",
  "statusBar.oneDrive.statusTitle": ({ path, status }) => `OneDrive: ${path} (${status})`,
  "statusBar.oneDrive.connectPrompt": () => "Połącz OneDrive w Ustawieniach",
  "statusBar.oneDrive.ariaLabel": () => "Synchronizacja w chmurze OneDrive",
  "statusBar.oneDrive.syncingAriaLabel": () => "Synchronizowanie",
  "statusBar.oneDrive.syncingText": () => "Synchronizowanie…",
  "statusBar.oneDrive.chooseFolder": () => "Wybierz folder",
  "statusBar.oneDrive.signInAgain": () => "Zaloguj się ponownie",
  "statusBar.oneDrive.syncError": () => "Błąd synchronizacji",
  "statusBar.oneDrive.offline": () => "Offline",
  "statusBar.oneDrive.defaultFolderName": () => "Notatki",
  "statusBar.conflicts.title": () =>
    "Niektóre notatki zmieniły się na tym urządzeniu i w OneDrive — dotknij, aby wybrać",
  "statusBar.conflicts.count": ({ count }) =>
    count === 1 ? "1 konflikt synchronizacji" : `${count} konflikty synchronizacji`,
  "statusBar.browserStorage.title": () =>
    "Notatki są przechowywane w pamięci przeglądarki. Kliknij, aby otworzyć Ustawienia.",
  "statusBar.browserStorage.label": () => "Pamięć przeglądarki",
  "statusBar.changeFolderAriaLabel": () => "Zmień folder notatek",
  "statusBar.position": ({ line, col }) => `Wrsz ${line}, Kol ${col}`,
  "statusBar.selection": ({ count }) =>
    count === 1 ? "1 zaznaczony wiersz" : `${count} zaznaczone wiersze`,
  "statusBar.wordCount": ({ count }) => (count === 1 ? "1 słowo" : `${count} słów`),
  "statusBar.openCount": ({ count }) => `Otwarte ${count}`,
  "statusBar.closedCount": ({ count }) => `Zamknięte ${count}`,
  "statusBar.forwardedCount": ({ count }) => `Przełożone ${count}`,
  "statusBar.labelOpen": ({ count }) => `${count} otwarte`,
  "statusBar.labelDeferred": ({ count }) => `${count} odłożone`,
  "statusBar.labelDone": ({ count }) => `${count} wykonane`,
  "statusBar.jumpNextActionTooltip": ({ combo }) => `Przejdź do następnego otwartego zadania (${combo})`,
  "statusBar.allActionsTooltip": () => "Otwórz panel zadań (wszystkie zadania)",
  "statusBar.whatsNew": () => "Co nowego",
  "statusBar.aboutTitleWithCombo": ({ combo }) => `O programie ChronoNote (${combo})`,
  "statusBar.shortcutsTitle": ({ combo }) => `Skróty i symbole (${combo})`,

  "about.updates.sectionLabel": () => "Aktualizacje",
  "about.earlyUpdates": () => "Otrzymuj wczesne aktualizacje",
  "about.earlyUpdatesHint": () => "Wypróbuj nowe wersje kilka dni przed innymi. Mogą mieć więcej błędów.",
  "about.version.label": () => "Wersja",
  "about.chip.alwaysCurrent": () => "Zawsze aktualne",
  "about.chip.checking": () => "Sprawdzanie…",
  "about.chip.upToDate": () => "Aktualne",
  "about.chip.updateAvailable": () => "Dostępna aktualizacja",
  "about.chip.startingInstaller": () => "Uruchamianie instalatora",
  "about.chip.downloading": () => "Pobieranie",
  "about.chip.restartToFinish": () => "Uruchom ponownie, aby zakończyć",
  "about.chip.installFailed": () => "Instalacja nie powiodła się",
  "about.chip.couldntCheck": () => "Nie udało się sprawdzić",
  "about.chip.notCheckedYet": () => "Jeszcze nie sprawdzano",
  "about.web.hint": () =>
    "To jest wersja przeglądarkowa — zawsze uruchamia aktualnie wdrożoną wersję. Odśwież stronę, aby pobrać nowości.",
  "about.releaseNotes": () => "Informacje o wydaniu",
  "editor.ariaLabel": () => "Edytor notatki",
  "about.checkingHint": () => "Szukanie nowszej wersji…",
  "about.isAvailable": () => "jest dostępna.",
  "about.whatsChanged": () => "Co się zmieniło",
  "about.downloadAndInstall": () => "Pobierz i zainstaluj",
  "about.downloading.startingInstaller": () => "Uruchamianie instalatora…",
  "about.downloading.downloading": () => "Pobieranie aktualizacji…",
  "about.ready.installed": () => "Zainstalowano — uruchom ponownie, aby dokończyć.",
  "about.ready.restartNow": () => "Uruchom ponownie teraz",
  "about.error.installFailedPrefix": () => "Nie udało się zainstalować aktualizacji.",
  "about.error.blockedByPolicy": () =>
    "System Windows zablokował instalator. Zwykle Smart App Control lub oprogramowanie zabezpieczające odrzuca niepodpisany instalator; spróbuj ponownie później lub pobierz go z GitHub.",
  "about.error.tryAgain": () => "Spróbuj ponownie",
  "about.error.downloadFromGithub": () => "Pobierz z GitHuba",
  "about.error.couldntCheckPrefix": () => "Nie udało się sprawdzić aktualizacji.",
  "about.upToDate.running": () => "Używasz najnowszej wersji.",
  "about.checkForUpdates": () => "Sprawdź dostępność aktualizacji",
  "about.checkedJustNow": () => "Sprawdzono przed chwilą",
  "about.checkedMinutesAgo": ({ minutes }) =>
    `Sprawdzono ${minutes} min temu`,
  "about.checkedHoursAgo": ({ hours }) =>
    `Sprawdzono ${hours} godz. temu`,
  "about.checkAgain": () => "Sprawdź ponownie",
  "about.checkNow": () => "Sprawdź teraz",
  "about.links.sectionLabel": () => "Linki",
  "about.links.website": () => "Strona internetowa:",
  "about.links.project": () => "Kod źródłowy",
  "about.reportProblem": () => "Zgłoś problem",
  "about.reportProblemHint": () => "Otwiera nowe zgłoszenie na GitHubie z wpisaną wersją.",
  "about.diagnostics": () => "Diagnostyka",
  "about.diagnosticsHint": () => "Kopiuje wersję, ustawienia systemu i ostatnie wiersze dziennika do zgłoszenia. Bez treści notatek.",
  "about.diagnosticsCopy": () => "Kopiuj",
  "about.logFolder": () => "Folder dziennika",
  "about.logFolderHint": () => "Gdzie ChronoNote zapisuje uruchamianie i błędy.",
  "about.privacy": () => "Prywatność",
  "about.privacyHint": () => "Bez śledzenia. Notatki zostają w Twoim folderze, przeglądarce lub OneDrive.",
  "about.licences": () => "Licencje open source",
  "about.licencesHint": () => "Oprogramowanie, z którego zbudowano ChronoNote, i jego licencje.",
  "about.licencesShow": () => "Pokaż",
  "about.licencesHide": () => "Ukryj",
  "about.licencesLoading": () => "Ładowanie…",

  "common.cancel": () => "Anuluj",

  "safetyModal.ariaLabel": () => "Ostrzeżenie o nierozwiązanych zadaniach",
  "safetyModal.title": () => "Ostrzeżenie o otwartych zadaniach",
  "safetyModal.reason.dueOpen": ({ count }) =>
    count === 1 ? "ma 1 nierozwiązane otwarte zadanie" : `ma ${count} nierozwiązane otwarte zadania`,
  "safetyModal.reason.scratchpad": () =>
    "to brudnopis — jego zamknięcie bezpowrotnie usunie zawartość, ponieważ brudnopisy nie są zapisywane na dysku",
  "safetyModal.reasonJoiner": () => " oraz ",
  "safetyModal.message": ({ filename, reasons }) =>
    `Karta „${filename}” ${reasons}. Czy na pewno chcesz ją zamknąć?`,
  "safetyModal.closeAnyway": () => "Zamknij mimo to",
  "safetyModal.batchCloseMessage": ({ count }) =>
    `Zamknąć ${count} kart? Niektóre karty zawierają otwarte zadania lub niezapisane wersje robocze.`,

  "searchModal.placeholder": () => "Szukaj…",
  "searchModal.matchCount": ({ count }) =>
    count === 1 ? "1 wynik" : count > 1 && count < 5 ? `${count} wyniki` : `${count} wyników`,
  "searchModal.searchingAriaLabel": () => "Szukanie",
  "searchModal.removeFilterAriaLabel": ({ label }) => `Usuń filtr ${label}`,
  "searchModal.noMatches": ({ query }) => `Brak wyników dla „${query}”.`,
  "searchModal.emptySubtitle": () =>
    "Sprawdź pisownię lub użyj operatorów wyszukiwania, takich jak is:open lub #tag.",
  "searchModal.footer.open": () => "Otwórz",
  "searchModal.footer.select": () => "Wybierz",

  "datePicker.ariaLabel": () => "Przejdź do daty",
  "datePicker.jumpPlaceholder": () => "Przejdź do daty — dzisiaj, -2, 2026-09-05…",
  "datePicker.jumpAriaLabel": () => "Wpisz datę, aby przejść",
  "datePicker.previousMonth": () => "Poprzedni miesiąc",
  "datePicker.nextMonth": () => "Następny miesiąc",
  "datePicker.loadingOlderNotes": () => "Ładowanie starszych notatek",
  "datePicker.day.allDone": () => ", wszystkie zadania ukończone",
  "datePicker.day.pending": () => ", otwarte zadania w toku",
  "datePicker.day.log": () => ", dziennik bez zadań",
  "datePicker.day.hasNote": () => ", zawiera notatkę",
  "datePicker.day.agendaOnly": () => ", zaplanowane spotkania",
  "datePicker.today": () => "Dzisiaj",
  "datePicker.escToClose": () => "Esc, aby zamknąć",
  "datePicker.weekColumn": () => "tydz",

  "moreActions.zen": () => "Tryb Zen",
  "moreActions.peek": () => "Peek",
  "moreActions.promote.label": () => "Przenieś do dzisiejszej notatki",

  "conflictModal.ariaLabel": () => "Notatka zmieniona na dysku",
  "conflictModal.title": ({ filename }) => `„${filename}” zmieniona na dysku`,
  "conflictModal.explanation.part1": () =>
    "Ta notatka została zmodyfikowana poza ChronoNote (w innym edytorze lub przez klienta synchronizacji), podczas gdy miałeś tutaj niezapisane zmiany. Wybierz wersję do zachowania — druga nie zostanie utracona, chyba że wybierzesz ",
  "conflictModal.explanation.keepDiskRef": () => "Zachowaj z dysku",
  "conflictModal.explanation.part2": () => " lub ",
  "conflictModal.explanation.keepMineRef": () => "Zachowaj moją",
  "conflictModal.explanation.part3": () => " bez zapisywania kopii.",
  "conflictModal.keepDiskVersion": () => "Zachowaj wersję z dysku",
  "conflictModal.saveMineAsCopy": () => "Zapisz moją wersję jako kopię",
  "conflictModal.keepMyVersion": () => "Zachowaj moją wersję",

  "unsavedScratchpads.ariaLabel": () => "Niezapisana zawartość brudnopisu",
  "unsavedScratchpads.title": () => "Niezapisana zawartość brudnopisu",
  "unsavedScratchpads.leadClose": () =>
    "Zamknięcie ChronoNote spowoduje usunięcie tych brudnopisów — nie zostały one przeniesione do notatki i nie są zapisane na dysku:",
  "unsavedScratchpads.leadSwitch": () =>
    "Zmiana folderu notatek zamknie wszystkie otwarte karty. Te brudnopisy zawierają treść, która nie została przeniesiona do notatki i zostanie trwale utracona:",
  "unsavedScratchpads.confirmDiscardQuit": () => "Odrzuć i wyjdź",
  "unsavedScratchpads.confirmDiscardSwitch": () => "Odrzuć i przełącz",

  "droppedNotes.ariaLabel": () => "Różnice w upuszczonych notatkach",
  "droppedNotes.hasNoteHint.before": () => "Masz już notatkę na dzień",
  "droppedNotes.hasNoteHint.after": () =>
    ", a upuszczony plik różni się od niej. Nic nie zostało nadpisane — wybierz, co chcesz zachować.",
  "droppedNotes.tab.sideBySide": () => "Obok siebie",
  "droppedNotes.tab.yourNote": () => "Twoja notatka",
  "droppedNotes.tab.droppedFile": () => "Upuszczony plik",
  "droppedNotes.highlightedDiffer": () => "Wyróżnione wiersze to te, które się różnią.",
  "droppedNotes.keepMyNote": () => "Zachowaj moją notatkę",
  "droppedNotes.useDroppedFile": () => "Użyj upuszczonego pliku",
  "droppedNotes.keepBoth": () => "Zachowaj obie",
  "droppedNotes.keepBothHint": ({ keepBothLabel }) =>
    `„${keepBothLabel}” umieszcza upuszczony tekst pod linią podziału na końcu, aby można było go uporządkować. Zamknięcie tego okna pozostawia każdą notatkę bez zmian.`,
  "droppedNotes.nothingToReview": () => "Brak elementów do przejrzenia.",

  "migrateNotes.ariaLabel": () => "Przenieś notatki do OneDrive",
  "migrateNotes.title": () => "Przenieść notatki do OneDrive?",
  "migrateNotes.noteCount": ({ count }) =>
    count === 1 ? "1 notatka" : count > 1 && count < 5 ? `${count} notatki` : `${count} notatek`,
  "migrateNotes.body.beforeCount": () => "Masz",
  "migrateNotes.body.afterCount": () => "w pamięci przeglądarki.",
  "migrateNotes.body.beforeFolder": () => "Czy chcesz przenieść je do folderu OneDrive (",
  "migrateNotes.body.afterFolder": () => ")?",
  "migrateNotes.disclaimerHint": () =>
    "Jeśli notatka o tej samej nazwie już istnieje w OneDrive i treść się różni, obie wersje zostaną zachowane, a Ty wybierzesz właściwą — nic nie zostanie nadpisane. Bezpieczna kopia notatek z przeglądarki zostanie zapisana.",
  "migrateNotes.moving": () => "Przenoszenie notatek…",
  "migrateNotes.moveButton": () => "Przenieś notatki do OneDrive",
  "migrateNotes.switchingFolder": () => "Przełączanie folderu…",
  "migrateNotes.keepSeparate": () => "Pozostaw pamięć przeglądarki osobną",

  "findBar.placeholder": () => "Znajdź w notatce…",
  "findBar.ariaLabel": () => "Znajdź w notatce",
  "findBar.countOf": ({ current, total }) => `${current} z ${total}`,
  "findBar.noResults": () => "Brak wyników",
  "findBar.previousMatch": () => "Poprzednie dopasowanie",
  "findBar.previousTitle": () => "Poprzednie (Shift+Enter)",
  "findBar.nextMatch": () => "Następne dopasowanie",
  "findBar.nextTitle": () => "Następne (Enter)",
  "findBar.closeFind": () => "Zamknij wyszukiwanie",
  "findBar.closeTitle": () => "Zamknij (Esc)",

  "calendarSyncReview.ariaLabel": () => "Przegląd synchronizacji",
  "calendarSyncReview.title": () => "Przegląd synchronizacji",
  "calendarSyncReview.newMeetings": () => "Nowe spotkania",
  "calendarSyncReview.reordered": () => "Zmieniono kolejność",
  "calendarSyncReview.reorderedItem": ({ title }) => `${title} — przesunięte wcześniej/później dzisiaj`,
  "calendarSyncReview.removed": () => "Usunięte",
  "calendarSyncReview.removedItem": ({ title }) => `${title} — brak w kalendarzu, było puste`,
  "calendarSyncReview.noLongerOnCalendar": () => "Brak w kalendarzu",
  "calendarSyncReview.choice.leave": () => "Zostaw",
  "calendarSyncReview.choice.discard": () => "Odrzuć",
  "calendarSyncReview.choice.move": () => "Przenieś…",
  "calendarSyncReview.nothingChanged": () => "Nic się nie zmieniło od ostatniej synchronizacji.",
  "calendarSyncReview.nothingChangedSubtitle": () =>
    "Twoje codzienne notatki są już zsynchronizowane z zewnętrznym kalendarzem.",
  "calendarSyncReview.syncButton": () => "Synchronizuj",

  "syncConflicts.ariaLabel": () => "Konflikty synchronizacji",
  "syncConflicts.bodyHintAfter": () =>
    "została zmieniona na tym urządzeniu i w OneDrive w tym samym miejscu. Nic nie zostało nadpisane — wybierz wersję.",
  "syncConflicts.tab.thisDevice": () => "To urządzenie",
  "syncConflicts.badge.thisDevice": () => "To urządzenie",
  "syncConflicts.keepThisDevice": () => "Zachowaj z tego urządzenia",
  "syncConflicts.useOneDrive": () => "Użyj z OneDrive",
  "syncConflicts.keepBothHint": ({ keepBothLabel }) =>
    `„${keepBothLabel}” umieszcza tekst z OneDrive pod linią podziału na końcu, aby można było go uporządkować.`,
  "syncConflicts.noConflicts": () => "Brak konfliktów synchronizacji.",

  "syncHealth.ariaLabel": () => "Stan synchronizacji w chmurze i telemetria",
  "syncHealth.title": () => "Synchronizacja w chmurze OneDrive",
  "syncHealth.status.signInExpired": () => "Logowanie wygasło",
  "syncHealth.status.syncingChanges": () => "Synchronizowanie zmian…",
  "syncHealth.status.offlineCached": () => "Offline (w pamięci podręcznej)",
  "syncHealth.status.inSync": () => "Zsynchronizowano",
  "syncHealth.label.status": () => "Stan:",
  "syncHealth.label.lastSynced": () => "Ostatnia synchronizacja:",
  "syncHealth.relativeTime.never": () => "Nigdy",
  "syncHealth.relativeTime.justNow": ({ time }) => `Przed chwilą (${time})`,
  "syncHealth.label.localMirror": () => "Lokalna kopia:",
  "syncHealth.notesCount": ({ count }) =>
    count === 1 ? "1 notatka" : count > 1 && count < 5 ? `${count} notatki` : `${count} notatek`,
  "syncHealth.storageKind.local": () => "lokalnie",
  "syncHealth.label.pendingUploads": () => "Oczekujące na wysłanie:",
  "syncHealth.label.account": () => "Konto:",
  "syncHealth.accountFallback": () => "Połączono",
  "syncHealth.label.targetFolder": () => "Folder docelowy:",
  "syncHealth.signInExpiredHint": () =>
    "Twoje notatki są bezpieczne na tym urządzeniu. Zaloguj się ponownie, aby kontynuować synchronizację; nie zostałeś wylogowany, a oczekujące zmiany są zachowane.",
  "syncHealth.syncNowLabel": () => "Synchronizuj teraz",
  "syncHealth.openSettingsButton": () => "Otwórz Ustawienia",

  "oneDrivePicker.rootBreadcrumb": () => "Katalog główny OneDrive",
  "oneDrivePicker.ariaLabel": () => "Wybierz folder OneDrive",
  "oneDrivePicker.title": () => "Wybierz folder notatek OneDrive",
  "oneDrivePicker.goUpFolder": () => "Przejdź folder wyżej",
  "oneDrivePicker.loadingFolders": () => "Ładowanie folderów…",
  "oneDrivePicker.retry": () => "Ponów próbę",
  "oneDrivePicker.noSubfolders": () => "Brak podfolderów w tym folderze.",
  "oneDrivePicker.newFolderPlaceholder": () => "Nazwa nowego folderu…",
  "oneDrivePicker.creating": () => "Tworzenie…",
  "oneDrivePicker.create": () => "Utwórz",
  "oneDrivePicker.newSubfolder": () => "Nowy podfolder",
  "oneDrivePicker.currentTarget": () => "Bieżący cel:",
  "oneDrivePicker.useThisFolder": () => "Użyj tego folderu",
  "oneDrivePicker.toast.createFolderFailedPrefix": () => "Nie udało się utworzyć folderu:",
  "oneDrivePicker.toast.folderSet": ({ path }) => `Folder notatek ustawiony na OneDrive: ${path}`,
  "oneDrivePicker.toast.setFolderFailedPrefix": () => "Nie udało się ustawić folderu:",
  "oneDrivePicker.toast.couldntSwitchFolders": () => "Nie udało się zmienić folderu",
  "oneDrivePicker.toast.archivedNotes": ({ count }) =>
    count === 1
      ? "1 notatka z poprzedniego folderu nie mogła zostać zsynchronizowana — kopia została zachowana na tym urządzeniu."
      : `${count} notatek z poprzedniego folderu nie mogło zostać zsynchronizowanych — kopia została zachowana na tym urządzeniu.`,
  "oneDrivePicker.toast.switchFoldersFailedPrefix": () => "Nie udało się zmienić folderu:",
  "oneDrivePicker.toast.movedWithConflicts": ({ count }) =>
    count === 1
      ? "Przeniesiono notatki z 1 konfliktem do przejrzenia."
      : `Przeniesiono notatki z ${count} konfliktami do przejrzenia.`,
  "oneDrivePicker.toast.migrationFailedPrefix": () => "Migracja nie powiodła się:",
  "oneDrivePicker.toast.couldntSwitchBeforeSwitching": ({ folderPath, reason }) =>
    `Nie udało się zsynchronizować ${folderPath} przed zmianą (${reason}). Nic nie zostało zmienione.`,
  "oneDrivePicker.toast.heldConflictsReason": ({ count }) =>
    count === 1
      ? "1 notatka ma konflikt synchronizacji do wcześniejszego rozwiązania"
      : `${count} notatki mają konflikty synchronizacji do wcześniejszego rozwiązania`,
  "oneDrivePicker.toast.syncFailedNoDetail": () => "synchronizacja nie powiodła się",

  "mobileAccessory.ariaLabel": () => "Szybkie akcje edytora",
  "mobileAccessory.openTask.ariaLabel": () => "Otwarte zadanie (pole)",
  "mobileAccessory.openTask.titleWord": () => "Zadanie",
  "mobileAccessory.completedTask.ariaLabel": () => "Ukończone zadanie (ptaszek)",
  "mobileAccessory.completedTask.titleWord": () => "Ukończone",
  "mobileAccessory.deferredTask.ariaLabel": () => "Odłożone zadanie (pole)",
  "mobileAccessory.deferredTask.titleWord": () => "Odłożone",
  "mobileAccessory.wontDoTask.ariaLabel": () => "Zaniechane zadanie (pole)",
  "mobileAccessory.wontDoTask.titleWord": () => "Zaniechane",
  "mobileAccessory.topicToDiscuss.ariaLabel": () => "Temat do omówienia (kółko)",
  "mobileAccessory.topicToDiscuss.titleWord": () => "Do omówienia",
  "mobileAccessory.topicDiscussed.ariaLabel": () => "Temat omówiony (punkt)",
  "mobileAccessory.topicDiscussed.titleWord": () => "Omówiony",
  "mobileAccessory.topicNotDiscussed.ariaLabel": () => "Temat nieomówiony (kropkowane kółko)",
  "mobileAccessory.topicNotDiscussed.titleWord": () => "Nieomówiony",
  "mobileAccessory.bulletList.ariaLabel": () => "Lista punktowana",
  "mobileAccessory.bulletList.titleWord": () => "Punktor",
  "mobileAccessory.followUp.ariaLabel": () => "Strzałka kontynuacji",
  "mobileAccessory.followUp.titleWord": () => "Kontynuacja",
  "mobileAccessory.emphasis": () => "Wyróżnienie",
  "mobileAccessory.indent.ariaLabel": () => "Zwiększ wcięcie (2 spacje)",
  "mobileAccessory.indentWord": () => "Wcięcie",
  "mobileAccessory.dedent.ariaLabel": () => "Zmniejsz wcięcie (2 spacje)",
  "mobileAccessory.dedentWord": () => "Cofnij wcięcie",
  "mobileAccessory.undo": () => "Cofnij",
  "mobileAccessory.redo": () => "Ponów",
  "mobileAccessory.more": () => "Więcej",
  "mobileAccessory.hideKeyboard": () => "Ukryj klawiaturę",

  "mobileTabDrawer.ariaLabel": () => "Otwarte karty",
  "mobileTabDrawer.title": () => "Otwarte karty",
  "mobileTabDrawer.closeTabList": () => "Zamknij listę kart",
  "mobileTabDrawer.memoryOnly": () => "Tylko w pamięci",
  "mobileTabDrawer.closeTab": ({ label }) => `Zamknij ${label}`,
  "mobileTabDrawer.newScratchpad": () => "Nowy brudnopis",
  "mobileTabDrawer.openDateNote": () => "Otwórz notatkę z datą",

  "toast.actions.forwardedToToday": () => "Przełożono do dzisiejszych priorytetów!",
  "toast.actions.forwardFailed": () => "Nie udało się dodać zadania do dzisiejszej notatki, więc nic nie zostało zmienione",
  "toast.diagnosticsCopied": () => "Skopiowano diagnostykę",
  "toast.unexpectedError": () => "Coś poszło nie tak. Szczegóły: Ustawienia → O programie → Diagnostyka.",
  "toast.boot.oneDrive.connected": () => "Połączono z OneDrive",
  "toast.boot.oneDrive.connectedChooseFolder": () => "Połączono z OneDrive — teraz wybierz folder do synchronizacji",
  "toast.boot.oneDrive.signInFailedPrefix": () => "Logowanie do OneDrive nie powiodło się:",
  "toast.boot.oneDrive.signInErrorPrefix": () => "Błąd logowania do OneDrive:",
  "toast.boot.failedToSave.theme": () => "Nie udało się zapisać preferencji motywu",
  "toast.boot.failedToSave.lightDark": () => "Nie udało się zapisać preferencji jasnego/ciemnego motywu",
  "toast.boot.failedToSave.language": () => "Nie udało się zapisać preferencji języka",
  "toast.boot.failedToSave.wordWrap": () => "Nie udało się zapisać preferencji zawijania wierszy",
  "toast.boot.failedToSave.readingWidth": () => "Nie udało się zapisać preferencji szerokości czytania",
  "toast.boot.failedToSave.updateCheck": () => "Nie udało się zapisać preferencji sprawdzania aktualizacji",
  "toast.boot.failedToSave.calendarSync": () => "Nie udało się zapisać preferencji synchronizacji kalendarza",
  "toast.boot.failedToSave.fontSize": () => "Nie udało się zapisać preferencji rozmiaru czcionki",
  "toast.boot.failedToSave.lineHeight": () => "Nie udało się zapisać preferencji interlinii",
  "toast.boot.failedToSave.pureBlack": () => "Nie udało się zapisać preferencji czystej czerni",
  "toast.boot.failedToSave.startup": () =>
    "Nie udało się zapisać preferencji karty startowej",
  "toast.boot.failedToSave.statusBarVisible": () =>
    "Nie udało się zapisać ustawienia paska stanu",
  "toast.boot.failedToSave.tabLabelStyle": () => "Nie udało się zapisać ustawienia etykiet kart",
  "toast.boot.couldntOpenNotes": ({ filenames }) => `Nie udało się otworzyć tych notatek, więc pozostają zamknięte: ${filenames}`,
  "toast.calendarSync.noMeetingsOn": ({ date }) => `Brak spotkań w dniu ${date}.`,
  "toast.calendarSync.synced": () => "Kalendarz zsynchronizowany.",
  "toast.copyForward.destHere": () => "tutaj",
  "toast.copyForward.destToDate": ({ date }) => `do ${date}`,
  "toast.copyForward.copied": ({ dest }) => `Skopiowano ${dest}.`,
  "toast.copyForward.changedTryAgain": ({ filename }) => `Plik ${filename} zmienił się na dysku, więc nic nie zostało skopiowane. Spróbuj ponownie.`,
  "toast.copyForward.sourceChanged": ({ dest, filename }) => `Skopiowano ${dest}, ale plik ${filename} zmienił się na dysku, więc jego elementy nie zostały oznaczone jako przeniesione.`,
  "toast.copyForward.copiedWithCount": ({ dest, count }) =>
    count === 1
      ? `Skopiowano ${dest} — 1 otwarte zadanie oznaczono tutaj jako odłożone.`
      : `Skopiowano ${dest} — ${count} otwartych zadań oznaczono tutaj jako odłożone.`,
  "toast.copyForward.notAvailableInScratchpad": () =>
    "Niedostępne w brudnopisie — brak kolejnego wystąpienia do skopiowania.",
  "toast.copyForward.nothingToCopy": () => "Brak treści do skopiowania w tym wierszu ani w zaznaczeniu.",
  "toast.copyForward.notInNamedSection": () => "Zaznaczenie nie znajduje się w nazwanej sekcji.",
  "toast.copyForward.noMatchingOccurrence": () => "Nie znaleziono pasującego kolejnego wystąpienia — wybierz datę.",
  "toast.directory.switched": ({ path }) => `Przełączono folder notatek na ${path}`,
  "directory.folderSwitchNote": ({ folderName }) =>
    `Podczas synchronizowania folderu ${folderName} możesz swobodnie korzystać z tego brudnopisu.\n\n` +
    `Jeśli pozostawisz go pustym, zamknie się po zakończeniu synchronizacji i otworzy dzisiejszą notatkę. ` +
    `Jeśli coś tu wpiszesz, pozostanie otwarty obok dzisiejszej notatki.\n`,
  "toast.drift.deletedOnDisk": ({ filename }) =>
    `Plik ${filename} został usunięty na dysku — zapisz, aby utworzyć go ponownie`,
  "toast.drift.reloadedChanged": ({ filename }) => `Przeładowano ${filename} — zmieniono na dysku`,
  "toast.drift.reloadedFromDisk": ({ filename }) => `Przeładowano ${filename} z dysku`,
  "toast.drift.keptYourVersion": ({ filename }) => `Zachowano Twoją wersję ${filename}`,
  "toast.drift.changedAgain": ({ filename }) => `Plik ${filename} zmienił się ponownie na dysku`,
  "toast.drift.savedAs": ({ name }) => `Zapisano Twoją wersję jako ${name}`,
  "toast.drift.couldntSaveCopy": () => "Nie udało się zapisać kopii — brak zmian",
  "toast.exportImport.importedNoteCount": ({ count }) =>
    count === 1
      ? "Zaimportowano 1 notatkę"
      : count > 1 && count < 5
        ? `Zaimportowano ${count} notatki`
        : `Zaimportowano ${count} notatek`,
  "toast.exportImport.skippedCount": ({ count }) => `pominięto ${count}`,
  "toast.exportImport.couldntReadExportFile": () => "Nie udało się odczytać pliku eksportu.",
  "toast.exportImport.differsFromWhatYouHave": ({ count }) =>
    count === 1
      ? "1 różni się od Twojej wersji"
      : count > 1 && count < 5
        ? `${count} różnią się od Twojej wersji`
        : `${count} różni się od Twojej wersji`,
  "toast.exportImport.noNotesImported": () => "Nie zaimportowano żadnych notatek.",
  "toast.exportImport.couldntSavePrefix": ({ name }) => `Nie udało się zapisać ${name}:`,
  "toast.history.cursorNotInSection": () => "Kursor nie znajduje się w nazwanej sekcji.",
  "toast.paste.deferRestored": ({ count, filename }) =>
    count > 1
      ? `${count} odłożonych zadań w ${filename} przywrócono jako otwarte`
      : `Odłożone zadanie w ${filename} przywrócono jako otwarte`,
  "toast.paste.deferredAgain": ({ count, filename }) =>
    count > 1 ? `${count} zadań w ${filename} odłożono ponownie` : `Zadanie w ${filename} odłożono ponownie`,
  "toast.paste.originalMarkedDeferred": ({ count, filename }) =>
    count > 1
      ? `${count} oryginalnych zadań w ${filename} oznaczono jako odłożone`
      : `Oryginalne zadanie w ${filename} oznaczono jako odłożone`,
  "toast.tabs.noRecentlyClosedTabs": () => "Brak ostatnio zamkniętych kart.",
  "toast.tabs.nothingToPromote": () => "Brak treści do przeniesienia.",
  "toast.tabs.promotedScratchpad": ({ filename }) => `Przeniesiono brudnopis do ${filename}`,
  "toast.tabs.scratchpadRenamed": ({ name }) => `Zmieniono nazwę brudnopisu na ${name}`,
  "toast.tabs.duplicatedAsScratchpad": () => "Zduplikowano do nowego brudnopisu",
  "toast.tabs.copiedToClipboard": ({ text }) => `Skopiowano "${text}" do schowka`,
  "toast.syncConflicts.couldntResolvePrefix": ({ name, message }) =>
    `Nie udało się rozwiązać konfliktu w ${name}: ${message}`,
  "toast.syncConflicts.keptOneDriveVersion": ({ name }) => `Zachowano wersję OneDrive pliku ${name}`,
  "toast.syncConflicts.keptBothVersions": ({ name }) => `Zachowano obie wersje pliku ${name}`,
  "toast.syncConflicts.keptThisDeviceVersion": ({ name }) => `Zachowano wersję z tego urządzenia pliku ${name}`,
  "toast.oneDriveSync.chooseFolderFirst": () => "Najpierw wybierz folder OneDrive (Ustawienia → Przeglądaj…)",
  "toast.oneDriveSync.syncFinished": () => "Synchronizacja OneDrive zakończona",
  "toast.oneDriveSync.syncFailedPrefix": ({ message }) => `Synchronizacja OneDrive nie powiodła się: ${message}`,
  "toast.oneDriveSync.couldntStartSignInPrefix": ({ message }) => `Nie udało się rozpocząć logowania: ${message}`,
  "toast.oneDriveSync.signInExpired": () => "Twoje logowanie do usługi OneDrive wygasło. Kliknij, aby zalogować się ponownie.",
  "toast.persistence.failedToSaveNote": () => "Nie udało się zapisać notatki",
  "toast.persistence.keptChangedNote": ({ filename }) => `Plik ${filename} zmienił się na dysku, więc został zachowany zamiast usunięty`,
  "toast.boot.configFromNewerVersion": () => "Ustawienia zapisała nowsza wersja ChronoNote. Niektóre mogą nie działać.",
  "toast.dragDrop.unsupportedFile": () => "Nieobsługiwany plik. Upuść eksport .json lub notatkę YYYY-MM-DD.txt.",
  "onboarding.scratchpadName": () => "Witamy",
  "toast.onboarding.mobileHint": () =>
    "Dotknij dowolnego znacznika na dolnym pasku, aby przekształcić wiersze w zadania lub tematy spotkań.",
  "error.agendaInvalid": () =>
    "Plik kalendarza (.agenda.json) jest nieobecny, pusty lub nieprawidłowy — sprawdź proces synchronizacji.",
  "error.oneDriveSyncBusy": () => "Trwa synchronizacja — spróbuj ponownie za chwilę",
  "error.oneDriveLoopbackBindFailed": ({ detail }) =>
    `Nie udało się uruchomić lokalnego odbiornika logowania: ${detail}`,
  "error.oneDriveBrowserOpenFailed": ({ detail }) =>
    `Nie udało się otworzyć przeglądarki do logowania: ${detail}`,
  "error.oneDriveCallbackAcceptFailed": ({ detail }) =>
    `Wystąpił błąd podczas oczekiwania na odpowiedź logowania: ${detail}`,
  "error.oneDriveAuthTimedOut": () =>
    "Przekroczono limit czasu logowania — nie ukończono autoryzacji w przeglądarce na czas.",
  "error.oneDriveNoAuthCode": () => "We wklejonym tekście nie znaleziono kodu autoryzacji.",
  "error.oneDriveNoPendingSession": () =>
    'Brak trwającego logowania — najpierw kliknij „Połącz konto Microsoft”.',
  "error.oneDriveKeychainSaveFailed": ({ detail }) =>
    `Zalogowano pomyślnie, ale nie udało się bezpiecznie zapisać poświadczeń: ${detail}`,
  "error.oneDriveAuthStateSaveFailed": ({ detail }) =>
    `Zalogowano pomyślnie, ale nie udało się zapisać stanu logowania: ${detail}`,
  "error.oneDriveProfileFetchFailed": ({ detail }) =>
    `Zalogowano pomyślnie, ale nie udało się pobrać danych konta: ${detail}`,
  "error.oneDriveMissingRefreshTokenScope": () =>
    "Firma Microsoft nie przyznała trwałego dostępu — upewnij się, że rejestracja aplikacji żąda uprawnienia offline_access.",
  "error.oneDriveTokenRequestFailed": ({ detail }) =>
    `Nie udało się nawiązać połączenia z firmą Microsoft w celu logowania: ${detail}`,
  "error.oneDriveTokenExchangeRejected": ({ detail }) =>
    `Firma Microsoft odrzuciła logowanie: ${detail}`,
  "error.oneDriveTokenResponseUnparseable": ({ detail }) =>
    `Odpowiedź logowania firmy Microsoft była nieczytelna: ${detail}`,
  "editorMenu.ariaLabel": () => "Menu edytora",
  "editorMenu.clipboard": () => "Schowek",
  "editorMenu.cut": () => "Wytnij",
  "editorMenu.copy": () => "Kopiuj",
  "editorMenu.paste": () => "Wklej",
  "editorMenu.copyToNext": () => "Kopiuj do następnego wystąpienia",
  "editorMenu.peek": () => "Ta sekcja w Peek",
  "editorMenu.toSection": () => "Zamień w nagłówek sekcji",
  "phoneNav.ariaLabel": () => "Nawigacja główna",
  "phoneNav.actions": () => "Akcje",
  "phoneNav.history": () => "Historia",
  "phoneNav.search": () => "Szukaj",
  "phoneNav.note": () => "Notatka",
  "phoneNav.today": () => "Dzisiaj",
  "phoneNav.yesterday": () => "Wczoraj",
  "phoneNav.tomorrow": () => "Jutro",
  "phoneNav.openCount": (params) => `${params?.count ?? 0} otwarte`,
  "phoneNav.previous": () => "Poprzednia notatka",
  "phoneNav.next": () => "Następna notatka",
  "pane.resize": () => "Zmień rozmiar panelu",
  "settings.trash.label": () => "Ostatnio usunięte",
  "settings.trash.hint": () => "Notatki usunięte w ostatnich 30 dniach. Starsze są usuwane na stałe.",
  "settings.trash.empty": () => "Nic nie usunięto ostatnio.",
  "settings.trash.restore": () => "Przywróć",
  "settings.trash.deletedOn": (p) => (p?.when ? `Usunięto ${p.when}` : "Usunięto"),
  "toast.trash.restored": (p) => (p?.filename ? `Przywrócono ${p.filename}` : "Przywrócono"),
  "toast.trash.noteExists": (p) => (p?.filename ? `${p.filename} ma już tekst. Przywracanie anulowane.` : "Notatka ma już tekst. Przywracanie anulowane."),
} satisfies Dictionary;
