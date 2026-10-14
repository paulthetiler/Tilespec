import { ValidationError } from "./validation";
// API routes do not inherit the server-action body limit. Bound streamed
// multipart data before buffering/parsing it, including chunked requests.
export async function boundedPhotoForm(request:Request) {
 const maximum=4*1024*1024+64*1024;
 const reader=request.body?.getReader();
 if(!reader) throw new ValidationError("Choose a photograph.");
 const chunks:Uint8Array[]=[];let size=0;
 for(;;) {
  const result=await reader.read();if(result.done) break;
  size+=result.value.byteLength;
  if(size>maximum) {await reader.cancel();throw new ValidationError("Photograph upload exceeds the 4 MB limit.");}
  chunks.push(result.value);
 }
 const body=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 return new Response(body,{headers:{"content-type":request.headers.get("content-type")||""}}).formData();
}
