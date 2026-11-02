import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { BaileysReminderProvider, baileysConfig } from './baileys-provider';
import { ReminderNotAccepted, reminderRuntime } from './reminder-provider';

describe('Baileys local HTTP adapter (simulated transport only)', () => {
  let directory: string, provider: BaileysReminderProvider, fetchMock: jest.SpyInstance;
  const message = { attemptId: randomUUID(), phoneE164: '+5491100000000', text: 'Fictitious reminder' };
  const messageId = `3EB0${'A'.repeat(36)}`;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'calendary-adapter-'));
    await writeFile(join(directory, 'token'), randomBytes(32).toString('base64url'));
    provider = new BaileysReminderProvider({ url: 'http://127.0.0.1:3011', tokenFile: join(directory, 'token') });
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(async () => {
    provider.onModuleDestroy();
    fetchMock.mockRestore();
    await rm(directory, { recursive: true, force: true });
  });
  const response = (body: any) => ({ ok: true, json: async () => body }) as Response;
  it('validates local configuration, keeps explicit defaults and rejects remote/credential URLs', () => {
    expect(reminderRuntime({}).provider).toBe('disabled');
    expect(reminderRuntime({ REMINDERS_PROVIDER: 'baileys' }).provider).toBe('baileys');
    for (const url of [
      'https://127.0.0.1:3011',
      'http://example.test',
      'http://user:secret@127.0.0.1',
      'http://127.0.0.1/path',
    ])
      expect(() => baileysConfig({ WHATSAPP_BRIDGE_URL: url, WHATSAPP_BRIDGE_TOKEN_FILE: 'local' })).toThrow();
    expect(() => baileysConfig({})).toThrow();
  });
  it('refreshes connection privately, expires status and treats unreachable service as unavailable', async () => {
    fetchMock.mockResolvedValue(response({ state: 'connected', available: true, secret: 'ignored' }));
    await provider.refresh();
    expect(provider.available()).toBe(true);
    expect(provider.connectionStatus()).toEqual({ state: 'connected' });
    const time = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11000);
    expect(provider.available()).toBe(false);
    time.mockRestore();
    fetchMock.mockRejectedValue(new Error('private details'));
    await provider.refresh();
    expect(provider.connectionStatus()).toEqual({ state: 'unreachable' });
  });
  it('requires correlated acceptance and sends a single authenticated request without redirects', async () => {
    fetchMock.mockResolvedValue(response({ attemptId: message.attemptId, state: 'accepted', messageId }));
    expect(await provider.send(message)).toEqual({ accepted: true, messageId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    expect(options.headers.Authorization).toMatch(/^Bearer /);
    fetchMock.mockResolvedValue(response({ attemptId: randomUUID(), state: 'accepted', messageId }));
    await expect(provider.send(message)).rejects.toThrow('Unknown WhatsApp result');
  });
  it('retries only explicit proven non-acceptance; uncertain/network failures remain unknown', async () => {
    fetchMock.mockResolvedValue(response({ attemptId: message.attemptId, state: 'not_accepted', retryable: true }));
    await expect(provider.send(message)).rejects.toEqual(new ReminderNotAccepted(true));
    fetchMock.mockResolvedValue(response({ attemptId: message.attemptId, state: 'uncertain' }));
    await expect(provider.send(message)).rejects.not.toBeInstanceOf(ReminderNotAccepted);
    fetchMock.mockRejectedValue(new Error('network-lost'));
    await expect(provider.send(message)).rejects.not.toBeInstanceOf(ReminderNotAccepted);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
