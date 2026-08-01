/**
 * Viewer-request function: send custom aliases to the canonical hostname (301)
 * and rewrite clean SPA URLs to their prerendered `index.html` objects.
 */
export function viewerRequestRedirectToCanonicalSource(canonicalHost?: string): string {
  const canon =
    typeof canonicalHost === 'string' && canonicalHost.trim() !== ''
      ? JSON.stringify(canonicalHost.replace(/\.$/, '').toLowerCase())
      : 'null';
  return `function handler(event) {
  var request = event.request;
  var h = request.headers.host;
  var canonical = ${canon};
  var uri = request.uri || '/';

  if (h && h.value && canonical) {
    var host = h.value.split(':')[0].toLowerCase();
    if (!host.endsWith('.cloudfront.net') && host !== canonical) {
      var qs = request.querystring;
      var tail = '';
      if (qs && typeof qs === 'object') {
        var keys = Object.keys(qs);
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var o = qs[k];
          if (!o) continue;
          if (o.multiValue && o.multiValue.length) {
            for (var j = 0; j < o.multiValue.length; j++) {
              parts.push(k + '=' + encodeURIComponent(o.multiValue[j].value));
            }
          } else if (o.value !== undefined && o.value !== null) {
            parts.push(k + '=' + encodeURIComponent(o.value));
          }
        }
        if (parts.length) tail = '?' + parts.join('&');
      }
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: 'https://' + canonical + uri + tail } }
      };
    }
  }

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
    return request;
  }

  var lastSlash = uri.lastIndexOf('/');
  var lastSegment = lastSlash === -1 ? uri : uri.slice(lastSlash + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }

  return request;
}
`;
}

/** Stable CDK construct fragment from FQDN (e.g. apex + www need distinct ids). */
export function dnsRecordConstructSuffix(fqdn: string): string {
  return fqdn
    .replace(/\.$/, '')
    .toLowerCase()
    .split('.')
    .map((label) => label.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)
    .join('');
}
