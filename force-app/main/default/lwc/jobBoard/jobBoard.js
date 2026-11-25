import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import searchJobs from '@salesforce/apex/JobBoardController.searchJobs';
import getFacets from '@salesforce/apex/JobBoardController.getFacets';
import getJobDetail from '@salesforce/apex/JobBoardController.getJobDetail';
import {
    parseConfig,
    formatValue,
    formatMoney,
    stripHtml,
    truncate,
    interpolate,
    splitList,
    isEmpty,
    isBuilderContext,
    reduceError,
    FILTER_TYPES,
    CHOICE_TYPES
} from 'c/jobBoardConfig';

const JOB_OBJECT = 'TR1__Job__c';
const JOB_PARAM = 'job';
const SEARCH_PARAM = 'q';
const ID_PATTERN = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
const NARROW_QUERY = '(max-width: 900px)';
const TEXT_DEBOUNCE_MS = 400;
const SKELETON_COUNT = 6;

/**
 * Public job board for an Experience Cloud site.
 *
 * Shows open TR1__Job__c records for one account with keyword search, a dockable filter panel,
 * configurable job cards and an in-page detail view. "Apply" hands the visitor over to the
 * Job Apply component (on the job record page by default).
 *
 * Every setting lives in one JSON design attribute ("config") edited by c/jobBoardPropertyEditor;
 * see c/jobBoardConfig for the defaults. Styling is applied by the c/jobBoardTheme child component.
 */
export default class JobBoard extends NavigationMixin(LightningElement) {
    cfg = parseConfig(null);
    _configJson;
    _connected = false;

    @api
    get config() {
        return this._configJson;
    }
    set config(value) {
        this._configJson = value;
        this.cfg = parseConfig(value);
        if (this._connected) {
            // Settings changed in Experience Builder: start again from a clean slate.
            this.filterState = {};
            this.sortKey = this.cfg.data.defaultSort;
            this.loadFacets();
            this.loadJobs();
            if (this.view === 'detail' && this.selectedJobId) {
                this.loadDetail(this.selectedJobId);
            }
        }
    }

    // search & filters
    searchInput = '';
    appliedSearch = '';
    @track filterState = {};
    sortKey;
    facets = {};

    // results
    jobs = [];
    total = 0;
    fieldMeta = {};
    loading = true;
    loadingMore = false;
    error;
    warnings = [];

    // layout
    filtersOpen = false;
    isNarrow = false;

    // detail
    view = 'list';
    selectedJobId;
    detailRow;
    detailLoading = false;
    detailError;

    _seq = 0;
    _detailSeq = 0;
    _textTimer;
    _listScroll = 0;
    _focusDetail = false;

    // ------------------------------------------------------------------ lifecycle

    connectedCallback() {
        this._connected = true;
        this.sortKey = this.cfg.data.defaultSort;

        this._media = window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;
        this.isNarrow = !!this._media?.matches;
        this._onMedia = (e) => {
            this.isNarrow = e.matches;
        };
        this._media?.addEventListener?.('change', this._onMedia);
        this.filtersOpen = !this.isNarrow && this.cfg.layout.filterPanelMode === 'docked' && this.cfg.layout.filterPanelOpenByDefault;

        this._onPopState = () => this.syncFromUrl();
        window.addEventListener('popstate', this._onPopState);

        const params = this.urlParams();
        this.searchInput = this.appliedSearch = (params.get(SEARCH_PARAM) || '').slice(0, 100);
        this.syncFromUrl();

        this.loadFacets();
        this.loadJobs();
    }

    disconnectedCallback() {
        this._connected = false;
        window.removeEventListener('popstate', this._onPopState);
        this._media?.removeEventListener?.('change', this._onMedia);
        clearTimeout(this._textTimer);
    }

    renderedCallback() {
        if (this._focusDetail && this.view === 'detail' && this.detailModel) {
            this._focusDetail = false;
            this.template.querySelector('c-job-board-detail')?.focusTitle();
        }
    }

    // ------------------------------------------------------------------ data

