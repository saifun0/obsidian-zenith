# Разработка

[← Документация](../../README.ru.md) · [English](../en/development.md) · **Русский**

```bash
npm install        # установить зависимости
npm run dev        # сборка в режиме watch → ../zenith/
npm run build      # проверка типов + продакшен-сборка
npm run typecheck  # tsc --noEmit
npm test           # прогнать юнит-тесты vitest
npm run lint       # eslint
npm run format     # prettier --write
```

Сборка кладёт `main.js`, `styles.css`, `manifest.json` и `versions.json` в соседнюю папку
`../zenith/` — это и есть плагин, который загружает Obsidian.

## Необязательно: линт-правила Obsidian API

`eslint-plugin-obsidianmd` (помечает устаревшие API Obsidian) установлен, но по умолчанию
выключен: он ожидает `manifest.json` в корне проекта и тянет за собой правила, которым
нужны типы. Чтобы включить, скопируйте `manifest.source.json` в `manifest.json` и добавьте
его рекомендованный конфиг в `eslint.config.mjs`.

## Версионирование

Поднять версию везде сразу (манифест, `package.json`, `versions.json`):

```bash
npm run version-bump -- 0.2.0        # конкретная версия
npm run version-bump -- minor        # или ключевое слово semver: patch|minor|major
npm run version-bump -- 0.2.0 1.4.0  # заодно задать новый minAppVersion
```
