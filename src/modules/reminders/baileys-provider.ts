import { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { ReminderAccepted, ReminderMessage, ReminderNotAccepted, ReminderProvider } from './reminder-provider';

export function baileysConfig(env: NodeJS.ProcessEnv) {
  let url: URL;
  try {
    url = new URL(env.WHATSAPP_BRIDGE_URL || 'http://127.0.0.1:3011');
  } catch {
    throw new Error('Invalid local WhatsApp bridge configuration');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !env.WHATSAPP_BRIDGE_TOKEN_FILE
  )
    throw new Error('Invalid local WhatsApp bridge configuration');
  return { url: url.origin, tokenFile: env.WHATSAPP_BRIDGE_TOKEN_FILE };
}

// The ESM WhatsApp library and its credentials never enter the Nest process.
export class BaileysReminderProvider extends ReminderProvider implements OnApplicationBootstrap, OnModuleDestroy {
  readonly name = 'baileys';
  private timer?: ReturnType<typeof setInterval>;
  private checkedAt = 0;
  private connected = false;
  private refreshing = false;
  private connection = 'unreachable';
  constructor(private readonly config = baileysConfig(process.env)) {
    super();
  }
  async onApplicationBootstrap() {
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  available() {
    return this.connected && Date.now() - this.checkedAt < 10000;
  }
  connectionStatus() {
    return {
      state: this.available() ? 'connected' : this.connection === 'connected' ? 'unreachable' : this.connection,
    };
  }
  private async request(path: string, body?: ReminderMessage) {
    const token = (await readFile(this.config.tokenFile, 'utf8')).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Bridge unavailable');
    const response = await fetch(`${this.config.url}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? 17000 : 2000),
    });
    // Provider failures can contain private request data. Never propagate their details.
    if (!response.ok) throw new Error('Bridge unavailable');
    return response.json();
  }
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const result = await this.request('/status');
      const states = [
        'connected',
        'connecting',
        'reconnecting',
        'disconnected',
        'logged_out',
        'stopped',
        'storage_error',
        'unlinked',
        'qr_ready',
        'code_ready',
        'link_expired',
        'disconnecting',
      ];
      if (!states.includes(result.state) || typeof result.available !== 'boolean') throw new Error('Invalid status');
      this.connection = result.state;
      this.connected = result.state === 'connected' && result.available;
    } catch {
      this.connected = false;
      this.connection = 'unreachable';
    } finally {
      this.checkedAt = Date.now();
      this.refreshing = false;
    }
  }
  async send(message: ReminderMessage): Promise<ReminderAccepted> {
    // Do not retry HTTP POSTs: a dropped response can follow a successful send.
    try {
      const result = await this.request('/attempts', message);
      if (result.attemptId !== message.attemptId) throw new Error('Unknown result');
      if (result.state === 'not_accepted' && typeof result.retryable === 'boolean')
        throw new ReminderNotAccepted(result.retryable);
      if (
        result.state !== 'accepted' ||
        typeof result.messageId !== 'string' ||
        !/^3EB0[A-F0-9]{36}$/.test(result.messageId)
      )
        throw new Error('Unknown result');
      return { accepted: true, messageId: result.messageId };
    } catch (error) {
      if (error instanceof ReminderNotAccepted) throw error;
      throw new Error('Unknown WhatsApp result');
    }
  }
}