    get selectFields() {
        const { data, card } = this.cfg;
        return unique([data.titleField, ...card.fields.map((f) => f.field), data.snippetField]);
    }

    get detailFields() {
        const { data, detail } = this.cfg;
        return unique([data.titleField, ...detail.sidebarFields.map((f) => f.field), ...detail.sections.map((s) => s.field)]);
    }

    get usableFilters() {
        return this.cfg.filters.filter((f) => f && f.field && FILTER_TYPES.includes(f.type));
    }

    /** The filters in the shape JobBoardQuery.FilterInput expects. */
    get filterInputs() {
        const out = [];
        this.usableFilters.forEach((f) => {
            const st = this.filterState[f.id];
            if (!st) {
                return;
            }
            switch (f.type) {
                case 'multi':
                    if (st.values?.length) out.push({ field: f.field, type: 'multi', values: st.values });
                    break;
                case 'text':
                    if (st.text?.trim()) out.push({ field: f.field, type: 'text', text: st.text.trim() });
                    break;
                case 'minNumber':
                    if (st.choice) out.push({ field: f.field, type: 'minNumber', min: Number(st.choice) });
                    break;
                case 'maxNumber':
                    if (st.choice) out.push({ field: f.field, type: 'maxNumber', max: Number(st.choice) });
                    break;
                case 'datePosted':
                    if (st.choice) out.push({ field: f.field, type: 'datePosted', days: parseInt(st.choice, 10) });
                    break;
                case 'boolean':
                    if (st.checked) out.push({ field: f.field, type: 'boolean', values: ['true'] });
                    break;
                default:
            }
        });
        return out;
    }

    get sortParams() {
        const { titleField, dateField, salaryField } = this.cfg.data;
        switch (this.sortKey) {
            case 'titleAsc':
                return { sortField: titleField || 'Name', sortDirection: 'ASC' };
            case 'salaryDesc':
                if (salaryField) return { sortField: salaryField, sortDirection: 'DESC' };
                break;
            default:
        }
        return { sortField: dateField || 'CreatedDate', sortDirection: 'DESC' };
    }

    async loadJobs(append = false) {
        const seq = ++this._seq;
        if (append) {
            this.loadingMore = true;
        } else {
            this.loading = true;
        }
        this.error = undefined;
        const request = {
            accountId: this.cfg.data.accountId,
            searchTerm: this.appliedSearch,
            searchFields: splitList(this.cfg.data.searchFields),
            fields: this.selectFields,
            filters: this.filterInputs,
            ...this.sortParams,
            pageSize: Number(this.cfg.data.pageSize) || 12,
            offset: append ? this.jobs.length : 0
        };
        try {
            const res = await searchJobs({ requestJson: JSON.stringify(request) });
            if (seq !== this._seq) return;
            this.fieldMeta = { ...this.fieldMeta, ...(res.fieldMeta || {}) };
            this.total = res.total || 0;
            this.jobs = append ? [...this.jobs, ...(res.rows || [])] : res.rows || [];
            this.addWarnings(res.warnings);
        } catch (e) {
            if (seq !== this._seq) return;
            this.error = e;
            this.logError('searchJobs', e);
        } finally {
            if (seq === this._seq) {
                this.loading = false;
                this.loadingMore = false;
            }
        }
    }

    async loadFacets() {
        const filters = this.usableFilters.filter((f) => f.type === 'multi').map((f) => ({ field: f.field, type: 'multi' }));
        if (!filters.length) {
            this.facets = {};
            return;
        }
        try {
            const res = await getFacets({ requestJson: JSON.stringify({ accountId: this.cfg.data.accountId, filters }) });
            this.facets = res.facets || {};
            this.addWarnings(res.warnings);
        } catch (e) {
            this.logError('getFacets', e);
        }
    }

