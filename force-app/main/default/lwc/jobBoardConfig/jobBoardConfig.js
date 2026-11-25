/**
 * Shared configuration for the public job board.
 *
 * The board stores all of its settings as one JSON string (the "config" design attribute), edited by
 * c/jobBoardPropertyEditor. DEFAULT_CONFIG is the single source of truth for every setting: anything
 * missing from a saved config falls back to the value here, so new settings can be added without
 * breaking pages that were configured earlier.
 */
import LOCALE from '@salesforce/i18n/locale';
import CURRENCY from '@salesforce/i18n/currency';

export const FILTER_TYPES = ['multi', 'text', 'minNumber', 'maxNumber', 'datePosted', 'boolean'];
export const CHOICE_TYPES = ['minNumber', 'maxNumber', 'datePosted'];

export const DEFAULT_CONFIG = {
    version: 1,
    data: {
        accountId: '',
        titleField: 'Name',
        searchFields: 'Name',
        dateField: 'TR1__Open_Date__c',
        salaryField: '',
        snippetField: 'TR1__Client_Job_Description__c',
        snippetLength: 220,
        pageSize: 12,
        defaultSort: 'newest',
        currencyCode: '',
        debug: false
    },
    layout: {
        showHero: true,
        showLogo: false,
        logoUrl: '',
        companyName: '',
        filterPanelMode: 'docked', // docked | drawer
        filterPanelOpenByDefault: true,
        showResultCount: true,
        hideEmptyCardFields: false
    },
    theme: {
        primaryColor: '#03237A',
        primaryTextColor: '#FFFFFF',
        accentColor: '#74D9CA',
        accentTextColor: '#03237A',
        buttonColor: '#041E42',
        buttonTextColor: '#FFFFFF',
        headingColor: '#03237A',
        textColor: '#1E2A3B',
        mutedColor: '#5B6675',
        labelColor: '#2E9C8D',
        surfaceColor: '#ECECEC',
        detailPanelColor: '#E9EDF2',
        pageBackground: '#FFFFFF',
        borderColor: '#C9CED6',
        fontFamily: 'inherit',
        headingFontFamily: 'inherit',
        headingWeight: 800,
        radius: 0,
        maxWidth: 1320,
        cardMinWidth: 300,
        heroImageUrl: ''
    },
    filters: [
        { id: 'f_function', field: 'TR1__Function__c', label: 'Job function', type: 'multi', options: '', expanded: true },
        { id: 'f_location', field: 'TR1__City__c', label: 'Location', type: 'multi', options: '', expanded: true },
        { id: 'f_type', field: 'RecordType.Name', label: 'Job type', type: 'multi', options: '', expanded: true },
        { id: 'f_salary', field: '', label: 'Salary', type: 'minNumber', options: '20000,25000,30000,40000,50000', expanded: true },
        { id: 'f_title', field: 'TR1__External_Job_Title__c', label: 'Job title contains', type: 'text', options: '', expanded: false },
        { id: 'f_posted', field: 'TR1__Open_Date__c', label: 'Date posted', type: 'datePosted', options: '1,7,14,30', expanded: false }
    ],
    card: {
        fields: [
            { id: 'c_location', field: 'TR1__City__c', label: 'Location' },
            { id: 'c_salary', field: '', label: 'Salary' }
        ]
    },
    detail: {
        sidebarFields: [
            { id: 'd_location', field: 'TR1__City__c', label: 'Location' },
            { id: 'd_salary', field: '', label: 'Salary' },
            { id: 'd_type', field: 'RecordType.Name', label: 'Job type' },
            { id: 'd_function', field: 'TR1__Function__c', label: 'Job function' },
            { id: 'd_ref', field: 'TR1__Job_Number__c', label: 'Job reference' },
            { id: 'd_posted', field: 'TR1__Open_Date__c', label: 'Posted' }
        ],
        sections: [
            { id: 's_desc', field: 'TR1__Client_Job_Description__c', heading: '' },
            { id: 's_resp', field: 'TR1__Responsibilities__c', heading: 'Key responsibilities' },
            { id: 's_req', field: 'TR1__Experience_Requirements__c', heading: 'What do I need?' }
        ]
    },
    apply: {
        target: 'recordPage', // recordPage | namedPage | url
        pageApiName: '',
        paramName: 'recordId',
        urlTemplate: '',
        newTab: false
    },
    labels: {
        heroHeadline: 'Find your next role',
        heroSubtext: '',
        searchPlaceholder: 'Search by job title',
        searchButton: 'Search',
        clearSearch: 'Clear search',
        listHeadline: 'Current vacancies',
        resultsCount: '{count} roles',
        resultsCountOne: '1 role',
        showFilters: 'Show filters',
        hideFilters: 'Hide filters',
        filtersTitle: 'Filters',
        clearFilters: 'Clear all',
        closeFilters: 'Close filters',
        showResults: 'Show {count} results',
        anyOption: 'Any',
        minAmount: '{value}+',
        maxAmount: 'Up to {value}',
        datePosted24h: 'Past 24 hours',
        datePostedDays: 'Past {n} days',
        searchOptions: 'Search options',
        showAllOptions: 'Show all {count}',
        showFewerOptions: 'Show fewer',
        noOptions: 'No options available',
        sortLabel: 'Sort by',
        sortNewest: 'Newest first',
        sortTitle: 'Job title A–Z',
        sortSalary: 'Highest salary',
        apply: 'Apply now',
        readMore: 'Read more',
        back: 'Back to list',
        loadMore: 'Load more roles',
        emptyValue: '—',
        noResultsTitle: 'No results found',
        noResultsBody: 'There are no roles matching your search right now. Try removing a filter, or check back soon.',
        noResultsCtaLabel: '',
        noResultsCtaUrl: '',
        jobNotFound: 'This role is no longer available.',
        errorMessage: 'Jobs could not be loaded right now. Please try again shortly.'
    }
};

