import { isPrivateAddress } from './net-guard';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '93.184.216.34'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );

  it.each(['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1'])(
    'treats IPv6 %s as private',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(true);
    },
  );

  it('treats a public IPv6 address as public', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('is not fooled by a hostname that merely looks like an IP', () => {
    expect(isPrivateAddress('192.168.1.1.evil.example')).toBe(false);
  });
});
