/**
 * Viewer-request function: send browsers to the canonical hostname (301) while
 * leaving `*.cloudfront.net` and the canonical host unchanged.
 */
export function viewerRequestRedirectToCanonicalSource(canonicalHost: string): string {
  const canon = JSON.stringify(canonicalHost.replace(/\.$/, '').toLowerCase());
  return `function handler(event) {
  var request = event.request;
  var h = request.headers.host;
  if (!h || !h.value) return request;
  var host = h.value.split(':')[0].toLowerCase();
  if (host.endsWith('.cloudfront.net')) return request;
  var canonical = ${canon};
  if (host === canonical) return request;
  var uri = request.uri || '/';
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
