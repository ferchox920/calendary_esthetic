import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { baileysConfig } from './baileys-provider';

export const WHATSAPP_STATES = [
  'unlinked',
  'connected',
  'connecting',
  'reconnecting',
  'disconnected',
  'logged_out',
  'stopped',
  'storage_error',
  'code_ready',
  'qr_ready',
  'link_expired',
  'disconnecting',
];
export const LINK_STATES = ['pending', 'ready', 'connected', 'expired', 'failed', 'canceled'];
export const CONTROL_REASONS = [
  'busy',
  'already_linked',
  'link_in_progress',
  'not_linked',
  'invalid_request',
  'control_unknown',
  'service_interrupted',
];

@Injectable()
export class WhatsAppGateway {
  configured() {
    return !!process.env.WHATSAPP_BRIDGE_TOKEN_FILE;
  }
  ensureConfigured() {
    if (!this.configured()) throw new ServiceUnavailableException('El puente de WhatsApp no está configurado');
  }
  private async request(path: string, body?: unknown): Promise<any> {
    this.ensureConfigured();
    try {
      const config = baileysConfig(process.env),
        token = (await readFile(config.tokenFile, 'utf8')).trim();
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('invalid token');
      const response = await fetch(`${config.url}${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(body ? 17000 : 2000),
      });
      if (response.status === 404) throw new NotFoundException('Vinculación o comando inexistente en el puente');
      if (!response.ok) throw new Error('bridge failure');
      return await response.json();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('No se pudo consultar el puente de WhatsApp');
    }
  }
  status() {
    return this.request('/status');
  }
  command(body: unknown) {
    return this.request('/controls', body);
  }
  receipt(commandId: string) {
    return this.request(`/controls/${commandId}`);
  }
  challenge(linkId: string) {
    return this.request(`/links/${linkId}`);
  }
  sendReceipt(attemptId: string) {
    return this.request(`/attempts/${attemptId}`);
  }
}
