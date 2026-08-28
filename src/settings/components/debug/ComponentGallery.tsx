import React, { useState } from 'react';
import { Copy, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { CheckboxCard } from '../../../components/ui/CheckboxCard';
import {
    Badge,
    Card,
    IconButton,
    Modal,
    PieChart,
    ProgressBar,
    StarRating,
    Tabs,
} from '../../../components/shared';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import {
    ActionButton,
    ColorInput,
    MultiSelect,
    NumberInput,
    Segmented,
    Select,
    SettingRow,
    Slider,
    TextArea,
    TextInput,
    Toggle,
} from '../../controls';

/**
 * Every control Zenith draws, in every state it can be in, on one page.
 *
 * The point is that a CSS change can be checked in one place instead of by
 * hunting for the one settings page that happens to use a disabled slider. So
 * the states that are hard to reach in the real UI — disabled, errored, a
 * description long enough to wrap, an empty chart — are the ones that matter
 * most here, and each is present deliberately rather than as an afterthought.
 *
 * Every control is live and wired to real state: a gallery of dead markup would
 * show that a checkbox is drawn correctly while saying nothing about whether it
 * still ticks.
 *
 * The little labels naming each variant are deliberately NOT translated. They
 * name the prop you would pass (`cta`, `danger`, `stack`), so translating them
 * would break the one thing they are for.
 */

const Demo: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({
    label,
    children,
    wide,
}) => (
    <div className={`zenith-debug__demo${wide ? ' zenith-debug__demo--wide' : ''}`}>
        <span className="zenith-debug__demo-label">{label}</span>
        <div className="zenith-debug__demo-body">{children}</div>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="zenith-debug__section">
        <div className="zenith-settings__section-label">{title}</div>
        <div className="zenith-debug__grid">{children}</div>
    </section>
);

const CHOICES = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
];

const ICON_CHOICES = [
    { value: 'up', label: 'Up', icon: 'arrow-up' },
    { value: 'down', label: 'Down', icon: 'arrow-down' },
];

const PIE = [
    { label: 'Books', value: 12, color: '#7c6cff' },
    { label: 'Films', value: 7, color: '#22c55e' },
    { label: 'Games', value: 4, color: '#f59e0b' },
];

