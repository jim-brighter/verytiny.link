#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { VeryTinyStack } from '../lib/verytinystack'
import { VeryTinyStackWest } from '../lib/verytinystackwest'

const app = new cdk.App()

const east = new VeryTinyStack(app, 'VeryTinyLink', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'us-east-1'
    },
    crossRegionReferences: true
})

const west = new VeryTinyStackWest(app, 'VeryTinyLinkWest', east.hostedZone, east.records, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'us-west-2'
    },
    crossRegionReferences: true
})
