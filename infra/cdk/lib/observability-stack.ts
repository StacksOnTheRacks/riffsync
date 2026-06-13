import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import {
  RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
  buildRiffSyncOperationsDashboard,
} from './observability-dashboard';

export interface ObservabilityTableRef {
  readonly label: string;
  readonly table: dynamodb.ITable;
}

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly httpApi: apigwv2.IHttpApi;
  readonly webSocketApi: apigwv2.IWebSocketApi;
  readonly webSocketStageName: string;
  readonly tables: ObservabilityTableRef[];
  readonly criticalLambdas: lambda.IFunction[];
  readonly sfuInstanceId: string;
  readonly turnInstanceId: string;
}

/**
 * CloudWatch dashboard for prod launch monitoring — no runtime resources beyond the dashboard itself.
 */
export class ObservabilityStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'RiffSync');
    cdk.Tags.of(this).add('Environment', props.environment);

    const criticalLambdaLabels = [
      'WsConnect',
      'WsRoute',
      'LobbyGet',
      'RoomCreate',
      'WebrtcSfuToken',
    ];

    this.dashboard = buildRiffSyncOperationsDashboard(this, 'OperationsDashboard', {
      environment: props.environment,
      httpApiId: props.httpApi.apiId,
      webSocketApiId: props.webSocketApi.apiId,
      webSocketStageName: props.webSocketStageName,
      tables: props.tables.map((tableRef) => ({
        label: tableRef.label,
        tableName: tableRef.table.tableName,
      })),
      criticalLambdas: props.criticalLambdas.map((fn, index) => ({
        label: criticalLambdaLabels[index] ?? fn.node.id,
        functionName: fn.functionName,
      })),
      sfuInstanceId: props.sfuInstanceId,
      turnInstanceId: props.turnInstanceId,
    });

    const region = cdk.Stack.of(this).region;
    new cdk.CfnOutput(this, 'OperationsDashboardName', {
      value: RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
      description: 'CloudWatch dashboard name for RiffSync prod operations.',
    });

    new cdk.CfnOutput(this, 'OperationsDashboardUrl', {
      value: `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${RIFFSYNC_OPERATIONS_DASHBOARD_NAME}`,
      description: 'CloudWatch console deep link for launch monitoring.',
    });
  }
}
