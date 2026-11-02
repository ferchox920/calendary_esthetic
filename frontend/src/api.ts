export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// getRandomValues is available over LAN HTTP, where randomUUID may be absent.
export function requestKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function api<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': key ?? requestKey() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'No pudimos conectar con la agenda. Revisá la conexión y volvé a intentar.'); }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (response.ok && data === null) throw new ApiError(0, 'La agenda no está disponible. Verificá que la API esté en ejecución.');
  if (!response.ok) {
    const message = data?.message;
    throw new ApiError(response.status, response.status === 401 ? 'La sesión venció o los datos de acceso son incorrectos.' : Array.isArray(message) ? message.join('. ') : typeof message === 'string' ? message : 'No pudimos completar la operación. Volvé a intentar.');
  }
  return data as T;
}
