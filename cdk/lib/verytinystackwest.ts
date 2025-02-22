import { Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53'
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager'
import { LambdaIntegration, LambdaRestApi, SecurityPolicy } from 'aws-cdk-lib/aws-apigateway'
import { ApiGateway } from 'aws-cdk-lib/aws-route53-targets'

const SUBMITTER_INDEX = 'SubmitterIndex'

export class VeryTinyStackWest extends Stack {
  constructor(scope: Construct, id: string, hostedZone: IHostedZone, records: Table, props?: StackProps) {
    super(scope, id, props)

    // SSL Certificate
    const cert = new Certificate(this, 'VeryTinyCertificate', {
      domainName: 'verytiny.link',
      subjectAlternativeNames: ['*.verytiny.link'],
      validation: CertificateValidation.fromDns(hostedZone)
    })

    // Lambda
    const defaultErrorLambda = new Function(this, 'DefaultErrorHandler', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: Code.fromInline(`
      exports.handler = async (event) => {
        return {
          statusCode: 404,
          body: JSON.stringify({
            errorMessage: 'Not Found'
          })
        }
      }
      `)
    })

    const tinyLinkLambda = new NodejsFunction(this, 'VeryTinyLambda', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: '../lambda/src/verytinylambda.ts',
      bundling: {
        minify: true
      },
      environment: {
        VERY_TINY_TABLE: records.tableName,
        STRING_LENGTH: '4',
        SUBMITTER_INDEX
      },
      logRetention: RetentionDays.THREE_DAYS
    })

    records.grantReadWriteData(tinyLinkLambda)

    // API
    const restApi = new LambdaRestApi(this, 'VeryTinyApi', {
      handler: defaultErrorLambda,
      proxy: false,
      domainName: {
        certificate: cert,
        domainName: 'verytiny.link',
        securityPolicy: SecurityPolicy.TLS_1_2
      }
    })

    const tinyLambdaIntegration = new LambdaIntegration(tinyLinkLambda)

    restApi.root.addCorsPreflight({
      allowOrigins: ['*'],
      allowHeaders: ['*'],
      allowCredentials: true
    })

    restApi.root.addMethod('GET', tinyLambdaIntegration)
    restApi.root.addMethod('POST', tinyLambdaIntegration)

    const urls = restApi.root.addResource('{key}')
    urls.addCorsPreflight({
      allowOrigins: ['*'],
      allowHeaders: ['*'],
      allowCredentials: true
    })
    urls.addMethod('GET', tinyLambdaIntegration)

    new ARecord(this, 'VeryTinyRootRecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new ApiGateway(restApi)),
      region: 'us-west-2'
    })
  }
}