/** Labels shown in the property editor, grouped for readability. */
export const LABEL_GROUPS = [
    {
        name: 'hero',
        label: 'Hero & search',
        keys: [
            ['heroHeadline', 'Hero headline'],
            ['heroSubtext', 'Hero supporting text'],
            ['searchPlaceholder', 'Search placeholder'],
            ['searchButton', 'Search button'],
            ['clearSearch', 'Clear search (screen reader)']
        ]
    },
    {
        name: 'results',
        label: 'Results',
        keys: [
            ['listHeadline', 'Results headline'],
            ['resultsCount', 'Result count ({count})'],
            ['resultsCountOne', 'Result count (one)'],
            ['sortLabel', 'Sort label'],
            ['sortNewest', 'Sort: newest'],
            ['sortTitle', 'Sort: title'],
            ['sortSalary', 'Sort: salary'],
            ['loadMore', 'Load more button'],
            ['emptyValue', 'Empty field placeholder']
        ]
    },
    {
        name: 'filters',
        label: 'Filters panel',
        keys: [
            ['showFilters', 'Show filters'],
            ['hideFilters', 'Hide filters'],
            ['filtersTitle', 'Panel title'],
            ['clearFilters', 'Clear filters'],
            ['closeFilters', 'Close (screen reader)'],
            ['showResults', 'Mobile results button ({count})'],
            ['anyOption', '"Any" option'],
            ['minAmount', 'Minimum amount ({value})'],
            ['maxAmount', 'Maximum amount ({value})'],
            ['datePosted24h', 'Date posted: 1 day'],
            ['datePostedDays', 'Date posted: days ({n})'],
            ['searchOptions', 'Search within options'],
            ['showAllOptions', 'Show all options ({count})'],
            ['showFewerOptions', 'Show fewer options'],
            ['noOptions', 'No options']
        ]
    },
    {
        name: 'cards',
        label: 'Job card & detail',
        keys: [
            ['apply', 'Apply button'],
            ['readMore', 'Read more link'],
            ['back', 'Back to list'],
            ['jobNotFound', 'Job not found']
        ]
    },
    {
        name: 'empty',
        label: 'No results & errors',
        keys: [
            ['noResultsTitle', 'No results headline'],
            ['noResultsBody', 'No results text'],
            ['noResultsCtaLabel', 'No results button label'],
            ['noResultsCtaUrl', 'No results button URL'],
            ['errorMessage', 'Error message']
        ]
    }
];

/** Theme settings shown in the property editor. */
export const THEME_COLORS = [
    ['primaryColor', 'Hero background'],
    ['primaryTextColor', 'Hero text'],
    ['accentColor', 'Accent (card header, apply)'],
    ['accentTextColor', 'Text on accent'],
    ['buttonColor', 'Search button'],
    ['buttonTextColor', 'Search button text'],
    ['headingColor', 'Headings'],
    ['textColor', 'Body text'],
    ['mutedColor', 'Secondary text'],
    ['labelColor', 'Field labels'],
    ['surfaceColor', 'Card background'],
    ['detailPanelColor', 'Detail side panel'],
    ['pageBackground', 'Page background'],
    ['borderColor', 'Lines & borders']
];

