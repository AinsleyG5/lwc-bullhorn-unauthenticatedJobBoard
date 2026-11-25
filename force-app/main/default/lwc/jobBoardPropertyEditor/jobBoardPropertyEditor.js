import { LightningElement, api, track, wire } from 'lwc';
import getJobFieldOptions from '@salesforce/apex/JobBoardController.getJobFieldOptions';
import {
    DEFAULT_CONFIG,
    LABEL_GROUPS,
    THEME_COLORS,
    PAY_FIELD_OPTION,
    parseConfig,
    deepClone,
    setPath,
    reduceError
} from 'c/jobBoardConfig';

const isAmountOption = (o) => ['currency', 'double', 'integer', 'percent'].includes(o.type);

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest first' },
    { value: 'titleAsc', label: 'Job title A–Z' },
    { value: 'salaryDesc', label: 'Highest salary (needs a salary field)' }
];
const PANEL_MODES = [
    { value: 'docked', label: 'Docked on the left (drawer on mobile)' },
    { value: 'drawer', label: 'Slide-out drawer on every screen size' }
];
const APPLY_TARGETS = [
    { value: 'recordPage', label: 'Job record page (Job Apply on the TR1__Job__c detail page)' },
    { value: 'namedPage', label: 'Site page, with the job Id in the URL' },
    { value: 'url', label: 'Custom URL' }
];

/**
 * Experience Builder property editor for c/jobBoard. Follows the same pattern as the
 * Job Apply editor: the whole configuration is one JSON string, merged over DEFAULT_CONFIG.
 */
export default class JobBoardPropertyEditor extends LightningElement {
    @api label;
    @api schema;
    @api errors;

    @track editorValues = deepClone(DEFAULT_CONFIG);
    displayProperty = false;
    fieldOptions = [];
    fieldError;
    jsonDraft;
    jsonError;

    _value;
    @api
    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val;
        // parseConfig works on a fresh copy, so DEFAULT_CONFIG is never mutated by edits.
        this.editorValues = parseConfig(val);
    }

    @wire(getJobFieldOptions)
    wiredFields({ data, error }) {
        if (data) {
            this.fieldOptions = data.map((o) => ({ label: `${o.label} (${o.value})`, value: o.value, type: o.type }));
            this.fieldError = undefined;
        } else if (error) {
            this.fieldError = reduceError(error);
        }
    }

    // ------------------------------------------------------------------ option lists

    get sortOptions() {
        return SORT_OPTIONS;
    }

    get panelModes() {
        return PANEL_MODES;
    }

    get applyTargets() {
        return APPLY_TARGETS;
    }

    /** Field options for single-field pickers, keeping any saved value that is not in the list. */
    optionsWith(value, filterFn) {
        const base = [{ label: '— None —', value: '' }, ...this.fieldOptions.filter(filterFn || (() => true))];
        if (value && !base.some((o) => o.value === value)) {
            base.splice(1, 0, { label: `${value} (not found for this user)`, value });
        }
        return base;
    }

    /** Card and detail summary fields can also use the $pay virtual field. */
    get displayFieldOptions() {
        return [PAY_FIELD_OPTION, ...this.fieldOptions];
    }

    get recordTypeFieldOptions() {
        return this.optionsWith(this.editorValues.pay.recordTypeField, (o) => ['string', 'picklist'].includes(o.type));
    }

    get payLowSalaryOptions() {
        return this.optionsWith(this.editorValues.pay.salaryLowField, isAmountOption);
    }

    get payHighSalaryOptions() {
        return this.optionsWith(this.editorValues.pay.salaryHighField, isAmountOption);
    }

    get payLowRateOptions() {
        return this.optionsWith(this.editorValues.pay.rateLowField, isAmountOption);
    }

    get payHighRateOptions() {
        return this.optionsWith(this.editorValues.pay.rateHighField, isAmountOption);
    }

    get titleFieldOptions() {
        return this.optionsWith(this.editorValues.data.titleField, (o) => ['string', 'picklist', 'textarea'].includes(o.type));
    }

    get dateFieldOptions() {
        return this.optionsWith(this.editorValues.data.dateField, (o) => ['date', 'datetime'].includes(o.type));
    }

    get salaryFieldOptions() {
        return this.optionsWith(this.editorValues.data.salaryField, isAmountOption);
    }

    get snippetFieldOptions() {
        return this.optionsWith(this.editorValues.data.snippetField, (o) => ['textarea', 'string'].includes(o.type));
    }

    get themeColorInputs() {
        return THEME_COLORS.map(([key, label]) => ({ key, label, name: `theme.${key}`, value: this.editorValues.theme[key] }));
    }

    get labelGroups() {
        return LABEL_GROUPS.map((g) => ({
            ...g,
            inputs: g.keys.map(([key, label]) => ({ key, label, name: `labels.${key}`, value: this.editorValues.labels[key] }))
        }));
    }

    get isUrlTarget() {
        return this.editorValues.apply.target === 'url';
    }

    get isNamedPageTarget() {
        return this.editorValues.apply.target === 'namedPage';
    }

    get jsonText() {
        return this.jsonDraft ?? JSON.stringify(this.editorValues, null, 2);
    }

    // ------------------------------------------------------------------ handlers

    handleEditProperty() {
        this.displayProperty = true;
    }

    /**
     * Generic handler. `name` is a path into the config (e.g. "theme.primaryColor").
     * data-type="number" stores a number; checkboxes store a boolean.
     * data-return="true" saves immediately (pickers/checkboxes); text inputs save on blur.
     */
    handleChange(event) {
        const target = event.target;
        let value = event.detail && 'value' in event.detail ? event.detail.value : target.value;
        if (target.type === 'checkbox' || target.type === 'toggle') {
            value = target.checked;
        } else if (target.dataset.type === 'number') {
            value = value === '' || value === null ? '' : Number(value);
        }
        setPath(this.editorValues, target.name, value);
        this.jsonDraft = undefined;
        if (String(target.dataset.return) === 'true') {
            this.handleReturnValue();
        }
    }

    handleListChange(event) {
        setPath(this.editorValues, event.target.dataset.path, event.detail.items);
        this.editorValues = { ...this.editorValues };
        this.jsonDraft = undefined;
        this.handleReturnValue();
    }

    handleResetTheme() {
        this.editorValues.theme = deepClone(DEFAULT_CONFIG.theme);
        this.editorValues = { ...this.editorValues };
        this.handleReturnValue();
    }

    handleJsonInput(event) {
        this.jsonDraft = event.target.value;
    }

    handleJsonApply() {
        try {
            this.editorValues = parseConfig(JSON.parse(this.jsonDraft ?? this.jsonText));
            this.jsonDraft = undefined;
            this.jsonError = undefined;
            this.handleReturnValue();
        } catch (e) {
            this.jsonError = `Not valid JSON: ${e.message}`;
        }
    }

    handleReturnValue() {
        const returnValue = JSON.stringify(this.editorValues);
        this._value = returnValue;
        this.dispatchEvent(new CustomEvent('valuechange', { detail: { value: returnValue } }));
    }
}
