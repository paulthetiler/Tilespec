import test from "node:test";
import assert from "node:assert/strict";
import { boundedPhotoForm } from "../lib/operations/photo-form";
import { inspectEvidence, verifyStoredEvidence } from "../lib/operations/evidence";
import { MAX_FILE_BYTES, ValidationError } from "../lib/operations/validation";

const maximum = MAX_FILE_BYTES + 64 * 1024;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
function request(body: ReadableStream<Uint8Array>, headers: Record<string, string>) {
  return new Request("https://example.test/snags/photo", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

test("chunked multipart fields and photograph survive arbitrary boundary splits", async () => {
  const data = new FormData();
  data.set("request_key", "a1000000-0000-4000-8000-000000000001");
  data.set("purpose", "original");
  data.set("file", new Blob([jpeg], { type: "image/jpeg" }), "bathroom.jpg");
  const encoded = new Response(data), bytes = new Uint8Array(await encoded.arrayBuffer());
  let position = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (position === bytes.length) { controller.close(); return; }
    const end = Math.min(position + 7, bytes.length);
    controller.enqueue(bytes.slice(position, end)); position = end;
  } });
  const parsed = await boundedPhotoForm(request(stream, { "content-type": encoded.headers.get("content-type")! }));
  assert.equal(parsed.get("purpose"), "original");
  assert.equal(parsed.get("request_key"), data.get("request_key"));
  const file = parsed.get("file"); assert.ok(file instanceof File);
  assert.equal(file.name, "bathroom.jpg"); assert.equal(file.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), jpeg);
});

test("a 4 MB photograph is accepted with ordinary multipart overhead", async () => {
  const bytes = new Uint8Array(MAX_FILE_BYTES); bytes.set(jpeg);
  const data = new FormData(); data.set("purpose", "rectification");
  data.set("file", new Blob([bytes], { type: "image/jpeg" }), "repair.jpg");
  const parsed = await boundedPhotoForm(new Request("https://example.test/photo", { method: "POST", body: data }));
  const file = parsed.get("file"); assert.ok(file instanceof File);
  assert.equal(file.size, MAX_FILE_BYTES);
  assert.equal(inspectEvidence(new Uint8Array(await file.arrayBuffer()), file.type).mime, "image/jpeg");
});

test("the exact multipart bound is allowed, while even one additional byte cancels a chunked upload", async () => {
  const boundary = "photo-boundary";
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\n`;
  const suffix = `\r\n--${boundary}--\r\n`;
  const body = new TextEncoder().encode(prefix + "x".repeat(maximum - prefix.length - suffix.length) + suffix);
  const parsed = await boundedPhotoForm(new Request("https://example.test/photo", { method: "POST", body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } }));
  assert.equal(String(parsed.get("note")).length, maximum - prefix.length - suffix.length);
  let chunks = 0, cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(chunks++ === 0 ? new Uint8Array(maximum) : new Uint8Array(1)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(boundedPhotoForm(request(oversized, { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": "1" })), /4 MB limit/);
  assert.equal(cancelled, true, "the unread request stream is cancelled instead of continuing to consume attacker-controlled data");
});

test("a single oversized chunk is rejected without trusting Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(maximum + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(boundedPhotoForm(request(stream, { "content-type": "multipart/form-data; boundary=x", "content-length": "20" })), ValidationError);
  assert.equal(cancelled, true);
});

test("bodyless and malformed multipart requests cannot masquerade as saved photographic evidence", async () => {
  await assert.rejects(boundedPhotoForm(new Request("https://example.test/photo")), ValidationError);
  await assert.rejects(boundedPhotoForm(new Request("https://example.test/photo", { method: "POST", body: "not multipart", headers: { "content-type": "multipart/form-data; boundary=x" } })));
});

test("matching JPEG and PNG signatures are required and spoofed formats remain unverified", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  assert.equal(inspectEvidence(jpeg, "image/jpeg").extension, "jpg");
  assert.equal(inspectEvidence(png, "image/png").extension, "png");
  for (const [bytes, type] of [[jpeg, "image/png"], [png, "image/jpeg"], [new TextEncoder().encode("<svg onload='alert(1)'/>"), "image/png"], [jpeg, "image/heic"]] as const) {
    assert.throws(() => inspectEvidence(bytes, type), ValidationError);
  }
});

test("a verified reservation requires the exact uploaded bytes, size and signature", () => {
  const meta = { bytes: jpeg.byteLength, mime_type: "image/jpeg", sha256: inspectEvidence(jpeg, "image/jpeg").sha256 };
  assert.doesNotThrow(() => verifyStoredEvidence(jpeg, meta));
  const changed = jpeg.slice(); changed[changed.length - 1] ^= 1;
  assert.throws(() => verifyStoredEvidence(changed, meta), /unverified/);
  assert.throws(() => verifyStoredEvidence(jpeg, { ...meta, bytes: meta.bytes + 1 }), /unverified/);
  assert.throws(() => verifyStoredEvidence(jpeg, { ...meta, mime_type: "image/png" }), ValidationError);
});
