import { LightningElement, api, track } from 'lwc';
import { interpolate } from 'c/jobBoardConfig';

const VISIBLE_OPTIONS = 6;
const SEARCHABLE_AFTER = 10;

/**
 * Filter panel. The parent passes ready-made filter models and owns the selected state; this
 * component only keeps view state (which long lists are expanded, what's typed in an option search).
 *
 * Events:
 *   filterchange  { id, kind: 'toggle' | 'choice' | 'text' | 'boolean', value, checked }
 *   clearall
 *   close
 */
export default class JobBoardFilters extends LightningElement {
    /** [{ id, label, type, isMulti, isChoice, isText, isBoolean, expanded, activeCount, options, textValue, checked }] */
    @api filters = [];
    @api labels = {};
    @api total = 0;
    @api activeCount = 0;

    @track showAll = {};
    @track optionQuery = {};

    get hasActive() {
        return this.activeCount > 0;
    }

    get showResultsLabel() {
        return interpolate(this.labels.showResults, { count: this.total });
    }

    get groups() {
        return (this.filters || []).map((f) => {
            if (!f.isMulti) {
                return f;
            }
            const options = f.options || [];
            const query = (this.optionQuery[f.id] || '').trim().toLowerCase();
            const matching = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
            const expanded = this.showAll[f.id] || query;
            // Selected options always stay visible, even when the list is collapsed.
            const visible = expanded ? matching : matching.filter((o, i) => i < VISIBLE_OPTIONS || o.checked);
            return {
                ...f,
                visibleOptions: visible,
                showSearch: options.length > SEARCHABLE_AFTER,
                search: this.optionQuery[f.id] || '',
                noOptions: matching.length === 0,
                canExpand: !query && matching.length > VISIBLE_OPTIONS,
                expandLabel: this.showAll[f.id]
                    ? this.labels.showFewerOptions
                    : interpolate(this.labels.showAllOptions, { count: matching.length })
            };
        });
    }

    emit(detail) {
        this.dispatchEvent(new CustomEvent('filterchange', { detail }));
    }

    handleToggle(event) {
        const { id, value } = event.target.dataset;
        this.emit({ id, kind: 'toggle', value, checked: event.target.checked });
    }

    handleChoice(event) {
        const { id, value } = event.target.dataset;
        this.emit({ id, kind: 'choice', value });
    }

    handleText(event) {
        this.emit({ id: event.target.dataset.id, kind: 'text', value: event.target.value });
    }

    handleBoolean(event) {
        this.emit({ id: event.target.dataset.id, kind: 'boolean', checked: event.target.checked });
    }

    handleOptionSearch(event) {
        this.optionQuery = { ...this.optionQuery, [event.target.dataset.id]: event.target.value };
    }

    handleShowAll(event) {
        const id = event.currentTarget.dataset.id;
        this.showAll = { ...this.showAll, [id]: !this.showAll[id] };
    }

    handleClear() {
        this.optionQuery = {};
        this.dispatchEvent(new CustomEvent('clearall'));
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }
}
