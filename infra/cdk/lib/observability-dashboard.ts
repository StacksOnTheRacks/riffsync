import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export const RIFFSYNC_OPERATIONS_DASHBOARD_NAME = 'RiffSync-prod-operations';

const METRIC_PERIOD = cdk.Duration.minutes(5);
const HTTP_API_STAGE = '$default';

export interface RiffSyncDashboardTableRef {
  readonly label: string;
  readonly tableName: string;
}

export interface RiffSyncDashboardLambdaRef {
  readonly label: string;
  readonly functionName: string;
}

export interface RiffSyncDashboardAlarmRef {
  readonly label: string;
  readonly alarmName: string;
}

export interface RiffSyncDashboardProps {
  readonly environment: string;
  readonly httpApiId: string;
  readonly webSocketApiId: string;
  readonly webSocketStageName: string;
  readonly tables: RiffSyncDashboardTableRef[];
  readonly criticalLambdas: RiffSyncDashboardLambdaRef[];
  readonly mediaAlarms: RiffSyncDashboardAlarmRef[];
}

function httpApiMetric(
  apiId: string,
  metricName: string,
  statistic: string,
  label?: string,
): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: 'AWS/ApiGateway',
    metricName,
    dimensionsMap: {
      ApiId: apiId,
      Stage: HTTP_API_STAGE,
    },
    statistic,
    period: METRIC_PERIOD,
    label,
  });
}

function webSocketApiMetric(
  apiId: string,
  stage: string,
  metricName: string,
  statistic: string,
  label?: string,
): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: 'AWS/ApiGateway',
    metricName,
    dimensionsMap: {
      ApiId: apiId,
      Stage: stage,
    },
    statistic,
    period: METRIC_PERIOD,
    label,
  });
}

function dynamoTableMetric(
  tableName: string,
  metricName: string,
  statistic: string,
  label?: string,
): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: 'AWS/DynamoDB',
    metricName,
    dimensionsMap: {
      TableName: tableName,
    },
    statistic,
    period: METRIC_PERIOD,
    label,
  });
}

function lambdaFunctionMetric(
  functionName: string,
  metricName: string,
  statistic: string,
  label?: string,
): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: 'AWS/Lambda',
    metricName,
    dimensionsMap: {
      FunctionName: functionName,
    },
    statistic,
    period: METRIC_PERIOD,
    label,
  });
}

function emfSearchMetric(
  schema: string,
  filter: string,
  label: string,
): cloudwatch.MathExpression {
  return new cloudwatch.MathExpression({
    expression: `SEARCH('{${schema}} MetricName="Requests" ${filter}', 'Sum', 300)`,
    label,
    period: METRIC_PERIOD,
  });
}

function emfSearchNamedMetric(
  namespace: string,
  schemaDimensions: string,
  metricName: string,
  filter: string,
  label: string,
): cloudwatch.MathExpression {
  return new cloudwatch.MathExpression({
    expression: `SEARCH('{${namespace},${schemaDimensions}} MetricName="${metricName}" ${filter}', 'Sum', 300)`,
    label,
    period: METRIC_PERIOD,
  });
}

function sumLambdaConcurrentExecutions(
  lambdas: RiffSyncDashboardLambdaRef[],
): cloudwatch.IMetric {
  if (lambdas.length === 0) {
    return new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      statistic: 'Maximum',
      period: METRIC_PERIOD,
    });
  }

  const usingMetrics: Record<string, cloudwatch.IMetric> = {};
  const parts: string[] = [];
  lambdas.forEach((lambdaRef, index) => {
    const key = `m${index}`;
    usingMetrics[key] = lambdaFunctionMetric(
      lambdaRef.functionName,
      'ConcurrentExecutions',
      'Maximum',
      lambdaRef.label,
    );
    parts.push(key);
  });

  return new cloudwatch.MathExpression({
    expression: parts.join(' + '),
    usingMetrics,
    label: 'Critical Lambda concurrent executions',
    period: METRIC_PERIOD,
  });
}

