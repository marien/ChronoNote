# Phone companion: Power Apps build instructions

Instructions for building the phone side of ChronoNote's phone companion (a Power Apps canvas app and a few Power
Automate flows) with an AI model in the environment where the app will run. The design and the file formats are
decided in this repo (`docs/design/mobile-companion-design.md`, `docs/phone-companion-file-guide.md`); these files
turn them into briefs.

| File | For |
| :--- | :--- |
| [reference.md](reference.md) | The model, every phase: ground rules, verified environment facts, delivery format, file formats, note syntax, matching rules, visual language. |
| [phase-1.md](phase-1.md) | The model: read-only app (flows `CNList` and `CNRead`, the copy on the device, Days, Day and Meeting screens). |
| [phase-2.md](phase-2.md) | The model: proposing changes through `inbox.json` (flow `CNWriteInbox`, line menu, Add and Pending screens). |

## How to use this

Hand the model two files per phase: `reference.md` (every time) and that phase's file. The repo owns the design and
the file formats; the model owns the Power Apps and Power Automate implementation.

1. **Phase 1 (read-only): start now.** Give the model `reference.md` and `phase-1.md`. It will first ask for a
   "View code" sample from your Studio so its pasted code matches your version.
2. **Phase 2 (proposing changes): wait.** It needs ChronoNote to process the inbox, which is not built yet. When the
   ChronoNote side is ready, hand over `reference.md` and `phase-2.md` in a fresh conversation with the model, plus
   the app as it stands.
3. **Later:** deferring an action to another day from the phone (design section 10). Not briefed yet.

## Before you start phase 1

- **The meeting index needs a ChronoNote build from the `feat/phone-companion` branch.** The released 0.35.0 does
  not write `outbox.json`. Without it the app still shows the 4-week window's notes; only a meeting's history before
  the window is missing.
- **Your notes folder path** as the OneDrive connector shows it. The flows need it; nothing else does.
- **Building the flows is click work:** the brief gives the model exact expressions, and it turns them into steps.

## What comes back to the ChronoNote side

- **Behaviour questions** the model raises that change what the app does (not how it's built), so the design stays
  in one place.
- **Anything that disagrees with the file formats** in `reference.md`, or a note that the app draws wrongly,
  described in words (what you saw, what you expected).
- **Results of the acceptance tests** at the end of each phase file.

Nothing about the organisation, the notes' content or the app's code needs to come back.

## Ground rules the briefs give the model

- The app never writes a note, the agenda or the outbox. In phase 2 it writes one file only:
  `.chrononote-mobile/inbox.json`.
- Standard connectors only (OneDrive for Business). No premium connectors, no Dataverse, no custom connectors, no
  HTTP.
- It works offline from the copy on the phone.
- The reference is the agreement: where the model wants to deviate, it asks.
