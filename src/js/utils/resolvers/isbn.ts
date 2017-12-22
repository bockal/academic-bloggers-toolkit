import { parseName } from 'astrocite-core';

import { AutociteResponse } from 'utils/resolvers';

interface Item {
    volumeInfo: {
        authors: string[];
        pageCount: number;
        /** "2016-07-31" */
        publishedDate: string;
        publisher: string;
        title: string;
    };
}

interface APIResponse {
    items: Item[];
    kind: string;
    totalItems: number;
}

export async function getFromISBN(
    ISBN: string,
    kind: 'book' | 'chapter',
): Promise<AutociteResponse> {
    const req = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${ISBN.replace('-', '')}`,
    );
    if (!req.ok) {
        throw new Error(
            `${top.ABT.i18n.errors.prefix}: getFromISBN => ${top.ABT.i18n.errors.statusError}`,
        );
    }
    const res: APIResponse = await req.json();

    if (res.totalItems === 0) {
        throw new Error(`${top.ABT.i18n.errors.noResults}`);
    }

    const { authors, pageCount, publishedDate, publisher, title } = res.items[0].volumeInfo;
    const author: ABT.Contributor[] = authors.map(person => {
        const fields = parseName(person);
        return {
            ...fields,
            type: <CSL.PersonFieldKey>'author',
            given: fields.given || '',
            family: fields.family || '',
        };
    });
    const titleKey = kind === 'chapter' ? 'container-title' : 'title';

    return {
        fields: {
            issued: publishedDate.replace(/-/g, '/'),
            'number-of-pages': pageCount.toString(),
            [titleKey]: title,
            publisher,
        },
        people: author,
    };
}
