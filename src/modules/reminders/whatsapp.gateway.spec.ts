import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppGateway } from './whatsapp.gateway';

describe('WhatsApp management gateway (simulated HTTP only)', () => {
  let directory: string, mock: jest.SpyInstance;
  let previousToken: string | undefined, previousUrl: string | undefined;
  const gateway = new WhatsAppGateway();
  beforeEach(async () => {
    previousToken = process.env.WHATSAPP_BRIDGE_TOKEN_FILE;
    previousUrl = process.env.WHATSAPP_BRIDGE_URL;
    directory = await mkdtemp(join(tmpdir(), 'calendary-management-'));
    process.env.WHATSAPP_BRIDGE_URL = 'http://127.0.0.1:3011';
    process.env.WHATSAPP_BRIDGE_TOKEN_FILE = join(directory, 'token');
    await writeFile(process.env.WHATSAPP_BRIDGE_TOKEN_FILE, randomBytes(32).toString('base64url'));
    mock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(async () => {
    mock.mockRestore();
    await rm(directory, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.WHATSAPP_BRIDGE_TOKEN_FILE;
    else process.env.WHATSAPP_BRIDGE_TOKEN_FILE = previousToken;
    if (previousUrl === undefined) delete process.env.WHATSAPP_BRIDGE_URL;
    else process.env.WHATSAPP_BRIDGE_URL = previousUrl;
  });
  it('uses an independent token, bounded request and never follows redirects or retries a command', async () => {
    mock.mockResolvedValue({ ok: true, json: async () => ({ state: 'completed' }) });
    const command = { commandId: randomUUID(), action: 'link', mode: 'qr' };
    await gateway.command(command);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('http://127.0.0.1:3011/controls');
    expect(mock.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', body: JSON.stringify(command) });
    expect(mock.mock.calls[0][1].headers.Authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    mock.mockRejectedValue(new Error('private-fictitious-credential'));
    await expect(gateway.command(command)).rejects.toThrow('No se pudo consultar el puente de WhatsApp');
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('distinguishes absent volatile material/receipts from an unreachable bridge', async () => {
    mock.mockResolvedValue({ status: 404, ok: false });
    await expect(gateway.challenge(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    await expect(gateway.receipt(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    await expect(gateway.sendReceipt(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    expect(mock.mock.calls[2][1]).toMatchObject({ method: 'GET', body: undefined });
    mock.mockResolvedValue({ status: 500, ok: false });
    await expect(gateway.status()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('fails closed without configuration, with a damaged token or a remote bridge URL', async () => {
    delete process.env.WHATSAPP_BRIDGE_TOKEN_FILE;
    await expect(gateway.status()).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.WHATSAPP_BRIDGE_TOKEN_FILE = join(directory, 'token');
    await writeFile(process.env.WHATSAPP_BRIDGE_TOKEN_FILE, 'invalid');
    await expect(gateway.status()).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.WHATSAPP_BRIDGE_URL = 'http://remote.example.test';
    await expect(gateway.status()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mock).not.toHaveBeenCalled();
  });
});
