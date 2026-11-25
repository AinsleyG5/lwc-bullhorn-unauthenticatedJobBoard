import { LightningElement, api } from 'lwc';

/**
 * One job in the results grid. Purely presentational: the parent prepares the display values and
 * handles navigation. "Read more" is a real link (?job=<Id>) so it can be opened in a new tab,
 * but a plain click is handled in-page.
 */
export default class JobBoardCard extends LightningElement {
    /** { id, title, href, fields: [{ key, label, value }], hasFields, snippet } */
    @api job;
    @api labels = {};

    handleReadMore(event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
            return; // let the browser open the link in a new tab or window
        }
        event.preventDefault();
        this.dispatchEvent(new CustomEvent('readmore', { detail: { jobId: this.job.id } }));
    }

    handleApply() {
        this.dispatchEvent(new CustomEvent('apply', { detail: { jobId: this.job.id } }));
    }
}
