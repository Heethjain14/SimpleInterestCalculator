/** Generates a locally-unique id, used directly as the Firestore document id. */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
