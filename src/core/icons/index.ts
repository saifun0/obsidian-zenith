import { IconRegistry } from './iconRegistry';

/**
 * The registry every renderer and picker reads from.
 *
 * A module-level singleton, like `useZenithStore`: an icon id is a global name
 * (it is stored in settings and resolved from a dozen unrelated components),
 * and threading a registry instance through every call site would buy nothing —
 * there is exactly one plugin instance per app. `IconRegistry` stays exported as
 * a class so tests build their own rather than sharing this one.
 */
export const iconRegistry = new IconRegistry();

export { IconRegistry, ICON_PREFIX, iconId, isCustomIconId, isSafeIconName } from './iconRegistry';
export type { RegisteredIcon, IconSource, IconSourceKind } from './iconRegistry';
export { sanitizeIconSvg, describeSvgProblem, MAX_ICON_BYTES } from './iconSvg';
export type { SvgProblem, SvgCheck } from './iconSvg';
export { loadIconPacks, loadIconsFromFolder, iconNameFromFile } from './iconPackLoader';
export type { IconPackReport } from './iconPackLoader';
