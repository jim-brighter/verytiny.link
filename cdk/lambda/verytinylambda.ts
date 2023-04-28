import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamoService from './dynamo-service';
import { Link } from './link';

export const handler = async(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    const corsHeaders: any = {
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Credentials': true
    };

    switch(event.httpMethod) {
        case 'GET':
            if (event.pathParameters && event.pathParameters.key) {
                const key = event.pathParameters.key;
                try {
                    const url = await dynamoService.getUrl(key);
                    return {
                        statusCode: 301,
                        headers: {
                            Location: url
                        },
                        body: ''
                    }
                } catch(e) {
                    return {
                        statusCode: 500,
                        headers: corsHeaders,
                        body: JSON.stringify({
                            errorMessage: `Error redirecting to url for ${key}`
                        })
                    }
                }
            }
            else {
                return {
                    statusCode: 301,
                    headers: {
                        Location: 'https://home.verytiny.link'
                    },
                    body: ''
                }
            }
        case 'POST':
            let body = event.body && JSON.parse(event.body);
            let url: string = body.url;
            let submitter: string = body.submitter;
            if (url === null) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        errorMessage: `url is required in request body`
                    })
                }
            }
            try {
                const link: Link = await dynamoService.createLink(url, submitter);
                return {
                    statusCode: 201,
                    headers: corsHeaders,
                    body: JSON.stringify(link)
                }
            } catch(e) {
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        errorMessage: `Error creating link for ${url}`
                    })
                }
            }
        default:
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: JSON.stringify({
                    errorMessage: 'Operation not supported'
                })
            };
    }
}
