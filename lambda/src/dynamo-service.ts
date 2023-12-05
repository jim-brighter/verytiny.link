import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Link, LinkRecord } from './link';
import { randomString } from './util';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_REGION,
}),
{
    marshallOptions: {
        convertClassInstanceToMap: true
    }
});

const table = process.env.VERY_TINY_TABLE || '';

export const createLink = async (url: string, submitter?: string): Promise<Link> => {
    const link = new LinkRecord();
    link.shortId = randomString();
    link.submitter = submitter || 'anon';
    link.url = url;
    link.createdTime = new Date().getTime();

    while(true) {
        try {
            await ddb.send(new PutCommand({
                TableName: table,
                Item: link,
                ConditionExpression: 'attribute_not_exists(shortId)'
            }));

            return link;
        } catch(e) {
            if (e instanceof ConditionalCheckFailedException) {
                console.info(`Duplicate shortId generated for url ${url}`);
                link.shortId = randomString();
            } else {
                console.error(`Error inserting url ${url}`, e);
                throw e;
            }
        }
    }
}

export const getUrl = async (key: string): Promise<string> => {
    try {
        const links = await ddb.send(new QueryCommand({
            TableName: table,
            ExpressionAttributeValues: {
                ':shortId': key
            },
            KeyConditionExpression: 'shortId = :shortId'
        }));

        const link = links.Items ? links.Items[0] as LinkRecord : new LinkRecord();

        return link.url;
    } catch(e) {
        console.error(`Error finding record with key ${key}`, e);
        throw e;
    }
}
