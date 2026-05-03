import { CognitoJwtVerifier } from 'aws-jwt-verify';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

export function getAccessTokenVerifier(): ReturnType<typeof CognitoJwtVerifier.create> {
  if (verifier) return verifier;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error('Missing COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID');
  }
  verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access',
    clientId,
  });
  return verifier;
}

export async function verifyAccessToken(bearerHeader: string | undefined): Promise<{
  sub: string;
} | null> {
  if (!bearerHeader?.toLowerCase().startsWith('bearer ')) return null;
  const token = bearerHeader.slice(7).trim();
  if (!token) return null;
  try {
    const payload = await getAccessTokenVerifier().verify(token);
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub === '') return null;
    return { sub };
  } catch {
    return null;
  }
}