    async loadDetail(jobId) {
        const seq = ++this._detailSeq;
        this.detailLoading = true;
        this.detailError = undefined;
        this.detailRow = undefined;
        try {
            const res = await getJobDetail({
                requestJson: JSON.stringify({ accountId: this.cfg.data.accountId, jobId, fields: this.detailFields })
            });
            if (seq !== this._detailSeq) return;
            this.fieldMeta = { ...this.fieldMeta, ...(res.fieldMeta || {}) };
            this.detailRow = res.row || null;
            this.addWarnings(res.warnings);
            this._focusDetail = true;
        } catch (e) {
            if (seq !== this._detailSeq) return;
            this.detailError = e;
            this.logError('getJobDetail', e);
        } finally {
            if (seq === this._detailSeq) this.detailLoading = false;
        }
    }

    addWarnings(list) {
        if (list?.length) {
            this.warnings = unique([...this.warnings, ...list]);
        }
    }

    logError(where, e) {
        // eslint-disable-next-line no-console
        console.error(`jobBoard ${where}:`, reduceError(e));
    }

    // ------------------------------------------------------------------ view models

    get labels() {
        return this.cfg.labels;
    }

    get themeConfig() {
        return this.cfg.theme;
    }

    get showHero() {
        return this.cfg.layout.showHero;
    }

    get heroClass() {
        return this.cfg.theme.heroImageUrl ? 'hero hero--image' : 'hero';
    }

    get showLogo() {
        return this.cfg.layout.showLogo && !!this.logoSrc;
    }

    get logoSrc() {
        return safeHref(this.cfg.layout.logoUrl);
    }

    get logoAlt() {
        return this.cfg.layout.companyName || '';
    }

    get hasSearchInput() {
        return !!this.searchInput;
    }

    get isListView() {
        return this.view === 'list';
    }

    get showWarnings() {
        return this.warnings.length > 0 && (this.cfg.data.debug || isBuilderContext());
    }

    get isDrawer() {
        return this.isNarrow || this.cfg.layout.filterPanelMode === 'drawer';
    }

    get drawerAttr() {
        return this.isDrawer ? 'true' : null;
    }

    get hasFilters() {
        return this.usableFilters.length > 0;
    }

    get layoutClass() {
        const classes = ['layout'];
        if (this.filtersOpen && this.hasFilters) classes.push(this.isDrawer ? 'layout--drawer-open' : 'layout--docked-open');
        return classes.join(' ');
    }

    get filtersVisible() {
        return this.filtersOpen && this.hasFilters;
    }

    get filtersExpanded() {
        return String(!!this.filtersVisible);
    }

    get filterToggleLabel() {
        return this.filtersVisible ? this.labels.hideFilters : this.labels.showFilters;
    }

    get activeFilterCount() {
        return this.filterInputs.reduce((n, f) => n + (f.type === 'multi' ? f.values.length : 1), 0);
    }

    get hasActiveFilters() {
        return this.activeFilterCount > 0;
    }

    get resultsCountLabel() {
        return this.total === 1 ? this.labels.resultsCountOne : interpolate(this.labels.resultsCount, { count: this.total.toLocaleString() });
    }

    get showResultCount() {
        return this.cfg.layout.showResultCount && !this.loading && !this.error;
    }

    get sortOptions() {
        const l = this.labels;
        const options = [
            { value: 'newest', label: l.sortNewest },
            { value: 'titleAsc', label: l.sortTitle }
        ];
        if (this.cfg.data.salaryField) {
            options.push({ value: 'salaryDesc', label: l.sortSalary });
        }
        return options.map((o) => ({ ...o, selected: o.value === this.sortKey }));
    }

    choiceLabel(type, n) {
        const l = this.labels;
        if (type === 'datePosted') {
            return n === 1 ? l.datePosted24h : interpolate(l.datePostedDays, { n });
        }
        const money = formatMoney(n, this.cfg.data.currencyCode);
        return interpolate(type === 'maxNumber' ? l.maxAmount : l.minAmount, { value: money });
    }

