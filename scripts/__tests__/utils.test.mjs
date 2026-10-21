import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cn } from '../../src/lib/utils.ts';

describe('cn helper', () => {
  it('keeps the later of two conflicting padding classes', () => {
    assert.equal(cn('p-2 text-sm', 'p-4'), 'text-sm p-4');
  });

  it('drops false, undefined and null arguments', () => {
    assert.equal(cn('font-medium', false, undefined, null), 'font-medium');
  });

  it('keeps truthy conditional classes and drops falsy ones', () => {
    assert.equal(cn('rounded-lg', { hidden: false, block: true }), 'rounded-lg block');
  });
});
