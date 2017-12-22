import * as Csl from 'citeproc';
import { toJS } from 'mobx';
import * as nanoid from 'nanoid';

import Store from 'stores/data';
import LocaleStore from 'stores/data/locale-store';
import StyleStore from 'stores/data/style-store';
import { formatBibliography } from 'utils/formatters';

export class Processor {
    /**
     * CSL.Engine instance created by this class
     */
    citeproc: Citeproc.Processor;

    private locales: LocaleStore;
    private store: Store;
    private styles: StyleStore;

    /**
     * @param store The main store for the reference list
     */
    constructor(store: Store) {
        this.store = store;
        this.styles = new StyleStore();
        this.locales = new LocaleStore();
    }

    /**
     * Spawns a new temporary CSL.Engine and creates a static, untracked bibliography
     *
     * @param data - Array of CSL.Data
     */
    async createStaticBibliography(data: CSL.Data[]): Promise<ABT.Bibliography | boolean> {
        const style =
            this.store.citationStyle.get() === 'abt-user-defined'
                ? top.ABT.custom_csl.CSL
                : await this.styles.fetch(this.store.citationStyle.get());
        const sys = { ...this.citeproc.sys };
        const citeproc: Citeproc.Processor = new Csl.Engine(sys, style);
        citeproc.updateItems(toJS(data.map(d => d.id)));
        const bib = citeproc.makeBibliography();
        return typeof bib === 'boolean'
            ? bib
            : formatBibliography(bib, this.store.bibOptions.links, this.store.citations.CSL);
    }

    /**
     * Instantiates a new CSL.Engine (either when initially constructed or when
     * the user changes his/her selected citation style)
     *
     * The middle (index, or 'b') value in the returned array is ignored
     * and the literal index is used because of an issue with Citeproc-js.
     * This small change seems to fix a breaking issue
     *
     * @param styleID - CSL style filename
     * @return Promise that resolves to either an object containing the style XML
     * and the `sys` object, or an Error depending on the responses from the network
     */
    async init(): Promise<Citeproc.CitationResult[]> {
        const style =
            this.store.citationStyle.get() === 'abt-user-defined'
                ? top.ABT.custom_csl.CSL
                : await this.styles.fetch(this.store.citationStyle.get());
        const sys = await this.generateSys(this.store.locale);
        this.citeproc = new Csl.Engine(sys, style);
        return <Array<[number, string, string]>>this.citeproc
            .rebuildProcessorState(this.store.citations.citationByIndex)
            .map(([a, , c], i) => [i, c, a]);
    }

    /**
     * Wrapper function for citeproc.makeBibliography that ensures the citation store
     * is also kept in sync with the processor store as well as formats the
     * bibliography output
     *
     * This function returns `false` if the user is using a citation style that does
     * not include a bibliography (e.g. `Mercatus Center`)
     */
    makeBibliography(): ABT.Bibliography | boolean {
        const bib = this.citeproc.makeBibliography();
        this.store.citations.init(this.citeproc.registry.citationreg.citationByIndex);
        return typeof bib === 'boolean'
            ? bib
            : formatBibliography(bib, this.store.bibOptions.links, this.store.citations.CSL);
    }

    /**
     * Transforms the CSL.Data[] into a Citeproc.Citation.
     *
     * @param csl CSL.Data[].
     */
    prepareInlineCitationData(csl: CSL.Data[]): Citeproc.Citation {
        // prettier-ignore
        const citationItems = Array.from(
            new Set(
                csl.map(item => item.id)
            )
        ).map(id => ({ id }));
        return {
            citationID: nanoid(),
            citationItems,
        };
    }

    /**
     * Wrapper function around Citeproc.processCitationCluster that ensures the store
     * is kept in sync with the processor
     *
     * @param  citation - Single Citeproc.Citation
     * @param  before   - Citations before the current citation
     * @param  after    - Citations after the current citation
     */
    processCitationCluster(
        citation: Citeproc.Citation,
        before: Citeproc.Locator,
        after: Citeproc.Locator,
    ): Citeproc.CitationResult[] {
        const [, citations] = this.citeproc.processCitationCluster(citation, before, after);
        this.store.citations.init(this.citeproc.registry.citationreg.citationByIndex);
        return citations;
    }

    /**
     * Called exclusively from the `init` method to generate the `sys` object
     * required by the CSL.Engine
     *
     * @param locale The locale string from this.locales (handled in constructor)
     * @return Promise that resolves to a Citeproc.SystemObj
     */
    private async generateSys(locale: string): Promise<Citeproc.SystemObj> {
        // "primes the pump" since citeproc currently runs synchronously
        await this.locales.fetch(locale);
        return {
            retrieveItem: (id: string): CSL.Data => toJS(this.store.citations.CSL.get(id)!),
            retrieveLocale: this.locales.retrieve,
        };
    }
}
