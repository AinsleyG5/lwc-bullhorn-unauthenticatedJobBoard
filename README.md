# Bullhorn Recruitment Cloud: Public Job Board (LWC)

An unauthenticated job board for Salesforce Experience Cloud sites. It lists open `TR1__Job__c` records (Bullhorn Recruitment Cloud managed package) for **one account**, with:

- a hero search bar (keyword search, `Name` by default)
- a filter panel on the left that can be shown or hidden, and that becomes a slide-out drawer on mobile
- job cards and a "Read more" detail view, both showing fields the site admin picks
- an **Apply** button that sends the visitor to the existing **Job Apply** component

The component is reusable across sites and customers. Branding, fields, filters, labels and the apply target are all set in Experience Builder through a custom property editor. SLDS is not used on the public side; styling comes from a small token-based theme.

## Components

| Component | Role |
|---|---|
| `jobBoard` | The exposed component you drop on a page. Owns state, calls Apex, handles URL state (`?job=<Id>`, `?q=`). |
| `jobBoardTheme` | **Styling child component.** Wraps the board in a slot and writes the brand as CSS custom properties (`--jb-primary`, `--jb-accent`, …). Custom properties inherit through shadow DOM, so every nested component picks them up without being passed the theme. |
| `jobBoardFilters` | Filter panel: checkbox lists with counts, single-choice lists (salary bands, date posted), text and yes/no filters. |
| `jobBoardCard` | One job card (accent header, label/value rows, summary, Apply / Read more). |
| `jobBoardDetail` | Detail view: summary side panel and rich-text body sections. |
| `jobBoardConfig` | Shared defaults (`DEFAULT_CONFIG`), config merge (same idea as `mergeNewDefaults`), formatting helpers. |
| `jobBoardStyles` | Shared CSS module (buttons, focus rings, utilities). |
| `jobBoardPropertyEditor` | Experience Builder property editor (same pattern as the Job Apply editor: one JSON property). |
| `jobBoardFieldListEditor` | Ordered list editor used for filters, card fields, and detail fields/sections. |

Apex: `JobBoardController` (API), `JobBoardQuery` (query builder), `JobBoardControllerTest`.

## Deploy

```bash
sf project deploy start --manifest manifest/package.xml --target-org <alias>
sf apex run test --class-names JobBoardControllerTest --target-org <alias> --result-format human
```

The tests insert `TR1__Job__c` records, so they only pass in an org with the TR1 package installed. If package validation rules block a bare insert, add the extra required fields in `JobBoardControllerTest.newJob`.

## Site setup (guest access)

1. **Permission set**: assign `Job_Board_Guest_Access` to the site's guest user. It grants Apex access and read access on `TR1__Job__c`.
2. **Field-level security**: give the guest user read access to every `TR1__Job__c` field the board uses (title, filters, card, detail and the base-criteria fields below). Fields the guest can't read are skipped, and Experience Builder shows a setup note about it.
3. **Sharing**: create a **guest user sharing rule** on `TR1__Job__c` (criteria-based, read-only), e.g. `Account = <customer>` AND `Status = Open` AND `Post Externally = true`. Guest users see nothing without one.
4. **Page**: drag **Job Board (Public)** onto a page, click *Edit Job Board Settings*, and set the **Account Id**.
5. **Apply**: by default Apply goes to the `TR1__Job__c` record page. Put the **Job Apply** component there, with `recordId` set to `{!recordId}`. You can also choose a named site page with the job Id as a URL parameter, or a custom URL (`{jobId}` placeholder).
6. **Images**: if hero or logo images come from another host, add that host to the site's trusted sites (CSP).

## Security model

- Every query runs in `AccessLevel.USER_MODE`, so guest object, field and sharing access always apply.
- Field names sent from the browser are only used after they've been matched against the `TR1__Job__c` describe. Every value is a bind variable.
- **Base criteria are decided server-side** by the `Job_Board_Setting__mdt` custom metadata record. The record whose `Network_Id__c` matches the current site wins; otherwise the `Default` record is used:
  - `Account_Field__c`: lookup to Account (default `TR1__Account__c`)
  - `Account_Id__c`: optional. Pins the account so the Experience Builder value is ignored. **Recommended for production**, because the browser-supplied account Id can otherwise be swapped by a curious visitor (sharing rules still limit what they can see).
  - `Status_Field__c` / `Open_Status_Values__c`: default `TR1__Status__c` in `Open`
  - `Posted_Field__c`: optional checkbox that must be true (default `TR1__Post_Externally__c`)
- The detail view uses the same criteria, so a closed or other-account job can't be opened by editing `?job=`.
- Guests get a generic error message. Configuration errors and setup notes only show in Experience Builder, or when *debug* is ticked.

## Configuration reference

Everything lives in one JSON design attribute. Anything missing falls back to `DEFAULT_CONFIG` in `jobBoardConfig.js`. The *Advanced (JSON)* section of the editor lets you paste or copy a whole configuration between sites.

**Filter types**

| type | Use for | Field type |
|---|---|---|
| `multi` | Checkbox list with job counts (function, location, job type) | picklist, text, lookup `.Name` |
| `text` | "Contains" box, for messy free text such as External Job Title | text |
| `minNumber` / `maxNumber` | Salary bands. `options` is a comma-separated list of amounts | number / currency |
| `datePosted` | "Past N days". `options` is a comma-separated list of days | date / datetime |
| `boolean` | Single yes/no tick box (e.g. Remote) | checkbox |

Relationship fields one level deep are supported anywhere a field is accepted, e.g. `RecordType.Name`, `TR1__Account__r.BillingCity`.

## Field names to verify in the demo org

The defaults use TR1 field names that are best guesses and need checking in the org. Anything that doesn't exist is skipped with a setup note in Experience Builder, except the base-criteria fields, which raise a clear configuration error.

| Default | Used for |
|---|---|
| `TR1__Account__c` | account lookup (base criteria) |
| `TR1__Status__c` = `Open` | open jobs (base criteria) |
| `TR1__Post_Externally__c` | posted externally (base criteria) |
| `TR1__City__c`, `TR1__Function__c`, `RecordType.Name` | filters, card, detail |
| `TR1__External_Job_Title__c` | "Job title contains" filter |
| `TR1__Open_Date__c` | newest-first sort, date posted filter |
| `TR1__Job_Number__c` | detail panel |
| `TR1__Client_Job_Description__c`, `TR1__Responsibilities__c`, `TR1__Experience_Requirements__c` | card summary, detail sections |
| *(salary: TBC)* | salary filter, card, detail, salary sort |

## Ideas for more filters

Worth adding once the matching fields are confirmed: region/county (`TR1__State_Area__c`, `TR1__Regional_Area__c`), hours (full time / part time), shift pattern (days / nights / weekends), remote / hybrid / on-site, industry or division, experience level, contract length, start date ("starting within 2 weeks"), and distance from a postcode (needs geolocation fields plus a geocoding step, so it's a later phase).
