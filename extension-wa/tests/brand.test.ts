import { describe, expect, it } from 'vitest';
import { readBrandCountry } from '../src/features/automation/infrastructure/brand';

function folderWith(files: Record<string, string>) {
  return {
    async getFileHandle(name: string) {
      if (!(name in files)) throw new DOMException('Not found', 'NotFoundError');
      return { getFile: async () => ({ text: async () => files[name] }) };
    },
  };
}

describe('readBrandCountry', () => {
  it('reads country from brand.json', async () => {
    expect(await readBrandCountry(folderWith({ 'brand.json': '{"country": " Perú "}' }))).toBe('Perú');
  });

  it('returns null when brand.json is missing', async () => {
    expect(await readBrandCountry(folderWith({}))).toBeNull();
  });

  it('returns null when country is empty or the JSON is invalid', async () => {
    expect(await readBrandCountry(folderWith({ 'brand.json': '{"country": ""}' }))).toBeNull();
    expect(await readBrandCountry(folderWith({ 'brand.json': '{' }))).toBeNull();
  });
});
