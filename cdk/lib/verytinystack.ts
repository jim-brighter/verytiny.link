import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, BillingMode, TableEncryption, AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { BackupPlan, BackupResource } from 'aws-cdk-lib/aws-backup';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HttpIntegration, LambdaIntegration, LambdaRestApi, PassthroughBehavior, SecurityPolicy } from 'aws-cdk-lib/aws-apigateway';
import { ApiGateway } from 'aws-cdk-lib/aws-route53-targets';

const SUBMITTER_INDEX = 'SubmitterIndex'

export class VeryTinyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Hosted Zone
    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'verytiny.link'
    });

    // SSL Certificate
    const cert = new Certificate(this, 'VeryTinyCertificate', {
      domainName: 'verytiny.link',
      subjectAlternativeNames: ['*.verytiny.link'],
      validation: CertificateValidation.fromDns(hostedZone)
    });

    // Dynamo
    const records = new Table(this, 'VeryTinyUrls', {
      partitionKey: {
        name: 'shortId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'submitter',
        type: AttributeType.STRING
      },
      encryption: TableEncryption.AWS_MANAGED,
      tableName: 'VeryTinyUrls',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      billingMode: BillingMode.PAY_PER_REQUEST,
      deletionProtection: true,
      pointInTimeRecovery: true
    });

    records.addGlobalSecondaryIndex({
      indexName: SUBMITTER_INDEX,
      partitionKey: {
        name: 'submitter',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    });

    const plan = BackupPlan.daily35DayRetention(this, 'BackupPlan');
    plan.addSelection('BackupPlanSelection', {
      resources: [
        BackupResource.fromDynamoDbTable(records)
      ]
    });

    // Lambda
    const defaultErrorLambda = new Function(this, 'DefaultErrorHandler', {
      runtime: Runtime.NODEJS_18_X,
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
    });

    const tinyLinkLambda = new NodejsFunction(this, 'VeryTinyLambda', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: './lambda/verytinylambda.ts',
      bundling: {
        minify: true,
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb'
        ]
      },
      environment: {
        VERY_TINY_TABLE: records.tableName,
        STRING_LENGTH: '4',
        SUBMITTER_INDEX
      },
      logRetention: RetentionDays.ONE_MONTH
    });

    records.grantReadWriteData(tinyLinkLambda);

    // API
    const restApi = new LambdaRestApi(this, 'VeryTinyApi', {
      handler: defaultErrorLambda,
      proxy: false,
      domainName: {
        certificate: cert,
        domainName: 'verytiny.link',
        securityPolicy: SecurityPolicy.TLS_1_2
      }
    });

    const tinyLambdaIntegration = new LambdaIntegration(tinyLinkLambda)

    restApi.root.addMethod('GET', tinyLambdaIntegration);
    restApi.root.addMethod('POST', tinyLambdaIntegration);

    const urls = restApi.root.addResource('{key}');
    urls.addCorsPreflight({
      allowOrigins: ['*'],
      allowHeaders: ['*'],
      allowCredentials: true
    });
    urls.addMethod('GET', tinyLambdaIntegration);

    new ARecord(this, 'VeryTinyRootRecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new ApiGateway(restApi))
    });

  }
}
