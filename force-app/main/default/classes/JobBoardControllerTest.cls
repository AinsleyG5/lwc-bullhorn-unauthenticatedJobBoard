/**
 * Tests for JobBoardController / JobBoardQuery.
 * TR1__Job__c is created dynamically so this class compiles cleanly; it needs the Bullhorn
 * Recruitment Cloud package (TR1) installed in the org, as the board itself does.
 */
@IsTest
private class JobBoardControllerTest {

    static Id accountId;

    static void setup(String postedField) {
        Job_Board_Setting__mdt setting = new Job_Board_Setting__mdt(
            DeveloperName = 'Test',
            Account_Field__c = 'TR1__Account__c',
            Status_Field__c = 'TR1__Status__c',
            Open_Status_Values__c = 'Open',
            Posted_Field__c = postedField
        );
        JobBoardQuery.settingOverride = setting;

        Account acc = new Account(Name = 'Job Board Test Co');
        insert acc;
        accountId = acc.Id;

        List<SObject> jobs = new List<SObject>();
        jobs.add(newJob('Warehouse Operative - Hatfield', 'Open', 'Hatfield'));
        jobs.add(newJob('Mail Sorter - Friends and Family', 'Open', 'London'));
        jobs.add(newJob('Closed Role', 'Closed', 'Hatfield'));
        insert jobs;
    }

    static SObject newJob(String name, String status, String city) {
        SObject job = Schema.getGlobalDescribe().get(JobBoardQuery.JOB_OBJECT).newSObject();
        job.put('Name', name);
        job.put('TR1__Account__c', accountId);
        job.put('TR1__Status__c', status);
        job.put('TR1__City__c', city);
        return job;
    }

    static String searchJson(String term, List<Map<String, Object>> filters) {
        return JSON.serialize(new Map<String, Object>{
            'accountId' => accountId,
            'searchTerm' => term,
            'searchFields' => new List<String>{ 'Name' },
            'fields' => new List<String>{ 'Name', 'TR1__City__c', 'RecordType.Name', 'Not_A_Field__c' },
            'filters' => filters,
            'sortField' => 'Name',
            'sortDirection' => 'ASC',
            'pageSize' => 12,
            'offset' => 0
        });
    }

    @IsTest
    static void searchReturnsOnlyOpenJobsForTheAccount() {
        setup(null);
        Test.startTest();
        JobBoardController.SearchResult res = JobBoardController.searchJobs(searchJson(null, new List<Map<String, Object>>()));
        Test.stopTest();

        Assert.areEqual(2, res.total, 'Closed jobs must be excluded');
        Assert.areEqual(2, res.rows.size());
        Assert.areEqual('Mail Sorter - Friends and Family', res.rows[0].get('Name'), 'Sorted by Name ASC');
        Assert.isTrue(res.fieldMeta.containsKey('TR1__City__c'));
        Assert.isFalse(res.warnings.isEmpty(), 'Unknown field should produce a warning');
    }

    @IsTest
    static void keywordSearchMatchesEveryWord() {
        setup(null);
        JobBoardController.SearchResult res = JobBoardController.searchJobs(searchJson('warehouse hatfield', null));
        Assert.areEqual(1, res.total);
        res = JobBoardController.searchJobs(searchJson('warehouse london', null));
        Assert.areEqual(0, res.total);
    }

    @IsTest
    static void filtersNarrowResults() {
        setup(null);
        List<Map<String, Object>> filters = new List<Map<String, Object>>{
            new Map<String, Object>{ 'field' => 'TR1__City__c', 'type' => 'multi', 'values' => new List<String>{ 'London' } },
            new Map<String, Object>{ 'field' => 'Name', 'type' => 'text', 'text' => 'Sorter' },
            new Map<String, Object>{ 'field' => 'CreatedDate', 'type' => 'datePosted', 'days' => 7 },
            new Map<String, Object>{ 'field' => 'Name', 'type' => 'minNumber', 'min' => 10 },
            new Map<String, Object>{ 'field' => 'Name', 'type' => 'unknown' }
        };
        JobBoardController.SearchResult res = JobBoardController.searchJobs(searchJson(null, filters));
        Assert.areEqual(1, res.total);
        Assert.isTrue(res.warnings.size() >= 2, 'Mismatched filter types should warn, not fail');
    }

    @IsTest
    static void facetsCountBaseCriteriaOnly() {
        setup(null);
        String req = JSON.serialize(new Map<String, Object>{
            'accountId' => accountId,
            'filters' => new List<Map<String, Object>>{
                new Map<String, Object>{ 'field' => 'TR1__City__c', 'type' => 'multi' }
            }
        });
        JobBoardController.FacetResult res = JobBoardController.getFacets(req);
        List<JobBoardQuery.FacetOption> cities = res.facets.get('TR1__City__c');
        Assert.areEqual(2, cities.size(), 'Hatfield and London');
        for (JobBoardQuery.FacetOption o : cities) {
            Assert.areEqual(1, o.count, 'The closed Hatfield job is not counted');
        }
    }

    @IsTest
    static void detailRespectsBaseCriteria() {
        setup(null);
        SObject closed = Database.query('SELECT Id FROM ' + JobBoardQuery.JOB_OBJECT + ' WHERE Name = \'Closed Role\' LIMIT 1');
        SObject open = Database.query('SELECT Id FROM ' + JobBoardQuery.JOB_OBJECT + ' WHERE Name = \'Mail Sorter - Friends and Family\' LIMIT 1');

        JobBoardController.DetailResult res = JobBoardController.getJobDetail(detailJson(open.Id));
        Assert.isNotNull(res.row);
        Assert.areEqual('Mail Sorter - Friends and Family', res.row.get('Name'));

        res = JobBoardController.getJobDetail(detailJson(closed.Id));
        Assert.isNull(res.row, 'Closed jobs cannot be opened by Id');

        res = JobBoardController.getJobDetail(detailJson(accountId));
        Assert.isNull(res.row, 'Non-job Ids are rejected');
    }

    static String detailJson(Id jobId) {
        return JSON.serialize(new Map<String, Object>{
            'accountId' => accountId,
            'jobId' => jobId,
            'fields' => new List<String>{ 'Name', 'TR1__City__c' }
        });
    }

    @IsTest
    static void missingAccountReturnsEmptyWithWarning() {
        setup(null);
        accountId = null;
        JobBoardController.SearchResult res = JobBoardController.searchJobs(searchJson(null, null));
        Assert.areEqual(0, res.total);
        Assert.isFalse(res.warnings.isEmpty());
    }

    @IsTest
    static void badBaseCriteriaFieldIsAConfigError() {
        setup('Not_A_Checkbox__c');
        try {
            JobBoardController.searchJobs(searchJson(null, null));
            Assert.fail('Expected a configuration error');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('Not_A_Checkbox__c'));
        }
    }

    @IsTest
    static void fieldOptionsIncludeLookupNames() {
        List<JobBoardController.FieldOption> options = JobBoardController.getJobFieldOptions();
        Set<String> values = new Set<String>();
        for (JobBoardController.FieldOption o : options) {
            values.add(o.value);
        }
        Assert.isTrue(values.contains('Name'));
        Assert.isFalse(values.contains('OwnerId'), 'Lookups are offered as Relationship.Name');
    }

    @IsTest
    static void defaultSettingIsLoadedWhenNoOverride() {
        JobBoardQuery.settingOverride = null;
        // Either the shipped Default record or null (falls back to built-in defaults); must not throw.
        JobBoardQuery.loadSetting();
        Assert.isTrue(true);
    }
}
