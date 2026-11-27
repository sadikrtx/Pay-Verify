import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWebhookSecret } from './crypto';

test('generateWebhookSecret generates a 40-char mixed uppercase, lowercase, and digit secret using crypto.getRandomValues', () => {
  const sample = generateWebhookSecret(40);
  assert.equal(sample.length, 40);
  assert.match(sample, /^[A-Za-z0-9]{40}$/);
  assert.match(sample, /[A-Z]/, 'includes uppercase letters');
  assert.match(sample, /[a-z]/, 'includes lowercase letters');
  assert.match(sample, /[0-9]/, 'includes digits');

  const second = generateWebhookSecret(40);
  assert.equal(second.length, 40);
  assert.notEqual(sample, second);
});
