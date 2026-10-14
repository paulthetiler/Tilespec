export function revalidatePath(path: string) {
  ((globalThis as { revalidated?: string[] }).revalidated ??= []).push(path);
}
