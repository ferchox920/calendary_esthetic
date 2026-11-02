import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgendaStore } from '../agenda/agenda-store.service';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { CONTROL_REASONS, LINK_STATES, WHATSAPP_STATES, WhatsAppGateway } from './whatsapp.gateway';
import { WhatsAppLinkDto } from './whatsapp.dto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function linkMetadata(value: any) {
  if (
    !value ||
    !uuid.test(value.id) ||
    !['qr', 'code'].includes(value.mode) ||
    !LINK_STATES.includes(value.state) ||
    (['pending', 'ready'].includes(value.state) &&
      (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))) ||
    !(value.expiresAt === null || (typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))))
  )
    throw new ServiceUnavailableException('Estado de vinculación inválido');
  return { id: value.id, mode: value.mode, state: value.state, expiresAt: value.expiresAt };
}
function receipt(value: any, commandId: string) {
  if (
    !value ||
    value.commandId !== commandId ||
    !['completed', 'rejected', 'uncertain', 'processing'].includes(value.state) ||
    (value.linkId !== undefined && value.linkId !== commandId) ||
    (value.reason !== undefined && !CONTROL_REASONS.includes(value.reason)) ||
    (value.remoteLogout !== undefined && !['requested', 'unconfirmed', 'not_needed'].includes(value.remoteLogout))
  )
    throw new ServiceUnavailableException('Resultado del comando inválido');
  return {
    commandId,
    state: value.state === 'processing' ? 'uncertain' : value.state,
    ...(value.linkId ? { linkId: value.linkId } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
    ...(value.remoteLogout ? { remoteLogout: value.remoteLogout } : {}),
  };
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly store: AgendaStore,
    private readonly gateway: WhatsAppGateway
  ) {}
  async status() {
    const result = await this.gateway.status();
    if (
      !result ||
      !WHATSAPP_STATES.includes(result.state) ||
      typeof result.linked !== 'boolean' ||
      typeof result.available !== 'boolean'
    )
      throw new ServiceUnavailableException('Estado de WhatsApp inválido');
    return {
      state: result.state,
      linked: result.linked,
      available: result.available,
      link: result.link == null ? null : linkMetadata(result.link),
    };
  }
  async challenge(id: string) {
    const result = await this.gateway.challenge(id),
      safe = linkMetadata(result);
    if (safe.id !== id) throw new ServiceUnavailableException('Vinculación inválida');
    // Expired material is never returned, including after a lost connection or restart.
    if (safe.state !== 'ready' || Date.parse(safe.expiresAt) <= Date.now()) return safe;
    if (safe.mode === 'code' && typeof result.code === 'string' && /^\d{4}-\d{4}$/.test(result.code))
      return { ...safe, code: result.code };
    if (
      safe.mode === 'qr' &&
      typeof result.qrDataUrl === 'string' &&
      result.qrDataUrl.length <= 50000 &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.qrDataUrl)
    )
      return { ...safe, qrDataUrl: result.qrDataUrl };
    return safe;
  }
  async command(
    user: JwtPayload,
    key: string,
    action: 'link' | 'reconnect' | 'disconnect',
    dto: WhatsAppLinkDto | Record<string, never>
  ) {
    this.gateway.ensureConfigured();
    if (action === 'link' && (dto as WhatsAppLinkDto).mode === 'qr' && (dto as WhatsAppLinkDto).phoneE164 !== undefined)
      throw new BadRequestException('El teléfono se usa únicamente para vincular por código');
    const operation = `whatsapp.${action}`;
    let created = false;
    // Commit only safe command metadata before network I/O. No pairing secret is persisted in PostgreSQL.
    const registered = await this.store.write(user.id, operation, key, dto, async (m, _settings, requestId) => {
      const [owner] = await m.query('SELECT active,"sessionVersion" FROM owner_account WHERE id=$1 FOR UPDATE', [
        user.id,
      ]);
      if (!owner?.active || owner.sessionVersion !== user.sessionVersion) throw new UnauthorizedException();
      const response = { commandId: randomUUID(), state: 'registered' };
      await this.store.audit(
        m,
        user.id,
        'whatsapp',
        response.commandId,
        `${action}-requested`,
        null,
        response,
        requestId
      );
      created = true;
      return response;
    });
    if (['completed', 'rejected'].includes(registered.state)) return registered;
    let result;
    try {
      // Retries query the receipt; they do not repeat a potentially completed logout/link/reset.
      result = receipt(
        created
          ? await this.gateway.command({ commandId: registered.commandId, action, ...dto })
          : await this.gateway.receipt(registered.commandId),
        registered.commandId
      );
      if (action === 'link' && result.state === 'completed' && result.linkId !== registered.commandId)
        throw new ServiceUnavailableException('Vinculación inválida');
    } catch {
      result = { commandId: registered.commandId, state: 'uncertain' };
    }
    await this.store.db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const [current] = await m.query(
        'SELECT response FROM idempotency_record WHERE "ownerId"=$1 AND operation=$2 AND key=$3 FOR UPDATE',
        [user.id, operation, key]
      );
      if (['completed', 'rejected'].includes(current?.response?.state)) {
        result = current.response;
        return;
      }
      if (JSON.stringify(current?.response) !== JSON.stringify(result)) {
        await m.query('UPDATE idempotency_record SET response=$4 WHERE "ownerId"=$1 AND operation=$2 AND key=$3', [
          user.id,
          operation,
          key,
          JSON.stringify(result),
        ]);
        await this.store.audit(
          m,
          user.id,
          'whatsapp',
          registered.commandId,
          `${action}-${result.state}`,
          current.response,
          result,
          randomUUID()
        );
      }
    });
    return result;
  }
}
