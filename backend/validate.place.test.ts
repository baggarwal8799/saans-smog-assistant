// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { body } from '../test/apiHelpers.js';
import { parseAssistantRequest, ValidationError } from './validate.js';

vi.mock('../core/place.js', () => ({ toPlace: () => null }));

describe('parseAssistantRequest: a place toPlace refuses', () => {
  it('is a validation error, never a null place', () => {
    expect(() => parseAssistantRequest(body())).toThrow(ValidationError);
  });
});
