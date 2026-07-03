const { describe, it } = require('node:test');
const assert = require('node:assert');

const { classifyBill } = require('../src/services/ai');

describe('AI Classify', () => {
  it('should handle pure number input as fallback', async () => {
    const result = await classifyBill('12.5');
    assert.strictEqual(result.type, 'expense');
    assert.strictEqual(result.amount, 12.5);
  });

  it('should handle empty or garbled text gracefully', async () => {
    const result = await classifyBill('asdfghjkl');
    assert.strictEqual(result.category, '其他');
  });

  it('should return valid structure even on error', async () => {
    const result = await classifyBill('午饭花了20块钱');
    // Without real API key, this will hit the fallback
    assert.ok(result.type);
    assert.ok(typeof result.amount === 'number');
    assert.ok(result.category);
  });
});
