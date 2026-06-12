/** Participant AV capacity env defaults — mirrored in `services/riffsync-sfu` and `.ai/runtime/configuration.md`. */
export const SFU_CAP_ENV = {
  SFU_MAX_PRODUCERS_PER_SESSION: '4',
  SFU_MAX_PRODUCERS_PER_ROOM: '24',
  SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION: '8',
  SFU_MAX_CONSUMERS_PER_SESSION: '64',
} as const;

/** Shell `printf` fragments for `/etc/riffsync-sfu.env` (CDK EC2 user-data). */
export function sfuCapEnvPrintfFragments(): string[] {
  return (Object.entries(SFU_CAP_ENV) as Array<[keyof typeof SFU_CAP_ENV, string]>).map(
    ([key, value]) => `"${key}=${value}"`,
  );
}
