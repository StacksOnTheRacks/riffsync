import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';

import { HOST_SUB_ROOMS_INDEX } from '../lambda/room-shared';

describe('RoomsTable HostSubRoomsIndex', () => {
  it('declares HostSubRoomsIndex with hostSub PK and lastActivityAt SK', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'RoomsTableIndexTest');
    const table = new dynamodb.Table(stack, 'RoomsTable', {
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    table.addGlobalSecondaryIndex({
      indexName: HOST_SUB_ROOMS_INDEX,
      partitionKey: { name: 'hostSub', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastActivityAt', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: [
        {
          IndexName: HOST_SUB_ROOMS_INDEX,
          KeySchema: [
            { AttributeName: 'hostSub', KeyType: 'HASH' },
            { AttributeName: 'lastActivityAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });
  });
});