// ------------------------------------------------------------------ config helpers

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Saved values win; anything missing comes from defaults. Arrays are replaced, not merged. */
export function mergeConfig(saved, defaults = DEFAULT_CONFIG) {
    const out = deepClone(defaults);
    if (!isPlainObject(saved)) {
        return out;
    }
    Object.keys(saved).forEach((key) => {
        const value = saved[key];
        if (isPlainObject(value) && isPlainObject(out[key])) {
            out[key] = mergeConfig(value, out[key]);
        } else if (value !== undefined && value !== null) {
            out[key] = deepClone(value);
        }
    });
    return out;
}

/** Parses the design attribute, falling back to defaults when it is empty or not valid JSON. */
export function parseConfig(json) {
    let saved = {};
    if (json) {
        try {
            saved = typeof json === 'string' ? JSON.parse(json) : json;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('jobBoard: config is not valid JSON, using defaults.', e);
        }
    }
    const cfg = mergeConfig(saved);
    ensureIds(cfg.filters, 'filter');
    ensureIds(cfg.card.fields, 'card');
    ensureIds(cfg.detail.sidebarFields, 'side');
    ensureIds(cfg.detail.sections, 'sec');
    return cfg;
}

function ensureIds(list, prefix) {
    if (!Array.isArray(list)) {
        return;
    }
    list.forEach((item, i) => {
        if (item && !item.id) {
            item.id = `${prefix}_${i}`;
        }
    });
}

export function newId(prefix = 'i') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
    const keys = path.split('.');
    let target = obj;
    keys.slice(0, -1).forEach((k) => {
        if (!isPlainObject(target[k])) {
            target[k] = {};
        }
        target = target[k];
    });
    target[keys[keys.length - 1]] = value;
}

export function splitList(value) {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export function interpolate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (vars[key] === undefined ? m : vars[key]));
}

/** True inside Experience Builder / preview, where configuration warnings are worth showing. */
export function isBuilderContext() {
    try {
        const { hostname, href } = window.location;
        return /sitepreview|livepreview|builder\.salesforce-experience|preview\.salesforce-experience/i.test(hostname) || /[?&]preview=/i.test(href);
    } catch (e) {
        return false;
    }
}

// ------------------------------------------------------------------ value formatting

const moneyFormatters = {};
export function formatMoney(value, currencyCode) {
    const code = currencyCode || CURRENCY || 'GBP';
    if (!moneyFormatters[code]) {
        try {
            moneyFormatters[code] = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code, maximumFractionDigits: 0 });
        } catch (e) {
            moneyFormatters[code] = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
        }
    }
    return moneyFormatters[code].format(Number(value));
}

let dateFormatter;
function formatDate(value) {
    if (!dateFormatter) {
        dateFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    // Plain dates arrive as yyyy-mm-dd; build them as local dates so time zones cannot shift the day.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Plain text from rich text, for card snippets. Output is rendered as text, never as HTML. */
export function stripHtml(html) {
    return String(html || '')
        .replace(/<(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
        .replace(/\s+/g, ' ')
        .trim();
}

export function truncate(text, max) {
    if (!text || !max || text.length <= max) {
        return text;
    }
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export function isEmpty(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Display text for a field value, based on its describe type from Apex. */
export function formatValue(value, meta = {}, options = {}) {
    if (isEmpty(value)) {
        return options.emptyValue ?? '';
    }
    switch (meta.type) {
        case 'boolean':
            return value ? 'Yes' : 'No';
        case 'date':
        case 'datetime':
            return formatDate(value);
        case 'currency':
            return formatMoney(value, options.currencyCode);
        case 'double':
        case 'integer':
        case 'long':
            return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: meta.scale ?? 2 }).format(Number(value));
        case 'percent':
            return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: meta.scale ?? 2 }).format(Number(value))}%`;
        case 'multipicklist':
            return String(value).split(';').join(', ');
        case 'textarea':
            return meta.isHtml ? stripHtml(value) : String(value);
        default:
            return String(value);
    }
}

/** Readable message from an Apex / wire error. */
export function reduceError(error) {
    if (!error) {
        return '';
    }
    if (Array.isArray(error.body)) {
        return error.body.map((e) => e.message).join(', ');
    }
    return error.body?.message || error.message || String(error);
}
