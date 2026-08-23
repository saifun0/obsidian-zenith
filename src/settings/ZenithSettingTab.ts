import { App, Platform, PluginSettingTab } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import ZenithPlugin from '../main';
import { AppContext } from '../context/AppContext';
import { SettingsApp } from './components/SettingsApp';

export class ZenithSettingTab extends PluginSettingTab {
    plugin: ZenithPlugin;
    private reactRoot: Root | null = null;

    constructor(app: App, plugin: ZenithPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        // Add specific class to override Obsidian's modal styles
        containerEl.addClass('zenith-custom-settings-container');

        // On mobile Obsidian floats the title and the back/close buttons over
        // this scroll area rather than above it, so the padding we zero out for
        // the desktop layout is exactly what was keeping the first row clear of
        // them. Flagged as a class rather than a width media query: a narrow
        // desktop window is not a phone and has none of that chrome.
        containerEl.toggleClass('is-mobile-settings', Platform.isMobile);

        // Create a wrapper for our React settings
        const wrapper = containerEl.createDiv('zenith-settings-wrapper');

        // Mount React, providing the Obsidian App + plugin via context so
        // components never reach for the `window.app` global.
        this.reactRoot = createRoot(wrapper);
        this.reactRoot.render(
            React.createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                React.createElement(SettingsApp)
            )
        );
    }

    hide(): void {
        if (this.reactRoot) {
            this.reactRoot.unmount();
            this.reactRoot = null;
        }
        this.containerEl.removeClass('zenith-custom-settings-container');
        this.containerEl.removeClass('is-mobile-settings');
    }
}
