import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import * as dynamoService from './dynamo-service'
import { Link } from './link'

export const handler = async(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    const corsHeaders: any = {
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Credentials': true
    }

    const redirect: APIGatewayProxyResult = {
        statusCode: 301,
        headers: {
            Location: 'https://home.verytiny.link'
        },
        body: ''
    }

    switch(event.httpMethod) {
        case 'GET':
            if (event.pathParameters && event.pathParameters.key) {
                const key = event.pathParameters.key
                try {
                    const url = await dynamoService.getUrl(key)
                    redirect.headers = { Location:  url }
                    return redirect
                } catch(e) {
                    console.error(`Error redirecting to url for '${key}'`)
                    return redirect
                }
            }
            else {
                return redirect
            }
        case 'POST':
            let body = event.body && JSON.parse(event.body)
            let url: string = body.url
            let submitter: string = body.submitter
            if (url == null || url.length === 0) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        errorMessage: `url is required in request body`
                    })
                }
            }
            if (!(url.toLowerCase().startsWith('http'))) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        errorMessage: `url must be a valid web address`
                    })
                }
            }
            try {
                const link: Link = await dynamoService.createLink(url, submitter)
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
            }
    }
}
