import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

const privateFields = new Set([
  'password',
  'passwordHash',
  'otp',
  'otpExpiryTime',
  'sessionVersion',
  'refreshTokenEncrypted',
  'refreshToken',
  'verifierEncrypted',
  'nonceHash',
  'stateHash',
  'lockToken',
  'provisionToken',
]);

export function sanitizeResponse(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeResponse);
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateFields.has(key))
        .map(([key, item]) => [key, sanitizeResponse(item)])
    );
  }
  return value;
}

@Injectable()
export class PrivateResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    return next.handle().pipe(map(sanitizeResponse));
  }
}
