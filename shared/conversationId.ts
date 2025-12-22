function djb2Hash(str: string, seed: number = 5381): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

export function generateConversationId(addr1: string, addr2: string): string {
  const sorted = [addr1, addr2].sort();
  const combined = sorted.join('|');
  const h1 = djb2Hash(combined, 5381);
  const h2 = djb2Hash(combined, 33);
  const h3 = djb2Hash(combined, 65599);
  return `dm_${h1.toString(36)}_${h2.toString(36)}_${h3.toString(36)}`;
}
