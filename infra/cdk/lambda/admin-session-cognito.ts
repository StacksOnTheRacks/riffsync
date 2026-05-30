import {
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

let cognitoClient: CognitoIdentityProviderClient | undefined;

export function resetAdminSessionCognitoClientForTests(): void {
  cognitoClient = undefined;
}

function getCognitoClient(): CognitoIdentityProviderClient {
  cognitoClient ??= new CognitoIdentityProviderClient({});
  return cognitoClient;
}

export async function listStaffGroupsViaCognito(
  userPoolId: string,
  username: string,
  client: CognitoIdentityProviderClient = getCognitoClient(),
): Promise<string[]> {
  const res = await client.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
  );
  return (res.Groups ?? [])
    .map((g) => g.GroupName)
    .filter((g): g is string => typeof g === 'string' && g.length > 0);
}
