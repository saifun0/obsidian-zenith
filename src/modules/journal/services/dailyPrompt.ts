import type { Locale } from '../../../core/i18n';

/**
 * A question for the day's note.
 *
 * One question for the whole day — the same on every device and every time the
 * note is opened — so it can be answered rather than skimmed past for a new
 * one. Taken from a note of the user's own (one question a line), or from a
 * small built-in set kept deliberately neutral: nothing about gratitude or
 * productivity, which a journal should not be telling anyone to feel.
 *
 * No streaks and no count of questions answered: the point is the writing.
 */

export const BUILTIN_PROMPTS: Record<Locale, readonly string[]> = {
    en: [
        'What took up most of your attention today?',
        'What is something you noticed for the first time?',
        'What would you do differently if today started again?',
        'Who did you talk to today, and about what?',
        'What is on your mind that you have not said out loud?',
        'What did you learn today, however small?',
        'What made today different from yesterday?',
        'What are you looking forward to, and why?',
        'What did you put off today?',
        'Where did the time go today?',
        'What surprised you?',
        'What would you like to remember about today?',
        'What was the hardest part of the day?',
        'What did you read, watch or hear that stayed with you?',
        'What is a question you are carrying around at the moment?',
        'What did your body tell you today?',
        'What decision is waiting for you?',
        'What went better than you expected?',
        'What is something you changed your mind about?',
        'What would you tell yourself a year ago?',
        'What do you want tomorrow to hold?',
        'What was the quietest moment of the day?',
        'What are you working towards right now?',
        'What did you make or fix today?',
        'What is one thing you would like to understand better?',
        'What did you say no to, or wish you had?',
        'Where were you most yourself today?',
        'What is taking longer than you thought it would?',
        'What small thing went right?',
        'What are you avoiding thinking about?',
    ],
    ru: [
        'На что сегодня ушло больше всего внимания?',
        'Что вы сегодня заметили впервые?',
        'Что бы вы сделали иначе, если бы день начался заново?',
        'С кем вы сегодня говорили и о чём?',
        'Что у вас на уме, но так и не прозвучало вслух?',
        'Чему вы сегодня научились, пусть немногому?',
        'Чем сегодняшний день отличался от вчерашнего?',
        'Чего вы ждёте и почему?',
        'Что вы сегодня отложили?',
        'Куда сегодня ушло время?',
        'Что вас удивило?',
        'Что хочется запомнить о сегодняшнем дне?',
        'Что было самым трудным за день?',
        'Что из прочитанного, увиденного или услышанного осталось с вами?',
        'Какой вопрос вы сейчас носите с собой?',
        'Что сегодня говорило вам тело?',
        'Какое решение вас ждёт?',
        'Что прошло лучше, чем вы ожидали?',
        'В чём вы передумали?',
        'Что бы вы сказали себе год назад?',
        'Каким вы хотите видеть завтра?',
        'Какой момент дня был самым тихим?',
        'К чему вы сейчас идёте?',
        'Что вы сегодня сделали или починили?',
        'Что хочется понять лучше?',
        'Кому или чему вы сказали «нет» — или хотели бы?',
        'Где сегодня вы были больше всего собой?',
        'Что занимает больше времени, чем вы думали?',
        'Какая мелочь сегодня получилась?',
        'О чём вы стараетесь не думать?',
    ],
    zh: [
        '今天什么占据了你最多的注意力？',
        '今天你第一次注意到了什么？',
        '如果今天重新开始，你会有什么不同的做法？',
        '今天你和谁聊过，聊了什么？',
        '有什么在你心里，却还没有说出口？',
        '今天你学到了什么，哪怕很小？',
        '今天和昨天有什么不同？',
        '你在期待什么，为什么？',
        '今天你推迟了什么？',
        '今天的时间都去哪儿了？',
        '什么让你感到意外？',
        '关于今天，你想记住什么？',
        '今天最难的部分是什么？',
        '你读到、看到或听到的什么留在了心里？',
        '此刻你心里装着什么问题？',
        '今天你的身体告诉了你什么？',
        '有什么决定在等着你？',
        '什么比你预想的更顺利？',
        '你在什么事情上改变了想法？',
        '你会对一年前的自己说什么？',
        '你希望明天是什么样子？',
        '今天最安静的时刻是什么时候？',
        '你现在正朝着什么努力？',
        '今天你做了或修好了什么？',
        '有什么你想更好地理解？',
        '你拒绝了什么，或希望自己拒绝了什么？',
        '今天什么时候你最像你自己？',
        '什么事情比你想的花了更久？',
        '今天有什么小事做对了？',
        '你在回避思考什么？',
    ],
};

/**
 * The questions in a note of the user's: one a line. List markers and
 * numbering are taken off; headings, frontmatter and blank lines are skipped.
 */
export function parsePrompts(text: string): string[] {
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    return body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && !line.startsWith('```'))
        .map((line) => line.replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, '').trim())
        .filter(Boolean);
}

/**
 * The day's question. Chosen from the date alone, so it is the same wherever
 * and whenever it is asked for, and walks through the list rather than landing
 * at random — the same question does not come back until the others have had
 * their turn.
 */
export function pickPrompt(prompts: readonly string[], date: string): string | null {
    if (!prompts.length) return null;
    const day = Math.floor(
        Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000
    );
    return prompts[((day % prompts.length) + prompts.length) % prompts.length];
}
