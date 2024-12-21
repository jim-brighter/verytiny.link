interface ILink {
    shortId: string;
    submitter: string;
    url: string;
    createdTime: number;
    ttl: number;
}

export type Link = ILink;

export class LinkRecord implements Link {
    shortId: string;
    submitter: string;
    url: string;
    createdTime: number;
    ttl: number;
}
