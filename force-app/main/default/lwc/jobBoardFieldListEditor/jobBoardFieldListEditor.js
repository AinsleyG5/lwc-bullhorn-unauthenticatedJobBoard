import { LightningElement, api } from 'lwc';
import { newId, FILTER_TYPES } from 'c/jobBoardConfig';

const TYPE_OPTIONS = [
    { value: 'multi', label: 'Checkbox list (with counts)' },
    { value: 'text', label: 'Text contains' },
    { value: 'minNumber', label: 'Minimum amount' },
    { value: 'maxNumber', label: 'Maximum amount' },
    { value: 'datePosted', label: 'Date posted (within days)' },
    { value: 'boolean', label: 'Yes / no checkbox' }
];

const OPTIONS_HELP = {
    minNumber: 'Comma-separated amounts, e.g. 20000,30000,40000',
    maxNumber: 'Comma-separated amounts, e.g. 20000,30000,40000',
    datePosted: 'Comma-separated days, e.g. 1,7,14,30'
};

/**
 * Ordered list editor used by the property editor for filters, card fields, detail sidebar
 * fields and detail sections.
 *
 * variant: 'field'   -> field + label
 *          'filter'  -> field + label + filter type (+ options) + start expanded
 *          'section' -> field + heading
 * Fires `listchange` with { items } whenever the list changes.
 */
export default class JobBoardFieldListEditor extends LightningElement {
    @api variant = 'field';
    @api addLabel = 'Add field';
    @api fieldOptions = [];

    _items = [];
    @api
    get items() {
        return this._items;
    }
    set items(value) {
        this._items = Array.isArray(value) ? value : [];
    }

    get isFilter() {
        return this.variant === 'filter';
    }

    get isSection() {
        return this.variant === 'section';
    }

    get typeOptions() {
        return TYPE_OPTIONS;
    }

    get rows() {
        const known = new Set((this.fieldOptions || []).map((o) => o.value));
        const last = this._items.length - 1;
        return this._items.map((item, index) => {
            const options = [{ label: '— Select a field —', value: '' }, ...(this.fieldOptions || [])];
            if (item.field && !known.has(item.field)) {
                options.splice(1, 0, { label: `${item.field} (not found for this user)`, value: item.field });
            }
            const type = FILTER_TYPES.includes(item.type) ? item.type : 'multi';
            return {
                ...item,
                key: item.id || `row_${index}`,
                index,
                position: index + 1,
                options,
                type,
                isFirst: index === 0,
                isLast: index === last,
                showOptions: this.isFilter && Boolean(OPTIONS_HELP[type]),
                optionsHelp: OPTIONS_HELP[type],
                expandedChecked: item.expanded !== false
            };
        });
    }

    get isEmpty() {
        return this._items.length === 0;
    }

    emit(items) {
        this._items = items;
        this.dispatchEvent(new CustomEvent('listchange', { detail: { items } }));
    }

    update(index, patch) {
        this.emit(this._items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    }

    handleFieldChange(event) {
        const index = Number(event.target.dataset.index);
        const field = event.detail.value;
        const item = this._items[index];
        const patch = { field };
        // Fill in a label from the field the first time one is picked.
        const option = (this.fieldOptions || []).find((o) => o.value === field);
        if (option && !this.isSection && !item.label) {
            patch.label = option.label.replace(/\s*\(.*\)$/, '').replace(' › Name', '');
        }
        this.update(index, patch);
    }

    handleTextBlur(event) {
        const index = Number(event.target.dataset.index);
        const key = event.target.dataset.key;
        if (this._items[index][key] !== event.target.value) {
            this.update(index, { [key]: event.target.value });
        }
    }

    handleTypeChange(event) {
        const index = Number(event.target.dataset.index);
        const type = event.detail.value;
        const patch = { type };
        if (type === 'datePosted' && !this._items[index].options) patch.options = '1,7,14,30';
        if ((type === 'minNumber' || type === 'maxNumber') && !this._items[index].options) patch.options = '20000,30000,40000,50000';
        this.update(index, patch);
    }

    handleExpandedChange(event) {
        this.update(Number(event.target.dataset.index), { expanded: event.target.checked });
    }

    handleMove(event) {
        const index = Number(event.currentTarget.dataset.index);
        const to = index + Number(event.currentTarget.dataset.dir);
        if (to < 0 || to >= this._items.length) return;
        const items = [...this._items];
        [items[index], items[to]] = [items[to], items[index]];
        this.emit(items);
    }

    handleRemove(event) {
        const index = Number(event.currentTarget.dataset.index);
        this.emit(this._items.filter((it, i) => i !== index));
    }

    handleAdd() {
        const item = { id: newId(this.variant), field: '' };
        if (this.isSection) {
            item.heading = '';
        } else {
            item.label = '';
        }
        if (this.isFilter) {
            item.type = 'multi';
            item.options = '';
            item.expanded = true;
        }
        this.emit([...this._items, item]);
    }
}