    get filterModels() {
        return this.usableFilters.map((f) => {
            const st = this.filterState[f.id] || {};
            const model = {
                id: f.id,
                label: f.label || f.field,
                expanded: f.expanded !== false,
                isMulti: f.type === 'multi',
                isChoice: CHOICE_TYPES.includes(f.type),
                isText: f.type === 'text',
                isBoolean: f.type === 'boolean',
                activeCount: 0
            };
            if (model.isMulti) {
                const selected = st.values || [];
                model.options = (this.facets[f.field] || []).map((o) => ({
                    key: `${f.id}|${o.value}`,
                    value: o.value,
                    label: o.label,
                    count: o.count,
                    hasCount: o.count !== null && o.count !== undefined,
                    checked: selected.includes(o.value)
                }));
                model.activeCount = selected.length;
            } else if (model.isChoice) {
                const values = splitList(f.options).map(Number).filter((n) => Number.isFinite(n) && n > 0);
                const current = st.choice || '';
                model.options = [{ value: '', label: this.labels.anyOption }, ...values.map((n) => ({ value: String(n), label: this.choiceLabel(f.type, n) }))].map(
                    (o) => ({ ...o, key: `${f.id}|${o.value}`, checked: o.value === current })
                );
                model.activeCount = current ? 1 : 0;
            } else if (model.isText) {
                model.textValue = st.text || '';
                model.activeCount = st.text?.trim() ? 1 : 0;
            } else if (model.isBoolean) {
                model.checked = !!st.checked;
                model.activeCount = st.checked ? 1 : 0;
            }
            return model;
        });
    }

    /** Removable chips summarising the active filters. */
    get activeChips() {
        const chips = [];
        this.filterModels.forEach((m) => {
            if (m.isMulti) {
                m.options.filter((o) => o.checked).forEach((o) => chips.push({ key: o.key, id: m.id, value: o.value, label: o.label }));
            } else if (m.isChoice) {
                const o = m.options.find((opt) => opt.checked && opt.value);
                if (o) chips.push({ key: o.key, id: m.id, value: o.value, label: `${m.label}: ${o.label}` });
            } else if (m.isText && m.activeCount) {
                chips.push({ key: `${m.id}|text`, id: m.id, label: `${m.label}: “${m.textValue.trim()}”` });
            } else if (m.isBoolean && m.checked) {
                chips.push({ key: `${m.id}|bool`, id: m.id, label: m.label });
            }
        });
        return chips;
    }

    get hasChips() {
        return this.activeChips.length > 0;
    }

    fieldValue(row, field, label) {
        const meta = this.fieldMeta[field] || {};
        return {
            key: `${row.Id}|${field}|${label}`,
            label: label || meta.label || field,
            raw: row[field],
            value: formatValue(row[field], meta, { emptyValue: this.labels.emptyValue, currencyCode: this.cfg.data.currencyCode })
        };
    }

    titleOf(row) {
        const t = row[this.cfg.data.titleField];
        return isEmpty(t) ? row.Name || '' : String(t);
    }

    jobHref(jobId) {
        const params = this.urlParams();
        params.set(JOB_PARAM, jobId);
        return `?${params.toString()}`;
    }

    get listHref() {
        const params = this.urlParams();
        params.delete(JOB_PARAM);
        const qs = params.toString();
        return qs ? `?${qs}` : window.location.pathname;
    }

    get cards() {
        const { card, data, layout } = this.cfg;
        return this.jobs.map((row) => {
            let fields = card.fields.filter((f) => f.field).map((f) => this.fieldValue(row, f.field, f.label));
            if (layout.hideEmptyCardFields) {
                fields = fields.filter((f) => !isEmpty(f.raw));
            }
            const snippetRaw = data.snippetField ? row[data.snippetField] : null;
            return {
                id: row.Id,
                title: this.titleOf(row),
                href: this.jobHref(row.Id),
                fields,
                hasFields: fields.length > 0,
                snippet: isEmpty(snippetRaw) ? '' : truncate(stripHtml(snippetRaw), Number(data.snippetLength) || 220)
            };
        });
    }

    get skeletons() {
        return Array.from({ length: SKELETON_COUNT }, (v, i) => ({ key: `s${i}` }));
    }

    get hasResults() {
        return !this.loading && !this.error && this.jobs.length > 0;
    }

