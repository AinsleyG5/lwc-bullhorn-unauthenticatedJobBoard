/**
 * Apex API for the public job board (c/jobBoard) and its Experience Builder property editor.
 * See JobBoardQuery for how requests are validated and run.
 */
public with sharing class JobBoardController {

    public class SearchRequest {
        public String accountId;
        public String searchTerm;
        public List<String> searchFields;
        public List<String> fields;
        public List<JobBoardQuery.FilterInput> filters;
        public String sortField;
        public String sortDirection;
        public Integer pageSize;
        public Integer offset;
    }

    public class SearchResult {
        @AuraEnabled public Integer total = 0;
        @AuraEnabled public List<Map<String, Object>> rows = new List<Map<String, Object>>();
        @AuraEnabled public Map<String, JobBoardQuery.FieldMeta> fieldMeta = new Map<String, JobBoardQuery.FieldMeta>();
        @AuraEnabled public List<String> warnings = new List<String>();
    }

    public class FacetRequest {
        public String accountId;
        public List<JobBoardQuery.FilterInput> filters;
    }

    public class FacetResult {
        @AuraEnabled public Map<String, List<JobBoardQuery.FacetOption>> facets = new Map<String, List<JobBoardQuery.FacetOption>>();
        @AuraEnabled public List<String> warnings = new List<String>();
    }

    public class DetailRequest {
        public String accountId;
        public String jobId;
        public List<String> fields;
    }

    public class DetailResult {
        @AuraEnabled public Map<String, Object> row;
        @AuraEnabled public Map<String, JobBoardQuery.FieldMeta> fieldMeta = new Map<String, JobBoardQuery.FieldMeta>();
        @AuraEnabled public List<String> warnings = new List<String>();
    }

    public class FieldOption implements Comparable {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        @AuraEnabled public Boolean filterable;
        @AuraEnabled public Boolean groupable;
        @AuraEnabled public Boolean sortable;
        @AuraEnabled public Boolean isHtml;

        public Integer compareTo(Object other) {
            return label.toLowerCase().compareTo(((FieldOption) other).label.toLowerCase());
        }
    }

    /** One page of jobs matching the visitor's search, filters and sort. */
    @AuraEnabled(cacheable=true)
    public static SearchResult searchJobs(String requestJson) {
        try {
            SearchRequest req = (SearchRequest) JSON.deserialize(requestJson, SearchRequest.class);
            JobBoardQuery q = new JobBoardQuery(req.accountId);
            SearchResult res = new SearchResult();
            if (q.isReady()) {
                q.addSearch(req.searchTerm, req.searchFields);
                q.addFilters(req.filters);
                List<String> fields = q.resolveFields(req.fields);
                res.total = q.count();
                res.rows = q.fetch(fields, req.sortField, req.sortDirection, req.pageSize, req.offset);
                res.fieldMeta = q.describeFields(fields);
            }
            res.warnings = q.warnings;
            return res;
        } catch (Exception e) {
            throw toAuraException(e);
        }
    }

    /** Option lists (with job counts) for the checkbox filters. */
    @AuraEnabled(cacheable=true)
    public static FacetResult getFacets(String requestJson) {
        try {
            FacetRequest req = (FacetRequest) JSON.deserialize(requestJson, FacetRequest.class);
            JobBoardQuery q = new JobBoardQuery(req.accountId);
            FacetResult res = new FacetResult();
            if (q.isReady()) {
                res.facets = q.facets(req.filters);
            }
            res.warnings = q.warnings;
            return res;
        } catch (Exception e) {
            throw toAuraException(e);
        }
    }

    /**
     * A single job for the detail view. The same base criteria apply, so a visitor cannot open a job
     * from another account, or one that is closed or not posted, by editing the URL.
     */
    @AuraEnabled(cacheable=true)
    public static DetailResult getJobDetail(String requestJson) {
        try {
            DetailRequest req = (DetailRequest) JSON.deserialize(requestJson, DetailRequest.class);
            DetailResult res = new DetailResult();
            Id jobId = JobBoardQuery.toJobId(req.jobId);
            JobBoardQuery q = new JobBoardQuery(req.accountId);
            if (jobId != null && q.isReady()) {
                q.addIdCriteria(jobId);
                List<String> fields = q.resolveFields(req.fields);
                res.row = q.fetchOne(fields);
                res.fieldMeta = q.describeFields(fields);
            }
            res.warnings = q.warnings;
            return res;
        } catch (Exception e) {
            throw toAuraException(e);
        }
    }

    /**
     * Field picker options for the property editor. Lookups are offered as "<Relationship>.Name" so
     * the board shows a name rather than a record Id.
     */
    @AuraEnabled(cacheable=true)
    public static List<FieldOption> getJobFieldOptions() {
        try {
            List<FieldOption> options = new List<FieldOption>();
            Map<String, Schema.SObjectField> fieldMap = Schema.describeSObjects(new List<String>{ JobBoardQuery.JOB_OBJECT })[0].fields.getMap();
            for (Schema.SObjectField f : fieldMap.values()) {
                Schema.DescribeFieldResult d = f.getDescribe();
                if (!d.isAccessible() || JobBoardQuery.isBlockedField(d.getName())) {
                    continue;
                }
                if (d.getType() == Schema.DisplayType.REFERENCE) {
                    if (d.getRelationshipName() == null || d.getReferenceTo().size() != 1) {
                        continue;
                    }
                    Schema.SObjectField nameField = d.getReferenceTo()[0].getDescribe().fields.getMap().get('Name');
                    if (nameField == null || !nameField.getDescribe().isAccessible()) {
                        continue;
                    }
                    Schema.DescribeFieldResult nd = nameField.getDescribe();
                    options.add(option(d.getRelationshipName() + '.Name', d.getLabel().removeEndIgnoreCase(' ID') + ' › Name', nd));
                } else {
                    options.add(option(d.getName(), d.getLabel(), d));
                }
            }
            options.sort();
            return options;
        } catch (Exception e) {
            throw toAuraException(e);
        }
    }

    static FieldOption option(String value, String label, Schema.DescribeFieldResult d) {
        FieldOption o = new FieldOption();
        o.value = value;
        o.label = label;
        o.type = String.valueOf(d.getType()).toLowerCase();
        o.filterable = d.isFilterable();
        o.groupable = d.isGroupable();
        o.sortable = d.isSortable();
        o.isHtml = d.isHtmlFormatted();
        return o;
    }

    /** Guests get a generic message; configuration errors and signed-in admins get the detail. */
    static AuraHandledException toAuraException(Exception e) {
        System.debug(LoggingLevel.ERROR, 'JobBoardController: ' + e.getMessage() + '\n' + e.getStackTraceString());
        Boolean showDetail = e instanceof JobBoardQuery.ConfigException || !Auth.CommunitiesUtil.isGuestUser();
        String message = showDetail ? e.getMessage() : 'Jobs could not be loaded right now. Please try again shortly.';
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
