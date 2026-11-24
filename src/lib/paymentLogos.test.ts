import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentLogoMeta, PAYMENT_LOGO_META } from './paymentLogos';

describe('paymentLogos metadata', () => {
  it('provides exact official alt text and brand fallback colors for all 4 methods', () => {
    assert.equal(PAYMENT_LOGO_META.bkash.alt, 'bKash');
    assert.equal(PAYMENT_LOGO_META.nagad.alt, 'Nagad');
    assert.equal(PAYMENT_LOGO_META.rocket.alt, 'Rocket');
    assert.equal(PAYMENT_LOGO_META.upay.alt, 'Upay');

    assert.equal(getPaymentLogoMeta('bkash').brandColor, '#E2136E');
    assert.equal(getPaymentLogoMeta('nagad').brandColor, '#E04F16');
    assert.equal(getPaymentLogoMeta('rocket').brandColor, '#892B91');
    assert.equal(getPaymentLogoMeta('upay').brandColor, '#005BAC');
  });
});
