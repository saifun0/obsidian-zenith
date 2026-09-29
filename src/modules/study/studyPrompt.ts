import type { Locale } from '../../core/i18n';

/**
 * The prompt the "copy prompt" button puts on the clipboard: paste it into
 * any chat model with a photo or the text of a timetable, and paste the
 * answer back into the import box.
 *
 * Written for the timetables people actually photograph — a university grid
 * with numerator/denominator rows, subgroups, a separate bell schedule —
 * and for what models get wrong: inventing a room, merging the two weeks,
 * writing times as "8.30 a.m.". The example is the exact format the import
 * box reads, and a test checks that it still does.
 */

export const PROMPT_EXAMPLE = `{
  "weeks": 2,
  "bells": [
    { "n": 1, "start": "08:30", "end": "10:00" },
    { "n": 2, "start": "10:10", "end": "11:40" },
    { "n": 3, "start": "12:20", "end": "13:50" }
  ],
  "lessons": [
    { "day": 1, "n": 1, "week": 0, "subject": "Mathematical Analysis", "kind": "lecture", "room": "305", "teacher": "Ivanov I. I." },
    { "day": 1, "n": 2, "week": 1, "subject": "Physics", "kind": "lab", "room": "214", "subgroup": 1 },
    { "day": 1, "n": 2, "week": 2, "subject": "Programming", "kind": "practice", "room": "412" },
    { "day": 3, "start": "18:00", "end": "19:30", "week": 0, "subject": "English", "kind": "practice", "room": "101" }
  ]
}`;

const EN = `You convert a class timetable into JSON for a planner app.

I will send photos and/or text of my timetable and, possibly, of the bell (period) times. Read them carefully and answer with ONE JSON object and nothing else — no explanations, no comments, no Markdown around it.

FORMAT
{
  "weeks": 1 or 2,
  "bells": [ { "n": number, "start": "HH:MM", "end": "HH:MM" } ],
  "lessons": [ {
    "day": 1–7 (1 = Monday … 7 = Sunday),
    "n": the period number (links to "bells"),
    "start": "HH:MM", "end": "HH:MM"   (only if the lesson has its own times, or there is no bell table),
    "week": 0 every week, 1 first week, 2 second week,
    "subject": exactly as written,
    "kind": "lecture" | "practice" | "lab" | "seminar" | "exam" | "consultation" | "other",
    "room": string (optional),
    "teacher": string (optional),
    "subgroup": 1 or 2 (optional — only if the lesson is for one subgroup),
    "note": string (optional)
  } ]
}

RULES
1. Times are 24-hour HH:MM ("08:30", "13:50").
2. If the timetable alternates weeks (odd/even, "numerator/denominator", upper/lower half of a cell, "week A/B", "1st/2nd week"), set "weeks": 2. The odd / numerator / upper / A / 1st week is "week": 1, the other is "week": 2. A lesson held every week is "week": 0. If nothing alternates, use "weeks": 1 and "week": 0 everywhere.
3. A cell split in two by a horizontal line usually means week 1 on top and week 2 below; split vertically, it usually means subgroups 1 and 2.
4. Abbreviations: lec. → "lecture", pr./pract. → "practice", lab. → "lab", sem. → "seminar".
5. If a period number is shown, use "n" and put its times in "bells" once. If only times are shown, give "start"/"end" on the lesson.
6. Never invent anything: leave out a room, teacher or kind you cannot read (use "other" for an unknown kind). Keep subject names as written, in their original language.
7. One entry per lesson per week: a lesson on Monday in both weeks is one entry with "week": 0, not two.

EXAMPLE OF THE ANSWER
${PROMPT_EXAMPLE}

Now wait for my timetable.`;

