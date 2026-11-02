import { receiptEvidence } from './reminder-reconciliation.service';
import { randomUUID } from 'node:crypto';

describe('Receipt evidence policy', () => {
  const attemptId = randomUUID(),
    messageId = `3EB0${'A'.repeat(36)}`;
  it('requires durable correlated acceptance with a valid message id', () => {
    const value = { attemptId, state: 'accepted', messageId, durable: true };
    expect(receiptEvidence(value, attemptId)).toBe('accepted');
    for (const invalid of [
      { ...value, attemptId: randomUUID() },
      { ...value, durable: false },
      { ...value, durable: undefined },
      { ...value, messageId: '' },
      { ...value, messageId: null },
      { ...value, messageId: 'invalid' },
    ])
      expect(receiptEvidence(invalid, attemptId)).toBeUndefined();
  });
  it('accepts explicit non-acceptance without treating it as permission to resend', () => {
    for (const retryable of [true, false])
      expect(receiptEvidence({ attemptId, state: 'not_accepted', retryable, durable: true }, attemptId)).toBe(
        'not_accepted'
      );
    expect(receiptEvidence({ attemptId, state: 'not_accepted', durable: true }, attemptId)).toBeUndefined();
  });
  it('does not infer non-acceptance from unknown or absent evidence', () => {
    for (const value of [
      null,
      {},
      { attemptId, durable: true, state: 'processing' },
      { attemptId, durable: true, state: 'uncertain' },
    ])
      expect(receiptEvidence(value, attemptId)).toBeUndefined();
  });
});
