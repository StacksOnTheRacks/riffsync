import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async () => {
  return { statusCode: 200, body: 'pong' };
};
