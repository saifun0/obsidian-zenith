import React, { type CSSProperties } from 'react';

interface Tab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    count?: number;
    /**
     * Accent for this tab (hex/CSS colour). Content types carry their own
     * colour, so the tab bar can be tinted per tab instead of one accent for
     * everything. Omit to use the theme accent.
     */
    color?: string;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

/**
 * Tab bar with optional icons, per-tab accent colours and count badges.
 *
 * A tab's colour is published as `--zenith-tab-color` rather than as inline
 * styles, so one custom property drives the label, icon, border, background
 * tint and count badge together — and a tab bar that sets no colour (the tasks
 * view) falls back to the theme accent with no extra code.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabChange }) => {
    return (
        <div className="zenith-tabs" role="tablist">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`zenith-tabs__tab ${
                        activeTab === tab.id ? 'zenith-tabs__tab--active' : ''
                    }`}
                    style={
                        tab.color ? ({ '--zenith-tab-color': tab.color } as CSSProperties) : undefined
                    }
                    onClick={() => onTabChange(tab.id)}
                >
                    {tab.icon && <span className="zenith-tabs__tab-icon">{tab.icon}</span>}
                    <span className="zenith-tabs__tab-label">{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                        <span className="zenith-tabs__tab-count">{tab.count}</span>
                    )}
                </button>
            ))}
        </div>
    );
};
