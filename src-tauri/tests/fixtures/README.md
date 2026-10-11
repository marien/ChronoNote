# Upgrade Test Fixtures

These fixtures represent configuration, tab session, and notes folder states written by past releases of ChronoNote (`v0.20.0`, `v0.25.0`, `v0.30.0`).

## Structure

- `v0.20.0/`: `config.json` and `.chrononote-session.json` matching the schema serialized by v0.20.0.
- `v0.25.0/`: `config.json` (introducing `startupTabMode`, the v0.25 shape of `peek`, and `occurrenceHint`) and `.chrononote-session.json`.
- `v0.30.0/`: `config.json` (introducing `statusBarVisible`, `tabLabelStyle`, pane shares, and the updated `peek` shape) and `.chrononote-session.json`.
- `notes/`: A notes folder containing real notes with different encodings and line endings (LF, CRLF, UTF-8 BOM), a conflict copy in `.chrononote-conflicts/`, and an `.agenda.json` calendar file.

## Maintenance

A new release folder should be added for each minor release to verify backward compatibility and migration logic.
