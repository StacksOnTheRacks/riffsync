import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import {
  RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
  buildRiffSyncOperationsDashboard,
} from './observability-dashboard';
import { ObservabilityStack } from './observability-stack';

describe('observability dashboard', () => {
  it('creates the RiffSync-prod-operations dashboard with expected metric namespaces', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    buildRiffSyncOperationsDashboard(stack, 'Dashboard', {
      environment: 'prod',
      httpApiId: 'http-api-id',
      webSocketApiId: 'ws-api-id',
      webSocketStageName: 'prod',
      tables: [
        { label: 'Connections', tableName: 'ConnectionsTable' },
        { label: 'Rooms', tableName: 'RoomsTable' },
      ],
      criticalLambdas: [
        { label: 'WsConnect', functionName: 'WsConnectFn' },
        { label: 'WsRoute', functionName: 'WsRouteFn' },
      ],
      mediaAlarms: [
        { label: 'SFU high CPU', alarmName: 'riffsync-sfu-high-cpu' },
        { label: 'TURN high CPU', alarmName: 'riffsync-turn-high-cpu' },
      ],
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
    });

    const serialized = JSON.stringify(template.toJSON());
    expect(serialized).toContain('AWS/ApiGateway');
    expect(serialized).toContain('RiffSync/Realtime');
    expect(serialized).toContain('RiffSync/Media');
    expect(serialized).toContain('RiffSync/Reconcile');
    expect(serialized).toContain('RiffSync/Product');
    expect(serialized).toContain('RoomCreate');
    expect(serialized).toContain('GuestRoomJoin');
    expect(serialized).toContain('BroadcastStarted');
    expect(serialized).toContain('LiveChannelView');
    expect(serialized).toContain('riffsync-sfu-high-cpu');
    expect(serialized).not.toContain('i-sfu123');
    expect(serialized).toContain('AWS/DynamoDB');
    expect(serialized).toContain('AWS/Lambda');
  });

  it('ObservabilityStack outputs dashboard name and console URL', () => {
    const app = new cdk.App();
    const fixture = new cdk.Stack(app, 'FixtureStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const httpApi = new apigwv2.HttpApi(fixture, 'HttpApi');
    const webSocketApi = new apigwv2.WebSocketApi(fixture, 'WebSocketApi');
    const table = new dynamodb.Table(fixture, 'ConnectionsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });
    const fn = new lambda.Function(fixture, 'WsConnectFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
    });

    const observability = new ObservabilityStack(app, 'RiffSyncObservability-prod', {
      environment: 'prod',
      httpApi,
      webSocketApi,
      webSocketStageName: 'prod',
      tables: [{ label: 'Connections', table: table }],
      criticalLambdas: [fn],
      mediaAlarms: [
        { label: 'SFU high CPU', alarmName: 'riffsync-sfu-high-cpu' },
        { label: 'TURN high CPU', alarmName: 'riffsync-turn-high-cpu' },
      ],
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(observability);
    template.hasOutput('OperationsDashboardName', {
      Value: RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
    });
    template.hasOutput('OperationsDashboardUrl', {
      Value: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=${RIFFSYNC_OPERATIONS_DASHBOARD_NAME}`,
    });
  });
});
