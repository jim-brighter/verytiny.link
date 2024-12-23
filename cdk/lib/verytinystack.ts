import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, BillingMode, TableEncryption, AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { BackupPlan, BackupResource } from 'aws-cdk-lib/aws-backup';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { LambdaIntegration, LambdaRestApi, SecurityPolicy } from 'aws-cdk-lib/aws-apigateway';
import { ApiGateway, CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketAccessControl, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { CloudFrontAllowedCachedMethods, CloudFrontAllowedMethods, CloudFrontWebDistribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';

const SUBMITTER_INDEX = 'SubmitterIndex'

export class VeryTinyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
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
      removalPolicy: RemovalPolicy.RETAIN,
      billingMode: BillingMode.PAY_PER_REQUEST,
      deletionProtection: true,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl'
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
    });

    const tinyLinkLambda = new NodejsFunction(this, 'VeryTinyLambda', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: '../lambda/src/verytinylambda.ts',
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

    restApi.root.addCorsPreflight({
      allowOrigins: ['*'],
      allowHeaders: ['*'],
      allowCredentials: true
    });

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

    // UI Bucket
    const uiBucket = new Bucket(this, 'VeryTinyBucket', {
      bucketName: 'home.verytiny.link',
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      publicReadAccess: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      lifecycleRules: [{
        enabled: true,
        expiredObjectDeleteMarker: true,
        noncurrentVersionExpiration: Duration.days(30)
      }]
    });

    // CloudFront
    const distribution = new CloudFrontWebDistribution(this, 'VeryTinyCloudfront', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: uiBucket
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              pathPattern: '*',
              compress: true,
              allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
              cachedMethods: CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
              defaultTtl: Duration.days(90),
              minTtl: Duration.days(30),
              maxTtl: Duration.days(365)
            }
          ]
        }
      ],
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      defaultRootObject: 'index.html',
      errorConfigurations: [
        {
          errorCode: 404,
          responsePagePath: '/',
          responseCode: 200,
          errorCachingMinTtl: Duration.days(30).toSeconds()
        },
        {
          errorCode: 403,
          responsePagePath: '/',
          responseCode: 200,
          errorCachingMinTtl: Duration.days(30).toSeconds()
        }
      ],
      viewerCertificate: {
        aliases: ['home.verytiny.link'],
        props: {
          minimumProtocolVersion: 'TLSv1.2_2021',
          sslSupportMethod: 'sni-only',
          acmCertificateArn: cert.certificateArn
        }
      }
    });

    // UI Deployment
    new BucketDeployment(this, 'VeryTinyBucketDeployment', {
      sources: [Source.asset('../ui')],
      destinationBucket: uiBucket,
      distribution: distribution
    });

    new ARecord(this, 'UIRecord', {
      zone: hostedZone,
      recordName: 'home',
      target: {
        aliasTarget: new CloudFrontTarget(distribution)
      }
    });
  }
}
