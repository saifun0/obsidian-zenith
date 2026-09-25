# Разработка

[← Документация](../../README.ru.md) · [English](../en/development.md) · **Русский**

```bash
npm install        # установить зависимости
npm run dev        # сборка в режиме watch → ../zenith/
npm run build      # проверка типов + продакшен-сборка, затем деплой
npm run deploy     # скопировать последнюю сборку в хранилища из deploy.local.json
npm run typecheck  # tsc --noEmit
npm test           # прогнать юнит-тесты vitest
npm run lint       # eslint
npm run format     # prettier --write
```

Сборка кладёт `main.js`, `styles.css`, `manifest.json` и `versions.json` в соседнюю папку
`../zenith/` — это и есть плагин, который загружает Obsidian.

Чтобы в других хранилищах была та же сборка, перечислите их в `deploy.local.json` (он не в git):

```json
{ "vaults": ["E:/Projects/Obsidian/main"] }
```

Тогда `npm run build` копирует эти четыре файла в `.obsidian/plugins/zenith/` каждого
хранилища. У каждого остаются свои `data.json`, состояние синхронизации и установленные
модули. `npm run dev` не деплоит — сборки в режиме watch остаются в `../zenith/`.

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
