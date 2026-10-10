import type { SupportedLocale } from "./index";

export type Concept =
  | "open"
  | "done"
  | "deferred"
  | "wontDo"
  | "section"
  | "topic"
  | "peek"
  | "scratchpad"
  | "notesFolder";

export const CONCEPTS: Concept[] = [
  "open",
  "done",
  "deferred",
  "wontDo",
  "section",
  "topic",
  "peek",
  "scratchpad",
  "notesFolder",
];

export const GLOSSARY: Record<SupportedLocale, Record<Concept, string>> = {
  en: {
    open: "open",
    done: "done",
    deferred: "deferred",
    wontDo: "won't-do",
    section: "section",
    topic: "topic",
    peek: "peek",
    scratchpad: "scratchpad",
    notesFolder: "notes folder",
  },
  nl: {
    open: "open",
    done: "voltooid",
    deferred: "doorgeschoven",
    wontDo: "vervallen",
    section: "sectie",
    topic: "onderwerp",
    peek: "peek",
    scratchpad: "kladblok",
    notesFolder: "notitiemap",
  },
  de: {
    open: "offen",
    done: "erledigt",
    deferred: "verschoben",
    wontDo: "entfällt",
    section: "Abschnitt",
    topic: "Thema",
    peek: "peek",
    scratchpad: "Notizblock",
    notesFolder: "Notizordner",
  },
  fr: {
    open: "ouvert",
    done: "terminé",
    deferred: "reporté",
    wontDo: "abandonné",
    section: "section",
    topic: "sujet",
    peek: "peek",
    scratchpad: "brouillon",
    notesFolder: "dossier de notes",
  },
  pl: {
    open: "otwarte",
    done: "wykonane",
    deferred: "odłożone",
    wontDo: "zaniechane",
    section: "sekcja",
    topic: "temat",
    peek: "peek",
    scratchpad: "brudnopis",
    notesFolder: "folder notatek",
  },
  es: {
    open: "pendiente",
    done: "completada",
    deferred: "pospuesta",
    wontDo: "descartada",
    section: "sección",
    topic: "tema",
    peek: "peek",
    scratchpad: "borrador",
    notesFolder: "carpeta de notas",
  },
  it: {
    open: "aperta",
    done: "completata",
    deferred: "rimandata",
    wontDo: "annullata",
    section: "sezione",
    topic: "argomento",
    peek: "peek",
    scratchpad: "bozza",
    notesFolder: "cartella delle note",
  },
};
