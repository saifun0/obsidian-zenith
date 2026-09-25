import { translate, type TParams } from './i18n';

/**
 * A sentence a subsystem wants to show, written down before anyone knows what
 * language it will be read in.
 *
 * The module loader produces text for the settings page far from React —
 * before the workspace exists, even. Handing back a translated string means picking a language
 * at the wrong moment; handing back English means the settings page renders
 * English inside a Russian interface, which is exactly the bug this replaces.
 * So they hand back a key and its parameters, and the component translates.
 */
export interface Message {
    key: string;
    params?: TParams;
}

export function msg(key: string, params?: TParams): Message {
    return params ? { key, params } : { key };
}

/** English — for `console.error`, and for the `message` an `Error` must carry. */
export function messageText(message: Message): string {
    return translate('en', message.key, message.params);
}
