/** Max upload size for fan avatar multipart POST (2 MiB). */
export const FAN_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const FAN_AVATAR_FORM_FIELD = 'file';

export type AllowedAvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniffImageMime(buf: Uint8Array): AllowedAvatarMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function extensionForMime(mime: AllowedAvatarMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}

export function assertSafeSubForS3Key(sub: string): boolean {
  return sub.length > 0 && !sub.includes('/') && !sub.includes('..');
}

export function avatarObjectKey(sub: string, ext: string): string {
  return `avatars/${sub}/avatar.${ext}`;
}

export function publicAvatarUrl(publicBaseUrl: string, objectKey: string): string {
  const base = publicBaseUrl.replace(/\/$/, '');
  return `${base}/${objectKey}`;
}

export function objectKeyFromAvatarUrl(avatarUrl: string, publicBaseUrl: string): string | null {
  const prefix = `${publicBaseUrl.replace(/\/$/, '')}/`;
  if (!avatarUrl.startsWith(prefix)) {
    return null;
  }
  const key = avatarUrl.slice(prefix.length);
  return key.length > 0 ? key : null;
}

export function declaredMimeAllowed(declared: string | undefined): declared is AllowedAvatarMime {
  return declared === 'image/jpeg' || declared === 'image/png' || declared === 'image/webp';
}

export type MultipartFileResult =
  | { ok: true; file: Buffer; partContentType?: string }
  | { ok: false; statusCode: number; error: string };

/**
 * Parses a single `multipart/form-data` file field (MVP: one file part only).
 */
export function parseMultipartSingleFile(
  rawBody: Buffer,
  contentType: string | undefined,
  options: { fieldName: string; maxBytes: number },
): MultipartFileResult {
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return { ok: false, statusCode: 400, error: 'expected_multipart_form_data' };
  }

  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    return { ok: false, statusCode: 400, error: 'missing_multipart_boundary' };
  }

  const delimiter = Buffer.from(`--${boundary}`);
  let searchFrom = 0;

  while (searchFrom < rawBody.length) {
    const start = rawBody.indexOf(delimiter, searchFrom);
    if (start < 0) {
      break;
    }
    let partStart = start + delimiter.length;
    if (rawBody[partStart] === 0x2d && rawBody[partStart + 1] === 0x2d) {
      break;
    }
    if (rawBody[partStart] === 0x0d && rawBody[partStart + 1] === 0x0a) {
      partStart += 2;
    } else if (rawBody[partStart] === 0x0a) {
      partStart += 1;
    }

    const nextDelimiter = rawBody.indexOf(delimiter, partStart);
    const partEnd = nextDelimiter < 0 ? rawBody.length : nextDelimiter;
    const part = rawBody.subarray(partStart, partEnd);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) {
      searchFrom = partStart + 1;
      continue;
    }

    const headerBlock = part.subarray(0, headerEnd).toString('utf8');
    const disposition = headerBlock.match(/content-disposition:\s*form-data[^;]*;\s*name="([^"]+)"/i);
    const name = disposition?.[1];
    if (name !== options.fieldName) {
      searchFrom = partStart + 1;
      continue;
    }

    let bodyStart = headerEnd + 4;
    let bodyEnd = part.length;
    if (bodyEnd >= 2 && part[bodyEnd - 2] === 0x0d && part[bodyEnd - 1] === 0x0a) {
      bodyEnd -= 2;
    }
    const file = part.subarray(bodyStart, bodyEnd);
    if (file.length > options.maxBytes) {
      return { ok: false, statusCode: 413, error: 'file_too_large' };
    }
    if (file.length === 0) {
      return { ok: false, statusCode: 400, error: 'empty_file' };
    }

    const typeMatch = headerBlock.match(/content-type:\s*([^\r\n]+)/i);
    const partContentType = typeMatch?.[1]?.trim().toLowerCase();
    return { ok: true, file: Buffer.from(file), partContentType };
  }

  return { ok: false, statusCode: 400, error: 'file_field_missing' };
}

export function validateAvatarBytes(
  file: Buffer,
  partContentType: string | undefined,
): { ok: true; mime: AllowedAvatarMime } | { ok: false; statusCode: number; error: string } {
  const sniffed = sniffImageMime(file);
  if (!sniffed) {
    return { ok: false, statusCode: 415, error: 'unsupported_image_type' };
  }
  if (partContentType && declaredMimeAllowed(partContentType) && partContentType !== sniffed) {
    return { ok: false, statusCode: 415, error: 'content_type_mismatch' };
  }
  if (partContentType && !declaredMimeAllowed(partContentType)) {
    return { ok: false, statusCode: 415, error: 'unsupported_image_type' };
  }
  return { ok: true, mime: sniffed };
}