export const ComponentGallery: React.FC = () => {
    const t = useTranslation();

    const [on, setOn] = useState(true);
    const [picked, setPicked] = useState('b');
    const [seg, setSeg] = useState('a');
    const [icons, setIcons] = useState('up');
    const [many, setMany] = useState<string[]>(['a', 'c']);
    const [count, setCount] = useState(12);
    const [level, setLevel] = useState(64);
    const [text, setText] = useState('Zenith');
    const [secret, setSecret] = useState('hunter2');
    const [notes, setNotes] = useState('One line.\nAnd another.');
    const [colour, setColour] = useState('#7c6cff');
    const [tiles, setTiles] = useState<Record<string, boolean>>({ one: true, two: false });
    const [stars, setStars] = useState(7);
    const [tab, setTab] = useState('first');
    const [modal, setModal] = useState(false);

    return (
        <div className="zenith-debug__gallery">
            <Section title={t('debug.gallery.buttons')}>
                <Demo label="default">
                    <ActionButton label="Action" onClick={() => undefined} />
                </Demo>
                <Demo label="cta">
                    <ActionButton label="Install" cta onClick={() => undefined} />
                </Demo>
                <Demo label="danger">
                    <ActionButton label="Delete" danger onClick={() => undefined} />
                </Demo>
                <Demo label="disabled">
                    <ActionButton label="Action" disabled onClick={() => undefined} />
                </Demo>
                <Demo label="IconButton · sizes">
                    <div className="zenith-debug__strip">
                        <IconButton icon={Pencil} size="sm" tooltip="sm" />
                        <IconButton icon={Pencil} size="md" tooltip="md" />
                        <IconButton icon={Pencil} size="lg" tooltip="lg" />
                    </div>
                </Demo>
                <Demo label="IconButton · variants">
                    <div className="zenith-debug__strip">
                        <IconButton icon={Copy} variant="default" tooltip="default" />
                        <IconButton icon={RefreshCw} variant="ghost" tooltip="ghost" />
                        <IconButton icon={Trash2} variant="danger" tooltip="danger" />
                        <IconButton icon={Trash2} disabled tooltip="disabled" />
                    </div>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.toggles')}>
                <Demo label="checked">
                    <Toggle checked={on} onChange={setOn} />
                </Demo>
                <Demo label="unchecked">
                    <Toggle checked={!on} onChange={(v) => setOn(!v)} />
                </Demo>
                <Demo label="disabled · on">
                    <Toggle checked disabled onChange={() => undefined} />
                </Demo>
                <Demo label="disabled · off">
                    <Toggle checked={false} disabled onChange={() => undefined} />
                </Demo>
                <Demo label="CheckboxCard" wide>
                    <div className="zenith-settings__module-grid">
                        <CheckboxCard
                            title="With a gear"
                            description="Short description."
                            iconName="sparkles"
                            checked={tiles.one}
                            onChange={(v) => setTiles((s) => ({ ...s, one: v }))}
                            onSettings={() => undefined}
                        />
                        <CheckboxCard
                            title="Without one, and with a description long enough to wrap onto a third line"
                            description="Tiles in a row line up regardless of how long their descriptions are — this is the one that proves it."
                            iconName="not-a-real-icon"
                            checked={tiles.two}
                            onChange={(v) => setTiles((s) => ({ ...s, two: v }))}
                        />
                    </div>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.choice')}>
                <Demo label="Segmented">
                    <Segmented value={seg} options={CHOICES} onChange={setSeg} />
                </Demo>
                <Demo label="Segmented · icons">
                    <Segmented value={icons} options={ICON_CHOICES} onChange={setIcons} />
                </Demo>
                <Demo label="Segmented · disabled">
                    <Segmented value={seg} options={CHOICES} disabled onChange={() => undefined} />
                </Demo>
                <Demo label="Select">
                    <Select value={picked} options={CHOICES} onChange={setPicked} />
                </Demo>
                <Demo label="Select · disabled">
                    <Select value={picked} options={CHOICES} disabled onChange={() => undefined} />
                </Demo>
                <Demo label="MultiSelect">
                    <MultiSelect value={many} options={CHOICES} onChange={setMany} />
                </Demo>
            </Section>

            <Section title={t('debug.gallery.numeric')}>
                <Demo label="NumberInput">
                    <NumberInput value={count} min={0} max={99} onChange={setCount} />
                </Demo>
                <Demo label="NumberInput · unit">
                    <NumberInput value={count} unit="px" onChange={setCount} />
                </Demo>
                <Demo label="Slider">
                    <Slider value={level} min={0} max={240} step={8} unit="px" onChange={setLevel} />
                </Demo>
                <Demo label="Slider · disabled">
                    <Slider value={level} min={0} max={240} disabled onChange={() => undefined} />
                </Demo>
            </Section>

            <Section title={t('debug.gallery.text')}>
                <Demo label="TextInput">
                    <TextInput value={text} onChange={setText} />
                </Demo>
                <Demo label="TextInput · placeholder">
                    <TextInput value="" placeholder="owner/repo" onChange={() => undefined} />
                </Demo>
                <Demo label="TextInput · monospace">
                    <TextInput value="zi:acme/logo" monospace onChange={() => undefined} />
                </Demo>
                <Demo label="TextInput · secret">
                    <TextInput
                        value={secret}
                        secret
                        revealLabel="Show"
                        hideLabel="Hide"
                        onChange={setSecret}
                    />
                </Demo>
                <Demo label="TextInput · disabled">
                    <TextInput value={text} disabled onChange={() => undefined} />
                </Demo>
                <Demo label="ColorInput">
                    <ColorInput
                        value={colour}
                        allowEmpty
                        resetLabel="Reset"
                        onChange={setColour}
                    />
                </Demo>
                <Demo label="TextArea" wide>
                    <TextArea value={notes} rows={3} onChange={setNotes} />
                </Demo>
                <Demo label="TextArea · monospace" wide>
                    <TextArea
                        value={'{\n    "id": "my-module"\n}'}
                        rows={3}
                        monospace
                        onChange={() => undefined}
                    />
                </Demo>
            </Section>

            <Section title={t('debug.gallery.rows')}>
                <Demo label="row · desc" wide>
                    <SettingRow label="A setting" desc="What it does, in one line.">
                        <Toggle checked={on} onChange={setOn} />
                    </SettingRow>
                </Demo>
                <Demo label="row · note" wide>
                    <SettingRow
                        label="With a note"
                        desc="The mark beside the label opens a caveat."
                        note="A caveat worth reading once, and not worth a permanent banner."
                        noteLabel="More"
                    >
                        <Toggle checked onChange={() => undefined} />
                    </SettingRow>
                </Demo>
                <Demo label="row · error" wide>
                    <SettingRow label="With an error" error="That folder does not exist.">
                        <TextInput value="10 Nope" onChange={() => undefined} />
                    </SettingRow>
                </Demo>
                <Demo label="row · stack" wide>
                    <SettingRow layout="stack" label="Stacked" desc="Control on its own line.">
                        <TextInput value={text} onChange={setText} />
                    </SettingRow>
                </Demo>
                <Demo label="row · disabled" wide>
                    <SettingRow label="Needs another module" disabled>
                        <Toggle checked={false} disabled onChange={() => undefined} />
                    </SettingRow>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.feedback')}>
                <Demo label="hint" wide>
                    <div className="zenith-settings__hint">A plain hint.</div>
                </Demo>
                <Demo label="hint--info" wide>
                    <div className="zenith-settings__hint zenith-settings__hint--info">
                        Something worth knowing.
                    </div>
                </Demo>
                <Demo label="hint--warn" wide>
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        <span>Something went wrong.</span>
                        <button className="zenith-settings__inline-btn">Fix it</button>
                    </div>
                </Demo>
                <Demo label="empty-note" wide>
                    <div className="zenith-settings__empty-note">Nothing installed yet.</div>
                </Demo>
                <Demo label="menu-divider" wide>
                    <div className="zenith-settings__menu-divider">Section label</div>
                </Demo>
                <Demo label="disclosure" wide>
                    <details className="zenith-settings__disclosure">
                        <summary>What that means</summary>
                        <p>
                            The paragraph a one-line summary is standing in for, kept a click
                            away rather than shown on every visit.
                        </p>
                    </details>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.menu')}>
                <Demo label="menu" wide>
                    <div className="zenith-settings__menu">
                        <div className="zenith-settings__menu-item">
                            <div className="zenith-settings__menu-icon">
                                <Sparkles size={18} />
                            </div>
                            <div className="zenith-settings__menu-text">
                                <div className="zenith-settings__menu-title">A row</div>
                                <div className="zenith-settings__menu-desc">With a description.</div>
                            </div>
                        </div>
                        <div className="zenith-settings__menu-item">
                            <div className="zenith-settings__menu-icon">
                                <Sparkles size={18} />
                            </div>
                            <div className="zenith-settings__menu-text">
                                <div className="zenith-settings__menu-title">
                                    A badged row
                                    <span className="zenith-settings__menu-badge">third-party</span>
                                </div>
                                <div className="zenith-settings__menu-desc">And its description.</div>
                            </div>
                        </div>
                    </div>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.badges')}>
                <Demo label="Badge · variants" wide>
                    <div className="zenith-debug__strip">
                        <Badge text="default" />
                        <Badge text="success" variant="success" />
                        <Badge text="warning" variant="warning" />
                        <Badge text="danger" variant="danger" />
                        <Badge text="info" variant="info" />
                        <Badge text="with a dot" variant="success" dot />
                        <Badge text="md" variant="info" size="md" />
                    </div>
                </Demo>
                <Demo label="ProgressBar" wide>
                    <div className="zenith-debug__stack">
                        <ProgressBar value={30} size="sm" />
                        <ProgressBar value={64} label="Halfway" />
                        <ProgressBar value={100} size="lg" color="#22c55e" />
                        <ProgressBar value={45} animated />
                    </div>
                </Demo>
                <Demo label="Card" wide>
                    <div className="zenith-debug__strip">
                        <Card padding="sm">Small</Card>
                        <Card>Medium</Card>
                        <Card hoverable onClick={() => undefined}>
                            Hoverable
                        </Card>
                    </div>
                </Demo>
            </Section>

            <Section title={t('debug.gallery.rich')}>
                <Demo label="StarRating">
                    <StarRating value={stars} onChange={setStars} showValue />
                </Demo>
                <Demo label="StarRating · readOnly">
                    <StarRating value={5} readOnly showValue />
                </Demo>
                <Demo label="PieChart · donut">
                    <PieChart data={PIE} size={120} centerCaption="items" />
                </Demo>
                <Demo label="PieChart · pie">
                    <PieChart data={PIE} size={120} donut={false} showLegend={false} />
                </Demo>
                <Demo label="PieChart · empty">
                    <PieChart data={[]} size={120} />
                </Demo>
                <Demo label="Tabs" wide>
                    <Tabs
                        activeTab={tab}
                        onTabChange={setTab}
                        tabs={[
                            { id: 'first', label: 'First', count: 3 },
                            { id: 'second', label: 'Second', color: '#22c55e' },
                            { id: 'third', label: 'Third', icon: <Sparkles size={14} /> },
                        ]}
                    />
                </Demo>
                <Demo label="Modal">
                    <ActionButton label="Open" onClick={() => setModal(true)} />
                    {modal && (
                        <Modal
                            title="A modal"
                            onClose={() => setModal(false)}
                            footer={
                                <ActionButton label="Close" cta onClick={() => setModal(false)} />
                            }
                        >
                            <p>Body content, so the padding and the scroll area are visible.</p>
                            <p>Escape closes it, and so does a click on the backdrop.</p>
                        </Modal>
                    )}
                </Demo>
            </Section>

            <Section title={t('debug.gallery.icons')}>
                <Demo label="DynamicIcon" wide>
                    <div className="zenith-debug__strip">
                        {['sparkles', 'workflow', 'moon-star', 'cloud-sun', 'check-square'].map(
                            (name) => (
                                <span key={name} className="zenith-debug__icon" title={name}>
                                    <DynamicIcon name={name} size={18} />
                                </span>
                            )
                        )}
                        {/* The fallback path: a name nothing resolves. A blank
                            square here is the bug, not the demo. */}
                        <span className="zenith-debug__icon" title="not-a-real-icon">
                            <DynamicIcon name="not-a-real-icon" fallback={Sparkles} size={18} />
                        </span>
                    </div>
                </Demo>
            </Section>
        </div>
    );
};
