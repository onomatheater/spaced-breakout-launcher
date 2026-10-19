# spaced-breakout-launcher

Private launcher for **Spaced Breakout** (Factorio 2.0.77, K2SO + planets).

Do NOT publish the bundle URL. Repo is public, bundle stays on private VPS/static.

## Files

- `manifest.json` — exact versions + SHA1 + sizes (37 zips audited locally)
- `CREDITS.md` — authors, licenses, links (required by MIT / CC / FMLDOL)
- `launcher.ps1` — downloads bundle zip, verifies, extracts to `%AppData%\Factorio\mods`

## Usage (private)

```powershell
$env:SPACED_BREAKOUT_URL = "https://your-vps/.../SPACED-BREAKOUT-v1.0.zip"
.\launcher.ps1
```

## Dark Nights

`DarkNight 2.0.0` by Skrundz (Skrunix license — no redistribution right) is **NOT** in the bundle.
Install from https://mods.factorio.com/mod/DarkNight separately until written permission is obtained.
