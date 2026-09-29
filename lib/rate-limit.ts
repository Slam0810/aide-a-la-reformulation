// Limiteur de débit "best effort", en mémoire, sans dépendance externe.
//
// Limite : sur Vercel, une fonction serverless peut être exécutée sur
// plusieurs instances en parallèle (et la mémoire est réinitialisée à
// chaque cold start), donc ce compteur n'est PAS un verrou distribué
// fiable à 100 %. Il suffit à freiner un usage abusif classique (un
// même utilisateur qui spamme le bouton, un script naïf) tant que le
// trafic reste modeste. Pour une garantie stricte et partagée entre
// toutes les instances, il faudrait un stockage externe (Upstash
// Redis, Vercel KV...).

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Borne la mémoire utilisée si de nombreuses IP différentes défilent.
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    if (buckets.size > MAX_TRACKED_KEYS) {
      pruneOldestEntries();
    }
    return { allowed: true, remaining: Math.max(0, limit - 1), resetInMs: windowMs };
  }

  const resetInMs = windowMs - (now - existing.windowStart);

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetInMs
  };
}

function pruneOldestEntries() {
  const entries = Array.from(buckets.entries()).sort(
    (a, b) => a[1].windowStart - b[1].windowStart
  );
  const removeCount = Math.ceil(entries.length * 0.1);
  for (let i = 0; i < removeCount; i++) {
    buckets.delete(entries[i][0]);
  }
}

/** Identifie le client à partir des en-têtes posés par Vercel/le proxy. */
export function getClientKey(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
