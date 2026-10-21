# spaced-breakout-launcher / electron

Легковесный лаунчер: Electron + vanilla JS, без тяжелых фреймворков.
Старый `launcher.ps1` остается каноном до cutover.

## Запуск

```sh
cd launcher-repo/electron
npm install
npm start
```

Настройки хранятся локально в `userData/launcher-config.json`
(создается из `../launcher-config.example.json` содержимым):
`bundle_url`, `manifest_url`, `credits_url`, `factorio_exe`, `modsDir`, `lang`.
Приватные URL и путь к игре никогда не коммитятся.

## Что умеет скелет

- `get-state`: субтитр из `manifest.json`, автопоиск `%APPDATA%/Factorio/mods`, поиск exe (сохраненный → Steam → ProgramFiles → диалог).
- `download`: потоковое скачивание с resume (`.part` + `Range`, 3 попытки), прогресс/скорость, отмена; проверка `bundle_size` + `bundle_sha1` ДО распаковки.
- `install`: пофайловая SHA1, имя мода только из `info.json` внутри zip, бэкап `mod-list.json` + `mod-settings.dat`, чистка старых дубликатов.
- `play`: запуск exe без аргументов. После установки лаунчер не обязателен.
- Credits: данные из `credits.json` (или `credits_url`), поиск, ссылки открываются в браузере (только `https://`).
- RU/EN как в `launcher.ps1`.

## Pending

- `npm start` дым-тест на живой машине.
- Иконки `.ico`/`.icns` для `electron-builder` (сейчас только `assets/logo.png`).
- `mod-settings.dat` с дефолтами пака — отдельным решением: файл пишет сам Factorio при прогоне с модами пака, сгенерировать его вслепую нельзя. Пока лаунчер только бэкапит существующий `.dat` рядом с `mod-list.json`.
- Сеть покрыта тестом `node lib/net.test.js` — 6/6 (full/resume/retry/cancel).
