import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { widgetLabel, type DashboardWidgetDefinition } from '../widgets';
import { CARD_NAME_KEY, MAX_CARD_NAME, useWidgetConfig } from '../widgetConfig';

/** A bucket read only to be written to; the widget reads the rest. */
const asIs = (raw: Record<string, unknown> | undefined): Record<string, unknown> => raw ?? {};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

interface MemberSettingsProps {
    /** Absent for a layout id nothing is registered under any more. */
    def: DashboardWidgetDefinition | undefined;
    /** The copy being set up — the key its settings are stored under. */
    instanceId: string;
}

/**
 * What one widget's card says about itself on its back: its name, and the
 * widget's own settings.
 *
 * One component for two backs. A card on the board turns over to this; so does
 * a bundle, for whichever of its widgets is on top — a widget inside a bundle
 * used to have no way to its own settings short of being taken out of it.
 *
 * The name is offered only to a card the board may hold several of: one clock
 * needs no name to tell it from the others. Left empty, the card goes by the
 * widget's name, which is what the field shows, greyed.
 */
export const MemberSettings: FC<MemberSettingsProps> = ({ def, instanceId }) => {
    const t = useTranslation();
    const nameable = !!def?.multiple;
    // As typed, not as shown: the header trims the name, and a field that
    // trimmed it too would eat the space between two words as it was typed.
    const typed = useZenithStore((s) => {
        const raw = nameable ? s.settings.widgetConfig[instanceId]?.[CARD_NAME_KEY] : '';
        return typeof raw === 'string' ? raw : '';
    });
    const [, setBucket] = useWidgetConfig(instanceId, asIs);

    if (!def) return null;
    const Settings = def.settings;

    return (
        <>
            {nameable && (
                <div className="zenith-widget-settings__row">
                    <span className="zenith-widget-settings__label">
                        {t('dashboard.widget.name')}
                    </span>
                    <input
                        type="text"
                        className="zenith-input zenith-input--sm zenith-widget-settings__name"
                        value={typed}
                        maxLength={MAX_CARD_NAME}
                        placeholder={widgetLabel(def, t)}
                        aria-label={t('dashboard.widget.name')}
                        onChange={(e) => setBucket({ [CARD_NAME_KEY]: e.target.value })}
                        onPointerDown={stop}
                    />
                </div>
            )}
            {Settings && <Settings instanceId={instanceId} />}
        </>
    );
};
