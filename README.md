# spaced-breakout-launcher

Private launcher for **Spaced Breakout** v1.2 (Factorio 2.0.77, K2SO + planets, 40 mods).

Do NOT publish the bundle URL. Repo is public, bundle stays on private VPS/static.

## Files

- `manifest.json` — exact versions + SHA1 + sizes (40 zips, verified locally)
- `CREDITS.md` — authors, licenses, links (required by MIT / CC / FMLDOL)
- `launcher.ps1` — WPF GUI (RU/EN): downloads bundle zip, verifies SHA1, installs to `%AppData%\Factorio\mods`, enables mods, launches the game
- `launcher-config.example.json` — copy to `launcher-config.json` (gitignored) and fill in your private bundle URL
- `assets/logo.png` — pack logo shown in the launcher window

## Usage (private)

```powershell
Copy-Item launcher-config.example.json launcher-config.json
# edit launcher-config.json: set bundle_url
powershell -ExecutionPolicy Bypass -File launcher.ps1
```
