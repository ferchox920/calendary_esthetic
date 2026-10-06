import { BadRequestException, Injectable } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { CALENDAR_SCOPE, googleConfig } from './google-config';

export class GoogleProviderError extends Error {
  constructor(
    readonly status: number,
    readonly reason: 'authorization' | 'temporary' | 'not_found' | 'conflict' | 'invalid_request'
  ) {
    super(`Google: ${reason}`);
  }
}

@Injectable()
export class GoogleGateway {
  private client() {
    const config = googleConfig();
    return new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      transporterOptions: { timeout: 10000, retry: false },
    });
  }

  authorizationUrl(state: string, nonce: string, challenge: string, calendar: boolean) {
    const url = new URL(
      this.client().generateAuthUrl({
        scope: calendar ? ['openid', 'email', CALENDAR_SCOPE] : ['openid', 'email'],
        state,
        code_challenge: challenge,
        code_challenge_method: CodeChallengeMethod.S256,
        access_type: calendar ? 'offline' : 'online',
        prompt: calendar ? 'consent select_account' : 'select_account',
      })
    );
    url.searchParams.set('nonce', nonce);
    return url.toString();
  }

  async exchange(code: string, verifier: string) {
    try {
      const client = this.client();
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier,
        redirect_uri: googleConfig().redirectUri,
      });
      if (!tokens.id_token) throw new Error('Missing ID token');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: googleConfig().clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || !payload.email_verified || typeof (payload as any).nonce !== 'string') {
        throw new Error('Invalid identity');
      }
      return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        nonce: (payload as any).nonce as string,
        refreshToken: tokens.refresh_token,
        scopes: (tokens.scope || '').split(' '),
      };
    } catch {
      // Google/client-library errors may embed codes, tokens or request parameters.
      throw new BadRequestException('Google no pudo validar la autorización; inicia la conexión otra vez');
    }
  }

  async request(refreshToken: string, method: string, path: string, body?: unknown, etag?: string): Promise<any> {
    let accessToken: string;
    try {
      const client = this.client();
      client.setCredentials({ refresh_token: refreshToken });
      accessToken = (await client.getAccessToken()).token;
      if (!accessToken) throw new Error('Missing access token');
    } catch (error) {
      const detail = error as { response?: { status?: number; data?: { error?: string } } };
      const invalid = detail.response?.data?.error === 'invalid_grant' || detail.response?.status === 401;
      throw new GoogleProviderError(detail.response?.status || 503, invalid ? 'authorization' : 'temporary');
    }
    let response: globalThis.Response;
    try {
      response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(etag ? { 'If-Match': etag } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
    } catch {
      throw new GoogleProviderError(503, 'temporary');
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as any;
      const reason = detail.error?.errors?.[0]?.reason;
      const category =
        response.status === 401 ||
        (response.status === 403 && ['insufficientPermissions', 'authError', 'forbidden'].includes(reason))
          ? 'authorization'
          : response.status === 404 || response.status === 410
            ? 'not_found'
            : response.status === 409 || response.status === 412
              ? 'conflict'
              : response.status === 429 || response.status >= 500 || reason?.includes('LimitExceeded')
                ? 'temporary'
                : 'invalid_request';
      throw new GoogleProviderError(response.status, category);
    }
    return response.status === 204 ? null : response.json();
  }

  createCalendar(refreshToken: string, timezone: string) {
    return this.request(refreshToken, 'POST', 'calendars', {
      summary: 'Agenda de Gabriela',
      description: 'Calendario gestionado desde la agenda de Gabriela.',
      timeZone: timezone,
    });
  }

  async upsertEvent(refreshToken: string, calendarId: string, eventId: string, event: any) {
    const collection = `calendars/${encodeURIComponent(calendarId)}/events`;
    for (let attempt = 0; attempt < 3; attempt++) {
      let current: any;
      try {
        current = await this.request(refreshToken, 'GET', `${collection}/${eventId}`);
      } catch (error) {
        if (!(error instanceof GoogleProviderError) || error.reason !== 'not_found') throw error;
      }
      try {
        if (current) {
          const saved = current.extendedProperties?.private,
            incoming = event.extendedProperties.private;
          if (saved?.agendaEntryId !== incoming.agendaEntryId) throw new GoogleProviderError(409, 'invalid_request');
          // A late worker cannot overwrite an event already exported from newer local data.
          if (
            Number(saved.agendaEntryVersion) > Number(incoming.agendaEntryVersion) ||
            Number(saved.agendaSettingsVersion) > Number(incoming.agendaSettingsVersion)
          )
            return;
          if (!current.etag) throw new GoogleProviderError(502, 'temporary');
          await this.request(refreshToken, 'PATCH', `${collection}/${eventId}?sendUpdates=none`, event, current.etag);
        } else {
          await this.request(refreshToken, 'POST', `${collection}?sendUpdates=none`, { ...event, id: eventId });
        }
        return;
      } catch (error) {
        if (!(error instanceof GoogleProviderError) || error.reason !== 'conflict') throw error;
      }
    }
    throw new GoogleProviderError(409, 'conflict');
  }

  async revoke(refreshToken: string) {
    try {
      await this.client().revokeToken(refreshToken);
    } catch {
      throw new GoogleProviderError(503, 'temporary');
    }
  }
}
