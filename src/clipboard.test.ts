import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyIpv4, ipv4WithoutPrefix } from './clipboard';

afterEach(() => vi.unstubAllGlobals());

describe('copying IPv4 addresses', () => {
  it.each([
    ['192.168.1.10/24', '192.168.1.10'],
    ['10.0.0.1/8', '10.0.0.1'],
    ['0.0.0.0/0', '0.0.0.0'],
    ['255.255.255.255/32', '255.255.255.255'],
    [' 172.16.0.1 ', '172.16.0.1'],
  ])('copies only the IPv4 portion of %s', async (value, expected) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(ipv4WithoutPrefix(value)).toBe(expected);
    expect(await copyIpv4(value)).toBe(true);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(expected);
  });

  it.each(['', 'no address', '999.1.1.1/24', '10.0.0.1/33', '10.0.0.1/not-a-mask', '::1'])('does not copy invalid address %s', async (value) => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(ipv4WithoutPrefix(value)).toBeNull();
    expect(await copyIpv4(value)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([{}, { clipboard: {} }])('reports unavailable Clipboard API', async (navigator) => {
    vi.stubGlobal('navigator', navigator);
    expect(await copyIpv4('10.0.0.1/24')).toBe(false);
  });

  it('reports rejected permissions without an unhandled rejection', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });
    expect(await copyIpv4('10.0.0.1')).toBe(false);
  });

  it('handles synchronous Clipboard API errors', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => { throw new Error('SecurityError'); } } });
    expect(await copyIpv4('10.0.0.1')).toBe(false);
  });
});
