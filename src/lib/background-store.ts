export type CustomBackground = {
  blob: Blob;
  name: string;
  type: "image" | "video";
};
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
]);
let temporary = false;
const temporaryBackgrounds = new Map<string, CustomBackground>();
export function setTemporaryBackgrounds(enabled: boolean) {
  temporary = enabled;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("cast-backgrounds", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scenes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Background storage is unavailable in this browser."));
  });
}
async function store<T>(
  owner: string,
  write: boolean,
  operation: (table: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(
      "scenes",
      write ? "readwrite" : "readonly",
    );
    const request = operation(transaction.objectStore("scenes"));
    let value: T;
    request.onsuccess = () => {
      value = request.result;
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(value);
    };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      reject(
        new Error(
          "Your background could not be saved. Check this browser’s available storage.",
        ),
      );
    };
  });
}
export function getBackground(owner: string) {
  if (temporary) return Promise.resolve(temporaryBackgrounds.get(owner));
  return store<CustomBackground | undefined>(owner, false, (table) =>
    table.get(owner),
  );
}
export function removeBackground(owner: string) {
  if (temporary) {
    temporaryBackgrounds.delete(owner);
    return Promise.resolve(undefined);
  }
  return store<undefined>(owner, true, (table) => table.delete(owner));
}
export async function saveBackground(owner: string, file: File) {
  if (!allowed.has(file.type))
    throw new Error("Choose a JPG, PNG, WebP, GIF, AVIF, MP4, or WebM file.");
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error("Choose a background smaller than 25 MB.");
  const value: CustomBackground = {
    blob: file,
    name: file.name.slice(0, 200),
    type: file.type.startsWith("video/") ? "video" : "image",
  };
  if (temporary) temporaryBackgrounds.set(owner, value);
  else
    await store<IDBValidKey>(owner, true, (table) => table.put(value, owner));
  return value;
}