    get showEmpty() {
        return !this.loading && !this.error && this.jobs.length === 0;
    }

    get showNoResultsCta() {
        return !!(this.labels.noResultsCtaLabel && safeHref(this.labels.noResultsCtaUrl));
    }

    get noResultsCtaHref() {
        return safeHref(this.labels.noResultsCtaUrl);
    }

    get canClearFromEmpty() {
        return this.hasActiveFilters || !!this.appliedSearch;
    }

    get hasMore() {
        return !this.loading && this.jobs.length < this.total;
    }

    get errorText() {
        // Configuration problems are only spelled out to people editing the site.
        return isBuilderContext() || this.cfg.data.debug ? reduceError(this.error) : this.labels.errorMessage;
    }

    get detailModel() {
        const row = this.detailRow;
        if (!row) return null;
        const { detail } = this.cfg;
        const sidebar = detail.sidebarFields.filter((f) => f.field).map((f) => this.fieldValue(row, f.field, f.label));
        const sections = detail.sections
            .filter((s) => s.field && !isEmpty(row[s.field]))
            .map((s) => {
                const meta = this.fieldMeta[s.field] || {};
                return {
                    key: `${row.Id}|${s.id}`,
                    heading: s.heading,
                    isHtml: !!meta.isHtml,
                    html: meta.isHtml ? row[s.field] : null,
                    text: meta.isHtml ? null : formatValue(row[s.field], meta)
                };
            });
        return { id: row.Id, title: this.titleOf(row), sidebar, hasSidebar: sidebar.length > 0, sections };
    }

    get detailNotFound() {
        return !this.detailLoading && !this.detailError && this.detailRow === null;
    }

    get detailErrorText() {
        return isBuilderContext() || this.cfg.data.debug ? reduceError(this.detailError) : this.labels.errorMessage;
    }

    // ------------------------------------------------------------------ URL state

    urlParams() {
        try {
            return new URLSearchParams(window.location.search);
        } catch (e) {
            return new URLSearchParams();
        }
    }

    pushUrl(params, replace = false) {
        const qs = params.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
        try {
            if (replace) {
                window.history.replaceState(window.history.state, '', url);
            } else {
                window.history.pushState(window.history.state, '', url);
            }
        } catch (e) {
            // History can be unavailable in some preview contexts; the board still works without it.
        }
    }

    syncFromUrl() {
        const jobId = this.urlParams().get(JOB_PARAM);
        if (jobId && ID_PATTERN.test(jobId)) {
            if (this.view !== 'detail' || this.selectedJobId !== jobId) {
                this.showDetail(jobId);
            }
        } else if (this.view === 'detail') {
            this.showList();
        }
    }

    // ------------------------------------------------------------------ view switching

    showDetail(jobId) {
        if (this.view === 'list') {
            this._listScroll = window.scrollY;
        }
        this.view = 'detail';
        this.selectedJobId = jobId;
        this.loadDetail(jobId);
        this.scrollToTop();
    }

    showList() {
        this.view = 'list';
        this.selectedJobId = undefined;
        this.detailRow = undefined;
        // Restore where the visitor was in the list once it has re-rendered.
        const y = this._listScroll;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        requestAnimationFrame(() => window.scrollTo({ top: y }));
    }

    scrollToTop() {
        const root = this.template.querySelector('.jb');
        if (root && root.getBoundingClientRect().top < 0) {
            root.scrollIntoView({ block: 'start' });
        }
    }

    // ------------------------------------------------------------------ handlers

    handleSearchInput(event) {
        this.searchInput = event.target.value;
    }

    handleSearchSubmit(event) {
        event.preventDefault();
        this.applySearch(this.searchInput.trim());
    }

    handleClearSearch() {
        this.searchInput = '';
        this.applySearch('');
        this.template.querySelector('.search__input')?.focus();
    }

    applySearch(term) {
        this.appliedSearch = term.slice(0, 100);
        const params = this.urlParams();
        if (this.appliedSearch) params.set(SEARCH_PARAM, this.appliedSearch);
        else params.delete(SEARCH_PARAM);
        this.pushUrl(params, true);
        this.loadJobs();
    }

