// Test-only Supabase Storage HTTP protocol. File bytes live in this process;
// metadata, insert/select/delete permissions and RLS use the migrated disposable
// PostgreSQL database through PostgREST with the requesting user's signed JWT.
// Snag and work-hold photographs share this private bucket and protocol; the
// appropriate migrated reservation/read policies decide each object's scope.
// There is no shortcut from this adapter to business RPCs or trusted SQL.
import { randomBytes, randomUUID } from 'node:crypto';

export function storageFixture({ restPort, verify }) {
  const objects = new Map(), signed = new Map();
  const faults = { failUploads: 0, corruptDownloads: 0 };
  const stats = { uploads: 0, downloads: 0, signedReviews: 0, denied: 0 };
  const json = (response, status, value) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  const error = (response, status, message) => {
    if (status === 403) stats.denied++;
    json(response, status, { statusCode: String(status), error: message, message });
  };
  async function metadata(request, method, query, data, prefer = 'return=representation') {
    const response = await fetch(`http://127.0.0.1:${restPort}/objects${query}`, {
      method,
      headers: { authorization: request.headers.authorization || '', 'accept-profile': 'storage', 'content-profile': 'storage',
        'content-type': 'application/json', prefer },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const text = await response.text();
    return { status: response.status, ok: response.ok, rows: text ? JSON.parse(text) : [] };
  }
  const queryFor = (bucket, path) => `?${new URLSearchParams({ bucket_id: `eq.${bucket}`, name: `eq.${path}`, select: '*' })}`;
  async function handle(request, response, url, body) {
    if (!url.pathname.startsWith('/storage/v1/')) return false;
    const parts = url.pathname.slice('/storage/v1/'.length).split('/').map(decodeURIComponent);
    if (parts[0] !== 'object') { error(response, 404, 'Storage endpoint not implemented by local fixture'); return true; }
    if (parts[1] === 'public') { error(response, 403, 'The evidence bucket is private'); return true; }
    const signRoute = parts[1] === 'sign';
    const offset = signRoute || parts[1] === 'authenticated' ? 2 : 1;
    const bucket = parts[offset], path = parts.slice(offset + 1).join('/'), key = `${bucket}/${path}`;
    const claims = verify((request.headers.authorization || '').replace(/^Bearer /, ''));
    if (signRoute && request.method === 'GET') {
      const permission = signed.get(url.searchParams.get('token'));
      const file = objects.get(key);
      if (!permission || permission.key !== key || permission.expires < Date.now() || !file) {
        error(response, 403, 'Invalid or expired signed photograph URL'); return true;
      }
      stats.signedReviews++;
      response.writeHead(200, { 'content-type': file.type, 'cache-control': 'private, no-store' });
      response.end(file.bytes); return true;
    }
    if (!claims || !['authenticated', 'service_role'].includes(claims.role)) {
      error(response, 403, 'Storage authentication required'); return true;
    }
    if (request.method === 'POST' && !signRoute) {
      if (faults.failUploads > 0) { faults.failUploads--; error(response, 503, 'Simulated lost storage connection'); return true; }
      const type = (request.headers['content-type'] || '').split(';')[0];
      if (!['image/jpeg', 'image/png'].includes(type) || !body.length || body.length > 4194304) {
        error(response, 400, 'Photograph exceeds private bucket file constraints'); return true;
      }
      // An upsert must reach the real UPDATE grant/policy boundary; never replace
      // bytes merely because the protocol includes x-upsert.
      if (objects.has(key) && request.headers['x-upsert'] === 'true') {
        const update = await metadata(request, 'PATCH', queryFor(bucket, path), { metadata: { size: body.length, mimetype: type } });
        if (!update.ok || !update.rows.length) { error(response, 403, 'Stored photographs cannot be overwritten'); return true; }
      }
      const objectId = randomUUID();
      // No SELECT/RETURNING before verification: the application's real read
      // policy deliberately hides unverified object rows. Storage allocates the
      // object ID, then performs the caller-scoped INSERT without reading it.
      // Matches Supabase Storage v1.83.1's caller permission probe: plain INSERT
      // without RETURNING in src/storage/database/knex.ts createObject.
      // https://github.com/supabase/storage/blob/v1.83.1/src/storage/database/knex.ts
      const inserted = await metadata(request, 'POST', '', { id: objectId, bucket_id: bucket, name: path, owner: claims.sub || null,
        owner_id: claims.sub || null, metadata: { size: body.length, mimetype: type } }, 'return=minimal');
      if (!inserted.ok) { error(response, inserted.status, inserted.rows.message || 'Object insertion denied'); return true; }
      // Copy immutable original bytes only after the actual RLS-protected insert.
      objects.set(key, { bytes: Buffer.from(body), type }); stats.uploads++;
      json(response, 200, { Id: objectId, Key: key }); return true;
    }
    if (request.method === 'DELETE') {
      const input = body.length ? JSON.parse(body.toString()) : {};
      const names = path ? [path] : input.prefixes || [];
      const removed = [];
      for (const name of names) {
        const deletion = await metadata(request, 'DELETE', queryFor(bucket, name));
        if (!deletion.ok || !deletion.rows.length) { error(response, 403, 'Stored photographs cannot be deleted'); return true; }
        objects.delete(`${bucket}/${name}`); removed.push(...deletion.rows);
      }
      json(response, 200, removed); return true;
    }
    const visible = await metadata(request, 'GET', queryFor(bucket, path));
    if (!visible.ok || !Array.isArray(visible.rows) || !visible.rows.length || !objects.has(key)) {
      error(response, 403, 'Private photograph unavailable to this user'); return true;
    }
    if (request.method === 'POST' && signRoute) {
      const input = JSON.parse(body.toString()), token = randomBytes(32).toString('base64url');
      signed.set(token, { key, expires: Date.now() + Math.min(Number(input.expiresIn) || 60, 60) * 1000 });
      json(response, 200, { signedURL: `/object/sign/${key}?token=${token}` }); return true;
    }
    if (request.method === 'GET') {
      const file = objects.get(key); let bytes = file.bytes;
      if (claims.role === 'service_role' && faults.corruptDownloads > 0) {
        faults.corruptDownloads--; bytes = Buffer.from(bytes); bytes[bytes.length - 1] ^= 1;
      }
      stats.downloads++;
      response.writeHead(200, { 'content-type': file.type, 'cache-control': 'private, no-store' });
      response.end(bytes); return true;
    }
    error(response, 403, 'Immutable photograph operation denied'); return true;
  }
  return { handle, faults, stats, bytes: key => objects.get(key)?.bytes };
}
