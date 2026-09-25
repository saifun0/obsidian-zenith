# Разработка

[← Документация](../../README.ru.md) · [English](../en/development.md) · **Русский**

```bash
npm install            # установить зависимости
npm run dev            # сборка в режиме watch в хранилище для разработки (см. ниже)
npm run build          # проверка типов + продакшен-сборка, затем деплой
npm run deploy         # скопировать последнюю сборку в остальные хранилища
npm run clean          # удалить собранные main.js и styles.css
npm run typecheck      # tsc --noEmit
npm test               # прогнать юнит-тесты vitest
npm run lint           # eslint
npm run lint:obsidian  # правила самого Obsidian (с типами, медленно)
npm run format         # prettier --write
```

## Куда идёт сборка

Репозиторий лежит вне хранилищ. В его корне есть `manifest.json` — файл, который читает
каталог плагинов, и внутри `.obsidian/plugins/` Obsidian принял бы эту папку за второй Zenith.

Куда класть сборку, задаётся в `deploy.local.json` (он не в git):

```json
{
    "devVault": "E:/Projects/Obsidian/zenith-vault-testing-area",
    "vaults": ["E:/Projects/Obsidian/main"]
}
```

- **`devVault`.** esbuild пишет `main.js`, `styles.css`, `manifest.json` и `versions.json` прямо
  в его `.obsidian/plugins/zenith/`, так что `npm run dev` попадает туда, где сборку подхватывают
  Obsidian и Hot Reload.
- **`vaults`.** После этого `npm run build` копирует те же четыре файла и в каждое из этих
  хранилищ. У каждого остаются свои `data.json`, состояние синхронизации и паки
  иконок. `npm run dev` не деплоит.

Без `deploy.local.json` сборка идёт в `dist/`.

## Линт-правила Obsidian

`npm run lint:obsidian` прогоняет рекомендованный набор `eslint-plugin-obsidianmd`: устаревшие
и неподдерживаемые API, названия команд, заголовки настроек и правила typescript-eslint с
проверкой типов, которые он включает. На нём построена проверка в каталоге плагинов. Он
проверяет типы всего проекта, поэтому идёт около полуминуты, и в `npm run build` не входит.

## Версионирование

Поднять версию везде сразу (манифест, `package.json`, `versions.json`):

```bash
npm run version-bump -- 0.2.0        # конкретная версия
npm run version-bump -- minor        # или ключевое слово semver: patch|minor|major
npm run version-bump -- 0.2.0 1.4.0  # заодно задать новый minAppVersion
```
