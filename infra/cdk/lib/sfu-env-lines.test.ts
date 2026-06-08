import { describe, expect, it } from 'vitest';
import { SFU_CAP_ENV, sfuCapEnvPrintfFragments } from './sfu-env-lines';

describe('sfu-env-lines', () => {
  it('exports participant AV cap defaults aligned with deployment_environments.md', () => {
    expect(SFU_CAP_ENV).toEqual({
      SFU_MAX_PRODUCERS_PER_SESSION: '3',
      SFU_MAX_PRODUCERS_PER_ROOM: '24',
      SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION: '8',
      SFU_MAX_CONSUMERS_PER_SESSION: '64',
    });
  });

  it('formats shell printf fragments for CDK user-data', () => {
    expect(sfuCapEnvPrintfFragments()).toEqual([
      '"SFU_MAX_PRODUCERS_PER_SESSION=3"',
      '"SFU_MAX_PRODUCERS_PER_ROOM=24"',
      '"SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION=8"',
      '"SFU_MAX_CONSUMERS_PER_SESSION=64"',
    ]);
  });
});
