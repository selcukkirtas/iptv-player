import { hashSecret, verifySecret } from './secret-hash';

describe('secret hashing', () => {
  it('accepts the right PIN', async () => {
    const stored = await hashSecret('1234');
    await expect(verifySecret('1234', stored)).resolves.toBe(true);
  });

  it('rejects a wrong PIN', async () => {
    const stored = await hashSecret('1234');
    await expect(verifySecret('1235', stored)).resolves.toBe(false);
    await expect(verifySecret('', stored)).resolves.toBe(false);
    await expect(verifySecret('12345', stored)).resolves.toBe(false);
  });

  it('never stores the PIN itself', async () => {
    const stored = await hashSecret('987654');
    expect(stored).not.toContain('987654');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same PIN hashes differently every time', async () => {
    const a = await hashSecret('1234');
    const b = await hashSecret('1234');
    expect(a).not.toBe(b);
    await expect(verifySecret('1234', a)).resolves.toBe(true);
    await expect(verifySecret('1234', b)).resolves.toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['nonsense', 'not in the stored format'],
    ['scrypt$16384$salt', 'too few fields'],
    ['bcrypt$16384$c2FsdA==$aGFzaA==', 'unknown algorithm'],
    ['scrypt$abc$c2FsdA==$aGFzaA==', 'non-numeric cost'],
    ['scrypt$16384$c2FsdA==$', 'empty hash'],
  ])('rejects a malformed stored value (%s)', async (stored) => {
    await expect(verifySecret('1234', stored)).resolves.toBe(false);
  });
});
