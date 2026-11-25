import { LightningElement, api } from 'lwc';

/**
 * Styling component for the job board.
 *
 * Wrap any markup in <c-job-board-theme theme={...}> and it receives the brand as CSS custom
 * properties (--jb-*). Custom properties inherit through shadow DOM and slots, so every nested
 * component (filters, cards, detail) reads the same tokens without being passed the theme.
 *
 * Values come from a site admin in Experience Builder, so each one is checked before it is written
 * into the style attribute.
 */
const COLOR_TOKENS = {
    primaryColor: '--jb-primary',
    primaryTextColor: '--jb-on-primary',
    accentColor: '--jb-accent',
    accentTextColor: '--jb-on-accent',
    buttonColor: '--jb-button',
    buttonTextColor: '--jb-on-button',
    headingColor: '--jb-heading',
    textColor: '--jb-text',
    mutedColor: '--jb-muted',
    labelColor: '--jb-label',
    surfaceColor: '--jb-surface',
    detailPanelColor: '--jb-panel',
    pageBackground: '--jb-page',
    borderColor: '--jb-border'
};

const PX_TOKENS = {
    radius: ['--jb-radius', 0, 32],
    maxWidth: ['--jb-max-width', 640, 2400],
    cardMinWidth: ['--jb-card-min', 220, 600]
};

const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]{3,20})$/i;

function safeColor(value) {
    const v = String(value || '').trim();
    return COLOR_PATTERN.test(v) ? v : null;
}

function safeFont(value) {
    const v = String(value || '').replace(/[;{}<>\\]/g, '').trim();
    return v || null;
}

function safeUrl(value) {
    const v = String(value || '').trim();
    if (!v || !/^(https:\/\/|\/(?!\/))/i.test(v)) {
        return null;
    }
    let normalised = v;
    try {
        normalised = encodeURI(decodeURI(v));
    } catch (e) {
        normalised = encodeURI(v);
    }
    return `url("${normalised.replace(/["()'\\]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}")`;
}

export default class JobBoardTheme extends LightningElement {
    @api theme = {};

    get styleText() {
        const t = this.theme || {};
        const decl = [];
        Object.entries(COLOR_TOKENS).forEach(([key, token]) => {
            const c = safeColor(t[key]);
            if (c) {
                decl.push(`${token}: ${c}`);
            }
        });
        Object.entries(PX_TOKENS).forEach(([key, [token, min, max]]) => {
            const n = Number(t[key]);
            if (t[key] !== '' && t[key] !== null && Number.isFinite(n)) {
                decl.push(`${token}: ${Math.min(max, Math.max(min, n))}px`);
            }
        });
        const weight = Number(t.headingWeight);
        if (Number.isFinite(weight) && weight >= 100 && weight <= 900) {
            decl.push(`--jb-heading-weight: ${Math.round(weight / 100) * 100}`);
        }
        const font = safeFont(t.fontFamily);
        if (font) {
            decl.push(`--jb-font: ${font}`);
        }
        const headingFont = safeFont(t.headingFontFamily);
        if (headingFont) {
            decl.push(`--jb-heading-font: ${headingFont === 'inherit' ? 'var(--jb-font)' : headingFont}`);
        }
        const hero = safeUrl(t.heroImageUrl);
        decl.push(`--jb-hero-image: ${hero || 'none'}`);
        return decl.join('; ');
    }
}
