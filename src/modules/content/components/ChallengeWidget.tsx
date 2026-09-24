import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { ChallengeBars, useChallenge } from './ChallengeBars';

/**
 * The yearly challenge on the dashboard. With no goal set it says where to set
 * one rather than drawing an empty bar.
 */
export const ChallengeWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const progress = useChallenge();
    if (!progress.length) {
        return <p className="zenith-challenge__empty">{t('content.challenge.none')}</p>;
    }
    return <ChallengeBars progress={progress} compact />;
};