/** CloudWatch operations dashboard for prod launch monitoring. */
export function buildRiffSyncOperationsDashboard(
  scope: Construct,
  id: string,
  props: RiffSyncDashboardProps,
): cloudwatch.Dashboard {
  const env = props.environment;
  const dashboard = new cloudwatch.Dashboard(scope, id, {
    dashboardName: RIFFSYNC_OPERATIONS_DASHBOARD_NAME,
    defaultInterval: cdk.Duration.hours(1),
  });

  const launchNotes = [
    '**RiffSync prod operations** — HTTP stage throttle is **50 req/s** (burst 100). Singleton SFU on **t3.medium**.',
    'Scale signals: Lambda **Throttles**, Dynamo **ThrottledRequests**, SFU **CPU** > 80%, **`SfuTokenDenied`** (`publisher_cap_exceeded`).',
    'SFU process EMF (transport/consumer limits) stays on EC2 stdout until a scrape agent ships — use CPU/network + token denials here.',
  ].join('\n\n');

  const httpCount = httpApiMetric(props.httpApiId, 'Count', 'Sum', 'HTTP requests');
  const wsConnectCount = webSocketApiMetric(
    props.webSocketApiId,
    props.webSocketStageName,
    'ConnectCount',
    'Sum',
    'WS connects',
  );
  const lambdaConcurrent = sumLambdaConcurrentExecutions(props.criticalLambdas);

  const dynamoThrottleMetrics = props.tables.flatMap((table) => [
    dynamoTableMetric(table.tableName, 'ThrottledRequests', 'Sum', `${table.label} throttles`),
    dynamoTableMetric(table.tableName, 'UserErrors', 'Sum', `${table.label} user errors`),
  ]);

  const dynamoCapacityMetrics = props.tables.flatMap((table) => [
    dynamoTableMetric(table.tableName, 'ConsumedReadCapacityUnits', 'Sum', `${table.label} RCU`),
    dynamoTableMetric(table.tableName, 'ConsumedWriteCapacityUnits', 'Sum', `${table.label} WCU`),
  ]);

  const lambdaErrorMetrics = props.criticalLambdas.map((lambdaRef) =>
    lambdaFunctionMetric(lambdaRef.functionName, 'Errors', 'Sum', `${lambdaRef.label} errors`),
  );
  const lambdaThrottleMetrics = props.criticalLambdas.map((lambdaRef) =>
    lambdaFunctionMetric(lambdaRef.functionName, 'Throttles', 'Sum', `${lambdaRef.label} throttles`),
  );
  const lambdaDurationMetrics = props.criticalLambdas.map((lambdaRef) =>
    lambdaFunctionMetric(lambdaRef.functionName, 'Duration', 'p99', `${lambdaRef.label} p99`),
  );
  const mediaAlarms = props.mediaAlarms.map((alarmRef, index) =>
    cloudwatch.Alarm.fromAlarmName(scope, `MediaAlarm${index}`, alarmRef.alarmName),
  );

  dashboard.addWidgets(
    new cloudwatch.TextWidget({
      markdown: launchNotes,
      width: 24,
      height: 3,
    }),
    new cloudwatch.SingleValueWidget({
      title: 'HTTP requests (5m sum)',
      metrics: [httpCount],
      width: 8,
      height: 4,
      sparkline: true,
    }),
    new cloudwatch.SingleValueWidget({
      title: 'WebSocket connects (5m sum)',
      metrics: [wsConnectCount],
      width: 8,
      height: 4,
      sparkline: true,
    }),
    new cloudwatch.SingleValueWidget({
      title: 'Critical Lambda concurrency (max)',
      metrics: [lambdaConcurrent],
      width: 8,
      height: 4,
      sparkline: true,
    }),
    new cloudwatch.GraphWidget({
      title: 'HTTP API — volume and errors',
      width: 12,
      height: 6,
      left: [
        httpCount,
        httpApiMetric(props.httpApiId, '4XXError', 'Sum', 'HTTP 4xx'),
        httpApiMetric(props.httpApiId, '5XXError', 'Sum', 'HTTP 5xx'),
      ],
      right: [httpApiMetric(props.httpApiId, 'Latency', 'p99', 'HTTP latency p99')],
    }),
    new cloudwatch.GraphWidget({
      title: 'WebSocket API — connections and errors',
      width: 12,
      height: 6,
      left: [
        wsConnectCount,
        webSocketApiMetric(
          props.webSocketApiId,
          props.webSocketStageName,
          'MessageCount',
          'Sum',
          'WS messages',
        ),
      ],
      right: [
        webSocketApiMetric(
          props.webSocketApiId,
          props.webSocketStageName,
          'IntegrationError',
          'Sum',
          'WS integration errors',
        ),
        webSocketApiMetric(
          props.webSocketApiId,
          props.webSocketStageName,
          'ClientError',
          'Sum',
          'WS client errors',
        ),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Critical Lambda — errors and throttles',
      width: 12,
      height: 6,
      left: lambdaErrorMetrics,
      right: lambdaThrottleMetrics,
    }),
    new cloudwatch.GraphWidget({
      title: 'Critical Lambda — duration p99',
      width: 12,
      height: 6,
      left: lambdaDurationMetrics,
    }),
    new cloudwatch.GraphWidget({
      title: 'DynamoDB — throttles and user errors',
      width: 12,
      height: 6,
      left: dynamoThrottleMetrics,
    }),
    new cloudwatch.GraphWidget({
      title: 'DynamoDB — consumed capacity',
      width: 12,
      height: 6,
      left: dynamoCapacityMetrics,
    }),
    new cloudwatch.GraphWidget({
      title: 'Chat — RiffSync/Realtime requests',
      width: 12,
      height: 6,
      left: [
        emfSearchMetric(
          'RiffSync/Realtime,Environment,Route,Outcome',
          `Environment="${env}"`,
          'Chat requests (all outcomes)',
        ),
        emfSearchMetric(
          'RiffSync/Realtime,Environment,Route,Outcome',
          `Environment="${env}" Outcome="server_error"`,
          'Chat server_error',
        ),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Media — SFU token denials',
      width: 12,
      height: 6,
      left: [
        emfSearchNamedMetric(
          'RiffSync/Media',
          'Environment,Reason',
          'SfuTokenDenied',
          `Environment="${env}"`,
          'SfuTokenDenied (by reason)',
        ),
      ],
    }),
    new cloudwatch.AlarmStatusWidget({
      title: 'Media — host alarms',
      width: 12,
      height: 6,
      alarms: mediaAlarms,
    }),
    new cloudwatch.GraphWidget({
      title: 'Catalog reconcile — RiffSync/Reconcile',
      width: 12,
      height: 6,
      left: [
        emfSearchNamedMetric(
          'RiffSync/Reconcile',
          'Environment',
          'Processed',
          `Environment="${env}"`,
          'Processed',
        ),
        emfSearchNamedMetric(
          'RiffSync/Reconcile',
          'Environment',
          'Failed',
          `Environment="${env}"`,
          'Failed',
        ),
        emfSearchNamedMetric(
          'RiffSync/Reconcile',
          'Environment',
          'Skipped',
          `Environment="${env}"`,
          'Skipped',
        ),
      ],
    }),
  );

  return dashboard;
}