    handleToggleFilters() {
        this.filtersOpen = !this.filtersOpen;
    }

    handleCloseFilters() {
        this.filtersOpen = false;
        this.template.querySelector('.toolbar__filters')?.focus();
    }

    handleDrawerKeydown(event) {
        if (event.key === 'Escape' && this.isDrawer) {
            this.handleCloseFilters();
        }
    }

    handleFilterChange(event) {
        const { id, kind, value, checked } = event.detail;
        const st = { ...(this.filterState[id] || {}) };
        switch (kind) {
            case 'toggle': {
                const values = new Set(st.values || []);
                if (checked) values.add(value);
                else values.delete(value);
                st.values = [...values];
                break;
            }
            case 'choice':
                st.choice = value;
                break;
            case 'text':
                st.text = value;
                break;
            case 'boolean':
                st.checked = checked;
                break;
            default:
        }
        this.filterState = { ...this.filterState, [id]: st };

        clearTimeout(this._textTimer);
        if (kind === 'text') {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._textTimer = setTimeout(() => this.loadJobs(), TEXT_DEBOUNCE_MS);
        } else {
            this.loadJobs();
        }
    }

    handleRemoveChip(event) {
        const { id, value } = event.currentTarget.dataset;
        const st = { ...(this.filterState[id] || {}) };
        if (st.values) st.values = st.values.filter((v) => v !== value);
        delete st.choice;
        delete st.text;
        delete st.checked;
        this.filterState = { ...this.filterState, [id]: st };
        this.loadJobs();
    }

    handleClearFilters() {
        clearTimeout(this._textTimer);
        this.filterState = {};
        this.loadJobs();
    }

    handleResetAll() {
        this.searchInput = '';
        this.filterState = {};
        this.applySearch('');
    }

    handleSortChange(event) {
        this.sortKey = event.target.value;
        this.loadJobs();
    }

    handleLoadMore() {
        this.loadJobs(true);
    }

    handleRetry() {
        this.loadJobs();
    }

    handleReadMore(event) {
        const jobId = event.detail.jobId;
        const params = this.urlParams();
        params.set(JOB_PARAM, jobId);
        this.pushUrl(params);
        this.showDetail(jobId);
    }

    handleBackLink(event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
            return;
        }
        event.preventDefault();
        this.handleBack();
    }

    handleBack() {
        const params = this.urlParams();
        params.delete(JOB_PARAM);
        this.pushUrl(params);
        this.showList();
    }

    async handleApply(event) {
        const jobId = event.detail.jobId;
        const apply = this.cfg.apply;

        if (apply.target === 'url') {
            const url = safeHref(interpolate(apply.urlTemplate, { jobId: encodeURIComponent(jobId) }));
            if (!url) {
                this.logError('apply', new Error('Apply URL is not set or is not an http(s) or site-relative URL.'));
                return;
            }
            if (apply.newTab) window.open(url, '_blank', 'noopener');
            else window.location.assign(url);
            return;
        }

        const pageRef =
            apply.target === 'namedPage' && apply.pageApiName
                ? { type: 'comm__namedPage', attributes: { name: apply.pageApiName }, state: { [apply.paramName || 'recordId']: jobId } }
                : { type: 'standard__recordPage', attributes: { recordId: jobId, objectApiName: JOB_OBJECT, actionName: 'view' } };

        if (apply.newTab) {
            const url = await this[NavigationMixin.GenerateUrl](pageRef);
            window.open(url, '_blank', 'noopener');
        } else {
            this[NavigationMixin.Navigate](pageRef);
        }
    }
}

function unique(list) {
    const seen = new Set();
    return list.filter((v) => {
        if (!v || seen.has(v)) return false;
        seen.add(v);
        return true;
    });
}

/** Only http(s) and site-relative links are allowed for admin-entered URLs. */
function safeHref(url) {
    const v = String(url || '').trim();
    return /^(https?:\/\/|\/(?!\/))/i.test(v) ? v : null;
}
