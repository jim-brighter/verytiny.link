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
import { AllowedMethods, CachedMethods, CachePolicy, Distribution, SecurityPolicyProtocol, SSLMethod, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { S3StaticWebsiteOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

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
        minify: true
      },
      environment: {
        VERY_TINY_TABLE: records.tableName,
        STRING_LENGTH: '4',
        SUBMITTER_INDEX
      },
      logRetention: RetentionDays.THREE_DAYS
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
        noncurrentVersionExpiration: Duration.days(3)
      }]
    });

    // CloudFront
    const distribution = new Distribution(this, 'VeryTinyCloudfront', {
      defaultBehavior: {
        compress: true,
        origin: new S3StaticWebsiteOrigin(uiBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: new CachePolicy(this, 'CachePolicy', {
          defaultTtl: Duration.days(90),
          minTtl: Duration.days(30),
          maxTtl: Duration.days(365)
        })
      },
      certificate: cert,
      sslSupportMethod: SSLMethod.SNI,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      domainNames: ['home.verytiny.link'],
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/',
          responseHttpStatus: 200,
          ttl: Duration.days(30)
        },
        {
          httpStatus: 403,
          responsePagePath: '/',
          responseHttpStatus: 200,
          ttl: Duration.days(30)
        }
      ]
    })

    // UI Deployment
    new BucketDeployment(this, 'VeryTinyBucketDeployment', {
      sources: [Source.asset('../ui')],
      exclude: ['build.js'],
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