const RU = `Ты переводишь расписание занятий в JSON для приложения-планировщика.

Я пришлю фото и/или текст своего расписания пар и, возможно, расписания звонков. Внимательно прочитай их и ответь ОДНИМ JSON-объектом и ничем больше — без пояснений, без комментариев, без Markdown вокруг.

ФОРМАТ
{
  "weeks": 1 или 2,
  "bells": [ { "n": номер, "start": "ЧЧ:ММ", "end": "ЧЧ:ММ" } ],
  "lessons": [ {
    "day": 1–7 (1 = понедельник … 7 = воскресенье),
    "n": номер пары (ссылка на "bells"),
    "start": "ЧЧ:ММ", "end": "ЧЧ:ММ"   (только если у пары своё время или звонков нет),
    "week": 0 каждую неделю, 1 первая неделя, 2 вторая неделя,
    "subject": точно как написано,
    "kind": "lecture" | "practice" | "lab" | "seminar" | "exam" | "consultation" | "other",
    "room": строка (необязательно),
    "teacher": строка (необязательно),
    "subgroup": 1 или 2 (необязательно — только если пара для одной подгруппы),
    "note": строка (необязательно)
  } ]
}

ПРАВИЛА
1. Время — 24-часовое ЧЧ:ММ ("08:30", "13:50").
2. Если расписание чередуется по неделям (числитель/знаменатель, нечётная/чётная, над чертой/под чертой, 1-я/2-я неделя), поставь "weeks": 2. Числитель / нечётная / над чертой / 1-я неделя — это "week": 1, другая — "week": 2. Пара, которая идёт каждую неделю, — "week": 0. Если ничего не чередуется, "weeks": 1 и везде "week": 0.
3. Ячейка, разделённая горизонтальной чертой, обычно значит: сверху 1-я неделя, снизу 2-я; разделённая вертикально — подгруппы 1 и 2.
4. Сокращения: лек./лк → "lecture", пр./практ./пз → "practice", лаб./лр → "lab", сем. → "seminar", экз./зач. → "exam", конс. → "consultation".
5. Если указан номер пары — используй "n", а её время один раз запиши в "bells". Если указано только время — пиши "start"/"end" у самой пары.
6. Ничего не выдумывай: не указывай аудиторию, преподавателя или вид занятия, если не можешь их прочитать (неизвестный вид — "other"). Названия предметов оставляй как написано.
7. Одна запись на пару на неделю: пара в понедельник на обеих неделях — одна запись с "week": 0, а не две.

ПРИМЕР ОТВЕТА
${PROMPT_EXAMPLE}

Теперь дождись моего расписания.`;

const ZH = `你要把一份课程表转换成一个日程应用使用的 JSON。

我会发送课程表的照片和/或文字，可能还有作息时间（每节课的时间）。请仔细阅读，并且只用一个 JSON 对象回答——不要解释，不要注释，外面也不要加 Markdown。

格式
{
  "weeks": 1 或 2,
  "bells": [ { "n": 数字, "start": "HH:MM", "end": "HH:MM" } ],
  "lessons": [ {
    "day": 1–7（1 = 星期一 … 7 = 星期日）,
    "n": 节次编号（对应 "bells"）,
    "start": "HH:MM", "end": "HH:MM"   （仅当这节课有自己的时间，或没有作息时间表时）,
    "week": 0 每周，1 第一周，2 第二周,
    "subject": 按原文照写,
    "kind": "lecture" | "practice" | "lab" | "seminar" | "exam" | "consultation" | "other",
    "room": 字符串（可选）,
    "teacher": 字符串（可选）,
    "subgroup": 1 或 2（可选——仅当这节课只针对一个小组时）,
    "note": 字符串（可选）
  } ]
}

规则
1. 时间用 24 小时制 HH:MM（"08:30"、"13:50"）。
2. 如果课程按周交替（单周/双周、"A 周/B 周"、"第一周/第二周"、格子的上半/下半），设 "weeks": 2。单周 / A 周 / 第一周 / 上半格为 "week": 1，另一周为 "week": 2。每周都上的课为 "week": 0。没有交替时，使用 "weeks": 1，并且所有课都是 "week": 0。
3. 被横线一分为二的格子通常表示上面是第 1 周、下面是第 2 周；被竖线分开通常表示第 1 和第 2 小组。
4. 课程类型：讲授/理论课 → "lecture"，习题课/练习课 → "practice"，实验课 → "lab"，研讨课 → "seminar"，考试 → "exam"，答疑 → "consultation"。
5. 如果标出了节次编号，就使用 "n"，并把这节的时间在 "bells" 中写一次。像"第1-2节"这样连上的课，写成一条课程并给出它自己的 "start"/"end"。如果只标出了时间，就在课程上写 "start"/"end"。
6. 绝不编造：看不清的教室、教师或类型就省略（类型未知时用 "other"）。科目名称按原文照写，保留原来的语言。
7. 每节课每种周只写一条：两周的星期一都上的课是一条 "week": 0 的记录，而不是两条。

回答示例
${PROMPT_EXAMPLE}

现在请等待我的课程表。`;

export function aiPrompt(locale: Locale): string {
    if (locale === 'ru') return RU;
    if (locale === 'zh') return ZH;
    return EN;
}
