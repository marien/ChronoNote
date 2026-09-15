# Microsoft 365 calendar import — design

Status: **superseded, 2026-09-15 — see `docs/CHANGELOG.md` §162.** The
OAuth/Graph approach documented below was fully implemented on the
`m365-reconciliation-engine` branch, then parked (an org's Entra admin
consent requirement turned out to be a people problem, not a code one —
see the branch's own commit history). Marien then asked to drop M365
entirely in favor of reading a `.agenda.json` file from the notes folder,
kept up to date by an external process — no OAuth, no Settings
connection state, no network call. The reconciliation engine itself
(§2.4 below) is unchanged and still the actual mechanism; only §2.1-§2.3's
"where do the events come from" layer was replaced. Kept here for the
history of why the reconciliation design looks the way it does.

Status (original): **design only, not yet implemented.** Written 2026-09-14 at
Marien's request, superseding the "Feature 3.2" sketch in
`docs/design/maturity-0.7-roadmap.md` (that doc is closed/historical —
its M365 section is kept for the auth/fetch groundwork, which this
document inherits, but its "additive only, never reconciles" sync
decision is explicitly replaced below).

## 1. Why this exists, and why it's not simple

`docs/CHANGELOG.md` §3 removed an earlier *mocked* calendar sync
(`calendar.rs`, `sync_calendar_mock`) very early in the project, along
with a spec tenet ("Resilient Calendar Integration") that tried to
reconcile cancelled/rescheduled events against note content. That call
was right for the time — there was no real event source, and the
reconcile logic fought the plain-text tenet.

Marien now wants it back, for real, with one extra requirement the
earlier sketch (`maturity-0.7-roadmap.md`'s Feature 3.2) explicitly
avoided: **a sync must handle meetings that were added, moved, or
removed since the last import** — not just append new ones. That's the
genuinely hard part, and §2.4 below is the actual design for it, worked
out with Marien directly (see the "Reconciliation mechanism" decision):
no hidden sidecar file, no visible tag in the header — the *order* of
sections in the note, plus title matching against the current calendar,
is the entire mechanism.

There's also a real practical concern: Marien isn't sure the Entra/Graph
side will work smoothly against their own organization's tenant on the
first try (admin consent, tenant restrictions, etc. are all things that
can only really be found out by trying). So the reconciliation engine
(§2.4) is designed to **not know or care where its input list came
from** — it takes a plain, ordered list of meeting *titles*, nothing
else. A live Graph fetch produces that list one way; §3.2's **"Sync from
a list"** produces the exact same shape of list by hand (paste titles,
one per line). Both feed the identical engine and the identical review
UI (§3.3). This means the actual hard part of this feature — correct
add/move/remove handling — is fully usable, and testable, from day one,
independent of whether the OAuth path ever works at all.

## 2. Scope and behavior, as requested

- **Desktop only.** OAuth's system-browser + loopback flow, OS-keychain
  token storage, and the Rust HTTP client are all desktop concepts — the
  web app and demo have no Rust backend to hold any of this. Not
  revisited here; a browser-side OAuth flow for the web app would be a
  separate, later design if ever wanted.
- **Today or a future date only.** A dated tab whose filename is before
  `todayISO()` never offers calendar import/sync — there's nothing to
  reconcile against a day that's already happened, and Graph's
  `calendarView` isn't the right source for historical record-keeping
  (the note itself is). Gate: `filename.slice(0, 10) >= todayISO()`
  (plain ISO string comparison sorts correctly). A scratchpad has no
  date at all, so it never offers this either — same restriction the
  "Open Date Note"/Promote actions already apply.
- **At least one participant.** An event is only considered a real
  "meeting" worth a section if Graph's `attendees` array is non-empty.
  This excludes personal blocks (focus time, "lunch," a reminder someone
  set on their own calendar) that show up in `calendarView` but have no
  one else on them. `attendees` on a Graph event does not include the
  organizer, so `attendees.length > 0` is exactly "at least one other
  participant."
- **One section per meeting**, subject-only header (no time prefix) —
  unchanged from the earlier design, and confirmed again below since
  it's load-bearing for how reconciliation matches sections to events
  (§2.4).
- **A way to re-sync a day** once meetings have changed — the actual
  point of this document.

### 2.1 Auth

Unchanged from `maturity-0.7-roadmap.md`'s Feature 3.2 — that groundwork
holds:

- **Microsoft Entra ID, OAuth 2.0 Authorization Code + PKCE**, public
  client (desktop app, no client secret to leak).
- Scopes: `Calendars.Read`, `offline_access`, `User.Read`, `openid`,
  `profile`.
- "For Business" = work/school account. The Entra **app registration**
  is multi-tenant; some organizations require admin consent for
  ChronoNote — document this, and provide an advanced escape hatch (a
  client-ID override field in Settings) for locked-down tenants that
  need their own registration.
- **Flow:** the system browser (`tauri-plugin-opener`) opens Microsoft's
  sign-in page; a loopback redirect (`http://127.0.0.1:<ephemeral>/`)
  is caught by a short-lived local HTTP listener. Password and MFA
  happen entirely on Microsoft's page — ChronoNote receives only the
  auth code and exchanges it for tokens in Rust. It never sees the
  password.
- **Loopback listener implementation:** a minimal hand-rolled `tiny_http`
  server bound to an ephemeral port, torn down the instant the redirect
  lands (success or error) — simpler and smaller than pulling in a
  dedicated OAuth plugin for one request/response exchange, and keeps
  the new dependency surface to what's actually needed (HTTP client +
  keychain, not also a plugin's own async runtime assumptions). Worth
  revisiting only if the hand-rolled listener turns out flaky in
  practice.

### 2.2 Token storage

The refresh token is a long-lived secret. It goes in the OS credential
store via the `keyring` crate (`chrononote` / `m365-refresh-token`) —
**never** `config.json` (plaintext) and **never** the notes folder.
`config.json` holds only non-secret state:

```jsonc
"m365": {
  "connected": true,
  "account_email": "marien@contoso.com"
}
```

Disconnecting (Settings) deletes the keychain entry and clears this
block.

### 2.3 Fetching and filtering

`GET /me/calendarView?startDateTime=<day 00:00>&endDateTime=<day
24:00>` with `Prefer: outlook.timezone="<local>"` — `calendarView`
expands recurring series into that day's actual instances. Page through
`@odata.nextLink`. All HTTP + token refresh happens in Rust (`reqwest` +
rustls) — secrets never reach the frontend.

Per event, keep: `subject`, `start`/`end` (local, for ordering only —
see §2.4, never written into the note), `isCancelled`, `attendees`
(just to compute a count).

```rust
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub subject: String,
    pub start_local: String, // "HH:MM", 24h — sort key only
    pub end_local: String,
    pub is_cancelled: bool,
    pub attendee_count: u32,
}
```

**Filter applied in Rust before the list ever reaches the frontend:**
`attendee_count > 0 && !is_cancelled`. This is "today's real agenda."
Before it reaches the reconciliation engine (§2.4), the frontend maps
this down to just the ordered `subject` strings — the engine's actual
input type, shared with the manual entry path (§3.2), is `string[]`,
not `CalEvent[]`. The richer per-event data (time, cancellation) exists
only to build that filtered, ordered title list and to sort/annotate the
sync review (§3.3) — it's discarded once the title list is handed off.

### 2.4 Reconciliation mechanism — the actual design

This is the part that's genuinely new versus the earlier sketch.
**No sidecar file, no ID, no visible tag in the header.** Its entire
input is `(existingNoteContent: string, agendaTitles: string[])` — an
ordered list of plain title strings, source-agnostic (§2.3's live fetch
or §3.2's manual paste both just produce this same shape). Two things
carry all the state that's needed:

1. **Title matching.** A section "belongs" to an agenda item this sync
   if its header text matches that item's title (case-insensitive,
   trimmed) — exactly the same identity rule Section History already
   uses to aggregate a recurring section, so this isn't a new kind of
   matching for the codebase to reason about.
2. **The calendar block's position.** Every section that currently
   matches *some* item in today's agenda list defines the span of the
   note that calendar sync owns — the **calendar block** is the
   contiguous run of sections from the first such match to the last. On
   the very first sync for a day (no existing matches yet), the block
   doesn't exist yet — the new sections are appended at the end of the
   note, the same place every other additive action in this app inserts
   new content (manual import, section-from-line). That end-of-note run
   *becomes* the block for the next sync to find.

A sync pass does this, in order:

1. Get today's agenda titles, in order (§2.3's live fetch, or §3.2's
   pasted list — from here on it's the same list either way).
2. Find every section in the note whose title matches one of those
   items. This set's span in the document is the calendar block; call
   the matched sections `present`.
3. For each item in agenda order:
   - If it matches a `present` section, that section (header + its
     entire body, i.e. every line up to the next section or end of
     file) is kept, carrying whatever content the user already added.
   - If it doesn't match anything, a new empty section is created for
     it (just the header + underline — same as a fresh manual import).
4. **Reorder** the block so its sections now appear in exactly this
   agenda order — a meeting that moved from 9am to 2pm (or a title
   dragged to a new position in a pasted list) physically moves within
   the note, body and all, to its new position among the other calendar
   sections. This is the "order tells you it moved"
   mechanism Marien specified: no start time is ever written into the
   file, so there's nothing *else* that could show a reschedule — the
   position is the signal.
5. Any section that was in the block but matched **no** event in this
   sync's fetch is "no longer there" — the meeting was moved to a
   different day, cancelled, or deleted (indistinguishable from here,
   and that's fine — the recovery step below is the same either way):
   - **Empty section** (nothing typed under it): removed outright, no
     prompt. Nothing of value existed to protect.
   - **Non-empty section**: never silently deleted or silently kept —
     the sync review (§3.3) asks, per section: **move its content to
     another day**, **discard it**, or **leave it here, flagged**. A
     "leave it" choice prefixes the header with `[CANCELED]` (reusing
     the exact marker `tokens.ts`'s `normalizeHeaderTitle()` already
     strips for Section History/Action-Drawer matching and display, so
     the flagged section still surfaces correctly everywhere by its real
     name — this convention already existed in the code, unused, since
     whatever the original pre-§3 design anticipated). "Move to another
     day" asks for a target date and appends the whole section (header
     + body) to that day's note, via the same `linesToSections`-style
     append every other cross-day content move in this app already
     uses. "Discard" deletes the section outright — an explicit,
     reviewed choice, not a silent one, same standard as Settings'
     "Replace everything" import mode.

**Worked example.** Today's note before a re-sync:

```
Weekly Standup
==============
# ship the migration guide

1:1 with Priya
==============
```

Yesterday's calendar had "Weekly Standup" at 9:00 and "1:1 with Priya"
at 10:00. Since then: Priya's 1:1 was cancelled, Standup moved to 9:30,
and a new "Design Review" at 11:00 appeared, with Marien invited to it.
Today's real agenda (participants > 0, not cancelled), in order:
`Weekly Standup (9:30)`, `Design Review (11:00)`.

- `Weekly Standup` matches → kept, its open action survives untouched.
- `1:1 with Priya` matches nothing → non-empty? No (it's empty) →
  removed outright, no prompt.
- `Design Review` matches nothing existing → new empty section created.
- Reorder to calendar order (Standup, then Design Review — 1:1 is
  gone).

Result:

```
Weekly Standup
==============
# ship the migration guide


Design Review
=============
```

If `1:1 with Priya` had had real notes under it, the sync review would
have asked what to do with them instead of silently dropping the
section.

**Known, accepted limitation:** two real meetings with the exact same
subject on the same day are indistinguishable by title match — a rare
naming collision, and the tradeoff Marien chose over any ID-based
tracking. Worth a one-line callout in Settings ("meetings are matched by
title") so it isn't a silent surprise if it ever bites someone.

### 2.5 Mapping events → sections

Unchanged from the earlier design: subject-only header, no time prefix,
reusing `underlineFor`/the existing two-blank-line spacing rule (spec
§2.3):

```
Weekly Sync
===========
```

The event's start time is used only to order the calendar block (§2.4)
and to sort the pre-sync review list (§3.3) — it's never written into
the file.

## 3. UX

### 3.1 Settings → new "Calendar" section

- Not connected → **Connect Microsoft 365** → system-browser consent →
  on return, **Connected as marien@contoso.com** + **Disconnect**.
- Advanced (collapsed): a client-ID field, for organizations that
  require their own Entra app registration.
- A one-line note: "Meetings are matched to sections by title — keep
  section titles matching your calendar if you want re-syncing to find
  them."

### 3.2 Two ways to get today's agenda

Two separate actions, both landing in the identical review UI (§3.3) —
neither is a fallback path bolted onto the other; they're peers, and
the manual one needs no Microsoft 365 connection at all:

- **"Sync calendar for this day"** — a toolbar action + command-palette
  entry (icon: dated page + a small sync arc, matching the visual
  language of "Open Date Note"). Shown only when connected; does the
  live Graph fetch (§2.3).
- **"Sync from a list…"** — a second, always-available toolbar action +
  command-palette entry, connection state irrelevant. Opens a modal in
  the Section-Import family: a plain textarea, one meeting title per
  line, in whatever order the day's agenda actually runs — a
  **"Sync"** button feeds those lines straight into the same
  reconciliation engine (§2.4) as if they'd been fetched live. This
  exists specifically because Marien isn't sure the Entra/Graph side
  will work cleanly against their own tenant right away, and it means
  the reconciliation logic — the actual hard, valuable part of this
  feature — works and can be exercised regardless of whether OAuth ever
  does. (It also makes the reconciliation engine trivial to test without
  any mocked auth/network plumbing at all — see §6.)

Both actions are enabled only for a dated tab whose date is today or
later (§2's scope rule) — disabled/hidden on a scratchpad or a
past-dated note, with a tooltip explaining why if hovered while
disabled.

### 3.3 The sync review

A modal in the same family as the manual Section Import drawer (spinner
→ result, review-before-commit) — identical regardless of which of
§3.2's two actions produced the agenda list:

- **New meetings** — listed, all pre-checked, unchecked ones simply
  skipped on confirm (same "checklist" affordance the earlier design
  already planned).
- **Reordered meetings** — listed for transparency ("moved earlier/
  later today") but not something to opt out of individually; the
  block's order isn't meaningful to keep partially stale.
- **Removed, empty** — listed as "removed" for transparency; already
  gone the moment the review is confirmed, nothing to decide.
- **Removed, with content** — the one place this needs real input: each
  one gets an inline choice — **Move to another day** (opens the date
  picker), **Discard**, or **Leave it, flagged**. Confirm applies
  everything at once, same as the manual importer's single commit step.
- **Errors (live fetch only — the manual path has no network step to
  fail):** token expired → silent refresh, retried once before
  surfacing anything; refresh failed → "Reconnect Microsoft 365" (deep
  link to Settings); offline → "Can't reach Microsoft 365 right now";
  no qualifying meetings → "No meetings with other participants on
  <date>." The manual path's only empty-input case is a blank textarea
  — the "Sync" button stays disabled until at least one non-empty line
  is typed.

## 4. Rust commands

- `m365_begin_auth() -> M365Account` — opens the browser, runs the
  loopback listener, exchanges the code, stores the refresh token,
  returns the account.
- `m365_disconnect()` — clears the keychain entry and the config block.
- `m365_status() -> Option<M365Account>` — for boot/Settings.
- `m365_fetch_events(date: String) -> Vec<CalEvent>` — refresh token →
  access token → filtered, ordered `calendarView` results (§2.3), the
  richer per-event shape the sync review (§3.3) displays and sorts by.

The reconciliation engine itself (§2.4) stays pure TypeScript, and
knows nothing about Rust, Graph, or `CalEvent` at all — its input is
`string[]`. The live-fetch path maps `Vec<CalEvent>` down to
`event.subject` (in the order Rust already returned them) before
handing off to the engine; the manual path (§3.2) produces that same
`string[]` directly by splitting the pasted textarea on newlines,
trimming, and dropping empty lines — no Rust command involved at all.
Same layering the manual Section Import already has (`linesToSections`
is pure TS; only network/auth needs Rust) — this feature just has two
producers feeding that one pure function instead of one.

## 5. Dependencies

`reqwest` + rustls (async HTTP + TLS) and `keyring` — genuinely new
surface, and the **first outbound network call for note content** this
app has ever made. `tiny_http` for the loopback listener (§2.1) is
small and dependency-light. Worth keeping behind a build feature flag
until the live OAuth path against a real tenant is proven, per the
earlier design's own caution.

## 6. Testing

- **The reconciliation engine (§2.4) gets its own focused unit tests,
  and needs neither the mock backend nor any auth/network plumbing to
  do it** — its signature is a pure `(existingNoteContent: string,
  agendaTitles: string[]) -> ...`, so it's tested directly with plain
  string arrays, exactly like `linesToSections` already is. This is the
  riskiest new logic in the whole feature, and thanks to §3.2's manual
  path, it's also the easiest to test. Cases to cover explicitly: a
  pure reorder (no content lost), a new title inserted mid-block, an
  empty removed section (silent), a non-empty removed section (surfaced
  for the review step, not auto-resolved), the very first sync for a
  day (no existing block), and the same-title-twice edge case
  (documented limitation, not a crash).
- **e2e, manual path:** drives "Sync from a list…" end to end — type
  titles, confirm the review, verify sections landed correctly — with
  zero mocked auth or network at all, since the feature genuinely needs
  none of that.
- **e2e, live-fetch path:** `m365_status`/`m365_fetch_events`/
  `m365_begin_auth` return canned data in `mockBackend.ts` — drives
  connect → live sync → review → commit, same pattern the rest of the
  app's mock already follows. Since the reconciliation engine itself is
  already covered by the unit tests above, this only needs to prove the
  live path correctly maps `CalEvent[]` down to the same `string[]`
  shape and wires up the same review UI — not re-prove reconciliation
  correctness.
- **Rust:** a Graph-JSON fixture → `Vec<CalEvent>` mapping, the
  `attendees > 0 && !cancelled` filter, `calendarView` paging.
- **Manual checklist (a real tenant, can't be automated):** a real
  Business account, the admin-consent path, token refresh after expiry,
  disconnect clears the keychain.

## 7. Privacy

Meeting subjects land in `.txt` files in cleartext — stated explicitly
in Settings and at first connect, consistent with the app's "everything
is a plain-text file you own" model. Nothing is transmitted anywhere;
the only stored secret is the refresh token, in the OS keychain.

## 8. Decisions log

- **Reconciliation mechanism (§2.4):** no sidecar file, no ID, no
  visible tag — title matching plus section order is the entire
  mechanism. Confirmed by Marien directly; the worked example in §2.4
  reflects this.
- **Two agenda sources (§3.2):** a live Graph fetch and a manual
  "paste titles, one per line" entry are peer entry points into the
  identical reconciliation engine and review UI — not a fallback bolted
  onto the main path. Added specifically because Marien isn't sure the
  Entra/Graph side will work cleanly against their own tenant right
  away.
- **Version: v0.9.0.** Confirmed by Marien. v0.8.0 was already taken by
  the merged title bar; this is a genuine new feature with a real new
  dependency surface, so it gets its own minor release rather than
  folding into a patch.

## 9. Open items for Marien

- **Entra app registration** itself is Marien's own step (creating the
  registration, setting the redirect URI, deciding single- vs
  multi-tenant) — nothing here can be scripted from this side.
