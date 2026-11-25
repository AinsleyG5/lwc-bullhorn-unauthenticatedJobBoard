import { LightningElement, api } from 'lwc';

/**
 * Expanded view of one job ("Read more"). Rich text sections go through
 * lightning-formatted-rich-text, which sanitises the HTML stored on the job.
 */
export default class JobBoardDetail extends LightningElement {
    /** { id, title, sidebar: [{ key, label, value }], hasSidebar, sections: [{ key, heading, isHtml, html, text }] } */
    @api job;
    @api labels = {};
    @api listHref = '?';

    get layoutClass() {
        return this.job?.hasSidebar ? 'detail__layout' : 'detail__layout detail__layout--single';
    }

    /** Moves focus to the title so keyboard and screen reader users land on the new content. */
    @api
    focusTitle() {
        const title = this.template.querySelector('.detail__title');
        if (title) {
            title.focus({ preventScroll: true });
        }
    }

    handleApply() {
        this.dispatchEvent(new CustomEvent('apply', { detail: { jobId: this.job.id } }));
    }

    handleBack(event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
            return;
        }
        event.preventDefault();
        this.dispatchEvent(new CustomEvent('back'));
    }
}
