/**
 * Builds and runs every query the public job board makes against TR1__Job__c.
 *
 * Safety model (the board is served to unauthenticated guest users):
 *  - Every query runs in AccessLevel.USER_MODE, so the guest user's object, field and sharing
 *    access all apply. Nothing here widens what the guest user can see.
 *  - Field API names coming from the browser are never concatenated as-is. Each one is matched
 *    against the TR1__Job__c describe and replaced with the canonical name from the describe.
 *  - Every value coming from the browser is passed as a bind variable (except multi-select picklist
 *    INCLUDES values, which SOQL cannot bind and which are escaped instead).
 *  - Base criteria (account, open status, posted externally) are decided server-side from the
 *    Job_Board_Setting__mdt record, never from the browser. The browser's account Id is only used
 *    when the matching setting record leaves Account_Id__c blank.
 */
public with sharing class JobBoardQuery {

    public class ConfigException extends Exception {}

    public static final String JOB_OBJECT = 'TR1__Job__c';

    static final Pattern PATH_PATTERN = Pattern.compile('^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)?$');
    static final Integer DEFAULT_PAGE_SIZE = 12;
    static final Integer MAX_PAGE_SIZE = 50;
    static final Integer MAX_OFFSET = 2000;
    static final Integer MAX_FILTER_VALUES = 50;
    static final Integer MAX_SEARCH_WORDS = 5;
    static final Integer MAX_FACET_VALUES = 200;
    static final Integer MAX_DAYS = 3650;

    static final Set<Schema.DisplayType> TEXT_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.STRING, Schema.DisplayType.PICKLIST, Schema.DisplayType.EMAIL,
        Schema.DisplayType.PHONE, Schema.DisplayType.URL, Schema.DisplayType.TEXTAREA,
        Schema.DisplayType.COMBOBOX
    };
    static final Set<Schema.DisplayType> NUMBER_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.CURRENCY, Schema.DisplayType.DOUBLE, Schema.DisplayType.INTEGER,
        Schema.DisplayType.PERCENT, Schema.DisplayType.LONG
    };

    static final Set<String> NUMBER_FILTERS = new Set<String>{ 'minNumber', 'maxNumber', 'range' };

    /**
     * Commercial fields that must never reach candidates, whatever the guest user's field access or
     * the board's configuration says. Bill rates and margins are what the client is charged.
     */
    static final Pattern BLOCKED_FIELD_PATTERN = Pattern.compile('(?i).*(bill_rate|billrate|margin|markup|mark_up|fee_percent).*');

    /** Lets tests supply a setting record, since custom metadata cannot be inserted in tests. */
    @TestVisible static Job_Board_Setting__mdt settingOverride;

    static Map<String, Schema.SObjectField> jobFieldMap;
    static Map<String, ResolvedField> resolvedCache = new Map<String, ResolvedField>();

    public List<String> warnings = new List<String>();
    Map<String, Object> binds = new Map<String, Object>();
    List<String> clauses = new List<String>();
    Integer bindIndex = 0;
    Boolean ready = true;

    // ------------------------------------------------------------------ DTOs

    public class FilterInput {
        public String field;
        public String type;          // multi | text | minNumber | maxNumber | range | datePosted | boolean
        public List<String> values;
        public Decimal min;
        public Decimal max;
        public Integer days;
        public String text;
    }

    public class FieldMeta {
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        @AuraEnabled public Integer scale;
        @AuraEnabled public Boolean isHtml;
    }

    public class FacetOption {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
        @AuraEnabled public Integer count;
        FacetOption(String value, String label, Integer count) {
            this.value = value;
            this.label = label;
            this.count = count;
        }
    }

    public class ResolvedField {
        public String path;
        public Schema.DescribeFieldResult describe;
        ResolvedField(String path, Schema.DescribeFieldResult describe) {
            this.path = path;
            this.describe = describe;
        }
    }

    // ------------------------------------------------------------------ setup

    /**
     * @param clientAccountId account Id from the component's config; ignored when the matching
     *                        Job_Board_Setting__mdt record pins an account.
     */
    public JobBoardQuery(String clientAccountId) {
        applyBaseCriteria(clientAccountId);
    }

    /** False when the board has no account to show jobs for; callers return an empty result. */
    public Boolean isReady() {
        return ready;
    }

    @TestVisible
    static Job_Board_Setting__mdt loadSetting() {
        if (settingOverride != null) {
            return settingOverride;
        }
        Id networkId = Network.getNetworkId();
        String network15 = networkId == null ? null : String.valueOf(networkId).left(15);
        Job_Board_Setting__mdt fallback;
        for (Job_Board_Setting__mdt s : Job_Board_Setting__mdt.getAll().values()) {
            if (network15 != null && String.isNotBlank(s.Network_Id__c) && s.Network_Id__c.left(15) == network15) {
                return s;
            }
            if (s.DeveloperName == 'Default') {
                fallback = s;
            }
        }
        return fallback;
    }

    void applyBaseCriteria(String clientAccountId) {
        Job_Board_Setting__mdt s = loadSetting();
        String accountField = s == null ? 'TR1__Account__c' : s.Account_Field__c;
        String statusField = s == null ? 'TR1__Status__c' : s.Status_Field__c;
        String statusValues = s == null ? 'Open' : s.Open_Status_Values__c;
        String postedField = s == null ? null : s.Posted_Field__c;
        String pinnedAccount = s == null ? null : s.Account_Id__c;

        if (String.isNotBlank(accountField)) {
            Id accountId = toId(String.isNotBlank(pinnedAccount) ? pinnedAccount : clientAccountId);
            if (accountId == null) {
                ready = false;
                warnings.add('No valid Account Id is configured, so no jobs are shown. Set it in the component settings or on the Job Board Setting record.');
                return;
            }
            clauses.add(requireField(accountField).path + ' = ' + bind(accountId));
        }

        if (String.isNotBlank(statusField) && String.isNotBlank(statusValues)) {
            List<String> values = new List<String>();
            for (String v : statusValues.split(',')) {
                if (String.isNotBlank(v)) {
                    values.add(v.trim());
                }
            }
            clauses.add(requireField(statusField).path + ' IN ' + bind(values));
        }

        if (String.isNotBlank(postedField)) {
            ResolvedField rf = requireField(postedField);
            if (rf.describe.getType() != Schema.DisplayType.BOOLEAN) {
                throw new ConfigException('Job Board Setting: Posted_Field__c "' + postedField + '" must be a checkbox field.');
            }
            clauses.add(rf.path + ' = true');
        }
    }

    // ------------------------------------------------------------------ field resolution

    static Map<String, Schema.SObjectField> getJobFieldMap() {
        if (jobFieldMap == null) {
            jobFieldMap = Schema.describeSObjects(new List<String>{ JOB_OBJECT })[0].fields.getMap();
        }
        return jobFieldMap;
    }

    /**
     * Turns "TR1__City__c" or "RecordType.Name" (one relationship hop) into a canonical, accessible
     * field path, or returns null when the path is malformed, unknown or not visible to the user.
     */
    public static ResolvedField resolve(String rawPath) {
        if (String.isBlank(rawPath)) {
            return null;
        }
        String path = rawPath.trim();
        String key = path.toLowerCase();
        if (resolvedCache.containsKey(key)) {
            return resolvedCache.get(key);
        }
        ResolvedField result;
        if (PATH_PATTERN.matcher(path).matches() && !isBlockedField(path)) {
            if (!path.contains('.')) {
                Schema.SObjectField f = getJobFieldMap().get(path);
                if (f != null) {
                    Schema.DescribeFieldResult d = f.getDescribe();
                    if (d.isAccessible()) {
                        result = new ResolvedField(d.getName(), d);
                    }
                }
            } else {
                List<String> parts = path.split('\\.');
                for (Schema.SObjectField f : getJobFieldMap().values()) {
                    Schema.DescribeFieldResult d = f.getDescribe();
                    if (d.getType() == Schema.DisplayType.REFERENCE
                            && d.getRelationshipName() != null
                            && d.getRelationshipName().equalsIgnoreCase(parts[0])) {
                        if (d.isAccessible() && !d.getReferenceTo().isEmpty()) {
                            Schema.SObjectField target = d.getReferenceTo()[0].getDescribe().fields.getMap().get(parts[1]);
                            if (target != null && target.getDescribe().isAccessible()) {
                                Schema.DescribeFieldResult td = target.getDescribe();
                                result = new ResolvedField(d.getRelationshipName() + '.' + td.getName(), td);
                            }
                        }
                        break;
                    }
                }
            }
        }
        resolvedCache.put(key, result);
        return result;
    }

    public static Boolean isBlockedField(String path) {
        return String.isNotBlank(path) && BLOCKED_FIELD_PATTERN.matcher(path).matches();
    }

    ResolvedField resolveOrWarn(String rawPath) {
        ResolvedField rf = resolve(rawPath);
        if (rf == null && String.isNotBlank(rawPath)) {
            addWarning('Field "' + rawPath + '" does not exist on ' + JOB_OBJECT + ' or is not readable by this user, so it was skipped.');
        }
        return rf;
    }

    ResolvedField requireField(String rawPath) {
        ResolvedField rf = resolve(rawPath);
        if (rf == null) {
            throw new ConfigException('Job Board Setting: field "' + rawPath + '" does not exist on ' + JOB_OBJECT + ' or is not readable by the site guest user.');
        }
        return rf;
    }

    void addWarning(String message) {
        if (!warnings.contains(message)) {
            warnings.add(message);
        }
    }

    /** Resolves a list of paths, dropping (and warning about) bad ones and removing duplicates. */
    public List<String> resolveFields(List<String> rawPaths) {
        List<String> out = new List<String>();
        Set<String> seen = new Set<String>();
        if (rawPaths == null) {
            return out;
        }
        for (String raw : rawPaths) {
            ResolvedField rf = resolveOrWarn(raw);
            if (rf != null && !seen.contains(rf.path.toLowerCase())) {
                seen.add(rf.path.toLowerCase());
                out.add(rf.path);
            }
        }
        return out;
    }

    public Map<String, FieldMeta> describeFields(List<String> paths) {
        Map<String, FieldMeta> out = new Map<String, FieldMeta>();
        for (String p : paths) {
            ResolvedField rf = resolve(p);
            if (rf == null) {
                continue;
            }
            FieldMeta m = new FieldMeta();
            m.label = rf.describe.getLabel();
            m.type = String.valueOf(rf.describe.getType()).toLowerCase();
            m.scale = rf.describe.getScale();
            m.isHtml = rf.describe.isHtmlFormatted();
            out.put(rf.path, m);
        }
        return out;
    }

    // ------------------------------------------------------------------ criteria

    String bind(Object value) {
        String name = 'b' + (bindIndex++);
        binds.put(name, value);
        return ':' + name;
    }

    static String escapeLike(String value) {
        return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
    }

    static Boolean isTextSearchable(ResolvedField rf) {
        return TEXT_TYPES.contains(rf.describe.getType()) && rf.describe.isFilterable();
    }

    /** Every word must match at least one of the search fields. */
    public void addSearch(String term, List<String> searchFields) {
        if (String.isBlank(term)) {
            return;
        }
        List<String> fieldNames = (searchFields == null || searchFields.isEmpty()) ? new List<String>{ 'Name' } : searchFields;
        List<ResolvedField> fields = new List<ResolvedField>();
        for (String f : fieldNames) {
            ResolvedField rf = resolveOrWarn(f);
            if (rf == null) {
                continue;
            }
            if (isTextSearchable(rf)) {
                fields.add(rf);
            } else {
                addWarning('Field "' + f + '" cannot be keyword searched, so it was left out of search.');
            }
        }
        if (fields.isEmpty()) {
            return;
        }
        Integer used = 0;
        for (String word : term.normalizeSpace().left(100).split(' ')) {
            if (String.isBlank(word)) {
                continue;
            }
            if (used++ >= MAX_SEARCH_WORDS) {
                break;
            }
            String b = bind('%' + escapeLike(word) + '%');
            List<String> ors = new List<String>();
            for (ResolvedField rf : fields) {
                ors.add(rf.path + ' LIKE ' + b);
            }
            clauses.add('(' + String.join(ors, ' OR ') + ')');
        }
    }

    public void addFilters(List<FilterInput> filters) {
        if (filters == null) {
            return;
        }
        for (FilterInput f : filters) {
            if (f == null || String.isBlank(f.field) || String.isBlank(f.type)) {
                continue;
            }
            if (NUMBER_FILTERS.contains(f.type)) {
                addNumberFilter(f);
                continue;
            }
            ResolvedField rf = resolveOrWarn(f.field);
            if (rf == null) {
                continue;
            }
            if (!rf.describe.isFilterable()) {
                addWarning('Field "' + f.field + '" cannot be filtered on, so its filter was skipped.');
                continue;
            }
            Schema.DisplayType t = rf.describe.getType();
            switch on f.type {
                when 'multi' {
                    addMulti(rf, f.values);
                }
                when 'text' {
                    if (String.isNotBlank(f.text)) {
                        if (isTextSearchable(rf)) {
                            clauses.add(rf.path + ' LIKE ' + bind('%' + escapeLike(f.text.trim().left(100)) + '%'));
                        } else {
                            addWarning('Field "' + f.field + '" is not a text field, so its text filter was skipped.');
                        }
                    }
                }
                when 'datePosted' {
                    if (f.days != null && f.days > 0) {
                        Integer days = Math.min(f.days, MAX_DAYS);
                        if (t == Schema.DisplayType.DATE) {
                            clauses.add(rf.path + ' >= ' + bind(Date.today().addDays(-days)));
                        } else if (t == Schema.DisplayType.DATETIME) {
                            clauses.add(rf.path + ' >= ' + bind(Datetime.now().addDays(-days)));
                        } else {
                            addWarning('Field "' + f.field + '" is not a date field, so its date filter was skipped.');
                        }
                    }
                }
                when 'boolean' {
                    if (t == Schema.DisplayType.BOOLEAN && f.values != null && !f.values.isEmpty()) {
                        clauses.add(rf.path + ' = ' + bind(Boolean.valueOf(f.values[0])));
                    }
                }
                when else {
                    addWarning('Filter type "' + f.type + '" is not supported.');
                }
            }
        }
    }

    /**
     * Amount filters. "field" may list several comma-separated number fields, which are OR'd, so
     * one filter can cover jobs that only fill in some of them. For example, a pay-rate filter on
     * "TR1__Maximum_Pay_Rate__c,TR1__Minimum_Pay_Rate__c" with min 15 matches a job when either rate
     * is at least 15. That is the same as "this job can pay at least 15".
     */
    void addNumberFilter(FilterInput f) {
        if (f.min == null && f.max == null) {
            return;
        }
        List<String> ors = new List<String>();
        for (String raw : f.field.split(',')) {
            if (String.isBlank(raw)) {
                continue;
            }
            ResolvedField rf = resolveOrWarn(raw.trim());
            if (rf == null) {
                continue;
            }
            if (!NUMBER_TYPES.contains(rf.describe.getType()) || !rf.describe.isFilterable()) {
                addWarning('Field "' + raw.trim() + '" is not a number or currency field, so it was left out of its amount filter.');
                continue;
            }
            List<String> parts = new List<String>();
            if (f.min != null) {
                parts.add(rf.path + ' >= ' + bind(f.min));
            }
            if (f.max != null) {
                parts.add(rf.path + ' <= ' + bind(f.max));
            }
            ors.add('(' + String.join(parts, ' AND ') + ')');
        }
        if (!ors.isEmpty()) {
            clauses.add(ors.size() == 1 ? ors[0] : '(' + String.join(ors, ' OR ') + ')');
        }
    }

    void addMulti(ResolvedField rf, List<String> rawValues) {
        if (rawValues == null || rawValues.isEmpty()) {
            return;
        }
        List<String> values = new List<String>();
        for (String v : rawValues) {
            if (v != null && values.size() < MAX_FILTER_VALUES) {
                values.add(v.left(255));
            }
        }
        if (values.isEmpty()) {
            return;
        }
        Schema.DisplayType t = rf.describe.getType();
        if (t == Schema.DisplayType.MULTIPICKLIST) {
            List<String> quoted = new List<String>();
            for (String v : values) {
                quoted.add('\'' + String.escapeSingleQuotes(v) + '\'');
            }
            clauses.add(rf.path + ' INCLUDES (' + String.join(quoted, ',') + ')');
        } else if (t == Schema.DisplayType.BOOLEAN) {
            Set<String> distinct = new Set<String>(values);
            if (distinct.size() == 1) {
                clauses.add(rf.path + ' = ' + bind(Boolean.valueOf(values[0])));
            }
        } else if (NUMBER_TYPES.contains(t)) {
            List<Decimal> numbers = new List<Decimal>();
            for (String v : values) {
                try {
                    numbers.add(Decimal.valueOf(v));
                } catch (Exception e) {
                    // ignore values that are not numbers
                }
            }
            if (!numbers.isEmpty()) {
                clauses.add(rf.path + ' IN ' + bind(numbers));
            }
        } else {
            clauses.add(rf.path + ' IN ' + bind(values));
        }
    }

    public void addIdCriteria(Id recordId) {
        clauses.add('Id = ' + bind(recordId));
    }

    String whereSql() {
        return clauses.isEmpty() ? '' : ' WHERE ' + String.join(clauses, ' AND ');
    }

    // ------------------------------------------------------------------ execution

    public Integer count() {
        return Database.countQueryWithBinds('SELECT COUNT() FROM ' + JOB_OBJECT + whereSql(), binds, AccessLevel.USER_MODE);
    }

    public List<Map<String, Object>> fetch(List<String> fields, String sortField, String sortDirection, Integer pageSize, Integer offset) {
        Integer size = (pageSize == null || pageSize < 1) ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
        Integer skip = (offset == null || offset < 0) ? 0 : Math.min(offset, MAX_OFFSET);
        String soql = 'SELECT ' + selectList(fields) + ' FROM ' + JOB_OBJECT + whereSql()
            + orderBy(sortField, sortDirection) + ' LIMIT ' + size + ' OFFSET ' + skip;
        return toRows(Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE), fields);
    }

    public Map<String, Object> fetchOne(List<String> fields) {
        String soql = 'SELECT ' + selectList(fields) + ' FROM ' + JOB_OBJECT + whereSql() + ' LIMIT 1';
        List<Map<String, Object>> rows = toRows(Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE), fields);
        return rows.isEmpty() ? null : rows[0];
    }

    static String selectList(List<String> fields) {
        List<String> cols = new List<String>{ 'Id' };
        for (String f : fields) {
            if (!f.equalsIgnoreCase('Id')) {
                cols.add(f);
            }
        }
        return String.join(cols, ', ');
    }

    String orderBy(String sortField, String sortDirection) {
        String dir = 'ASC'.equalsIgnoreCase(sortDirection) ? 'ASC' : 'DESC';
        ResolvedField rf = String.isBlank(sortField) ? null : resolveOrWarn(sortField);
        if (rf != null && rf.describe.isSortable()) {
            return ' ORDER BY ' + rf.path + ' ' + dir + ' NULLS LAST, Id ASC';
        }
        return ' ORDER BY CreatedDate DESC, Id ASC';
    }

    static List<Map<String, Object>> toRows(List<SObject> records, List<String> fields) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SObject rec : records) {
            Map<String, Object> row = new Map<String, Object>{ 'Id' => rec.Id };
            for (String f : fields) {
                row.put(f, readValue(rec, f));
            }
            rows.add(row);
        }
        return rows;
    }

    static Object readValue(SObject rec, String path) {
        if (!path.contains('.')) {
            return rec.get(path);
        }
        List<String> parts = path.split('\\.');
        SObject parent = rec.getSObject(parts[0]);
        return parent == null ? null : parent.get(parts[1]);
    }

    /**
     * Option lists with job counts for "multi" filters. Counts use the base criteria only (account,
     * status, posted), so they stay stable while the visitor narrows their search.
     */
    public Map<String, List<FacetOption>> facets(List<FilterInput> filters) {
        Map<String, List<FacetOption>> out = new Map<String, List<FacetOption>>();
        if (filters == null) {
            return out;
        }
        for (FilterInput f : filters) {
            if (f == null || f.type != 'multi' || String.isBlank(f.field) || out.containsKey(f.field)) {
                continue;
            }
            ResolvedField rf = resolveOrWarn(f.field);
            if (rf == null) {
                continue;
            }
            Schema.DisplayType t = rf.describe.getType();
            Boolean isPicklist = t == Schema.DisplayType.PICKLIST || t == Schema.DisplayType.MULTIPICKLIST;

            Map<String, Integer> counts = new Map<String, Integer>();
            List<String> order = new List<String>();
            if (rf.describe.isGroupable()) {
                String soql = 'SELECT ' + rf.path + ' v, COUNT(Id) c FROM ' + JOB_OBJECT + whereSql()
                    + ' GROUP BY ' + rf.path + ' ORDER BY ' + rf.path + ' LIMIT ' + MAX_FACET_VALUES;
                for (SObject so : Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE)) {
                    AggregateResult ar = (AggregateResult) so;
                    Object v = ar.get('v');
                    if (v == null || String.isBlank(String.valueOf(v))) {
                        continue;
                    }
                    String key = String.valueOf(v);
                    counts.put(key, (Integer) ar.get('c'));
                    order.add(key);
                }
            } else if (!isPicklist) {
                addWarning('Field "' + f.field + '" cannot be grouped, so it cannot be used as a checkbox filter. Try the "text" filter type.');
                continue;
            }

            List<FacetOption> options = new List<FacetOption>();
            if (isPicklist) {
                Boolean haveCounts = rf.describe.isGroupable();
                Set<String> listed = new Set<String>();
                for (Schema.PicklistEntry pe : rf.describe.getPicklistValues()) {
                    if (!pe.isActive()) {
                        continue;
                    }
                    if (haveCounts && !counts.containsKey(pe.getValue())) {
                        continue;
                    }
                    options.add(new FacetOption(pe.getValue(), pe.getLabel(), haveCounts ? counts.get(pe.getValue()) : null));
                    listed.add(pe.getValue());
                }
                for (String v : order) {
                    if (!listed.contains(v)) {
                        options.add(new FacetOption(v, v, counts.get(v)));
                    }
                }
            } else {
                for (String v : order) {
                    String label = t == Schema.DisplayType.BOOLEAN ? (v == 'true' ? 'Yes' : 'No') : v;
                    options.add(new FacetOption(v, label, counts.get(v)));
                }
            }
            out.put(f.field, options);
        }
        return out;
    }

    // ------------------------------------------------------------------ helpers

    static Id toId(String value) {
        if (String.isBlank(value)) {
            return null;
        }
        try {
            return Id.valueOf(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    /** Returns the Id only when it is a valid TR1__Job__c Id. */
    public static Id toJobId(String value) {
        Id candidate = toId(value);
        if (candidate == null) {
            return null;
        }
        return String.valueOf(candidate.getSObjectType()).equalsIgnoreCase(JOB_OBJECT) ? candidate : null;
    }
}
