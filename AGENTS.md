# AGENTS.md — Spaced Breakout Launcher

## Branches

- `main` — stable releases only. Every commit here = shippable state.
- `dev` — staging. Features and fixes accumulate here.
- `feat/*` — new features, branched from `dev`, merged back into `dev`.
- `fix/*` — fixes, branched from `dev`, merged back into `dev`.

## Scope check (before ANY implementation)

- Ask yourself: is this schizophrenia? Does this implementation make sense? Is it in scope?
- Don't spawn new repos, mods or releases for what belongs inside an existing one.
- Prefer consolidation over fragmentation: pack-internal things live with the pack (Spaced-Outbreak repo), public standalone things live in their own repo.

## Planning

- No implementation without approval: agent proposes (what/why/scope), user says go, then code.
- Work is batched into planned updates (e.g. v1.3): feat/fix branches accumulate in `dev`, live server and game mod folders stay frozen until the release rollout.
- Release checklist: manifest SHA1s re-verified, guides + subtitle + PACK_LINE greeting bumped to the same version, server backup taken, restart only on explicit approval.

## Flow

1. New work starts on `feat/<name>` or `fix/<name>` from `dev`.
2. Merge the branch back into `dev` when done (delete the branch after).
3. Release: merge `dev` into `main` with a version bump (`manifest.json`, guides, pack version).
4. Never commit directly to `main` except the release merge.

## Hard rules

- `launcher-config.json` (private bundle URL) is gitignored — never commit it, only `launcher-config.example.json`.
- Mod zips are built with forward slashes (Python `zipfile`), never `Compress-Archive` — the portal and Linux/macOS reject backslashes.
- Every manifest change carries a verified SHA1 (`Get-FileHash -Algorithm SHA1`).
- PowerShell scripts with Cyrillic must be UTF-8 with BOM, otherwise PS 5.1 breaks.
- Live server (`C:\Games\Factorio SERVER`) and game mod folders change ONLY on explicit user approval (`делай рестарт` / `обновляй`). Stage everything, deploy on command.
- Mods live in their own repos (`sb-pitch-black-nights`). This repo holds only the launcher + `manifest.json` + `CREDITS.md`.

## Quality bar

- No hacks: never parse what has authoritative metadata (mod identity comes from `info.json` inside the zip, not from the filename), never duplicate values that already live in `manifest.json` (single source of truth).
- Never fix a hack with another hack: remove the root cause.
- UX for humans: progress bar on long operations, buttons disabled while busy, errors as readable messages (RU/EN), UI never freezes.
- Code is human-readable: small functions, self-explanatory names, comments only where the why isn't obvious.

## Pack naming

- Pack: SPACED OUTBREAK vX.Y. Guides, PACK_LINE greeting and launcher subtitle must carry the same version.
- Mod count in guides/subtitle must match `manifest.json` `files` count.
