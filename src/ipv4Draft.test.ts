import { expect, it } from 'vitest';
import { ipToString, maskOf } from './engine/ip';
import { emptyIpv4, parseStaticIpv4 } from './engine/ipv4Config';
import { editIpv4Draft, newIpv4Draft, normalizeIpv4Shortcut, parseIpv4Draft, syncIpv4Draft } from './ipv4Draft';

it('accepts all CIDR prefixes /0 through /32 and fills the decimal mask without changing the source', () => {
  for (let prefix = 0; prefix <= 32; prefix++) {
    const draft = editIpv4Draft(newIpv4Draft(emptyIpv4('unconfigured')), 'ip', `192.168.1.10/${prefix}`);
    expect(draft.fields.mask).toBe(ipToString(maskOf(prefix)));
    expect(draft.fields.ip).toBe(`192.168.1.10/${prefix}`);
    expect(parseIpv4Draft(draft.fields)?.ip?.prefix).toBe(prefix);
    expect(draft.source).toEqual(emptyIpv4('unconfigured'));
    const withoutCidr = editIpv4Draft(editIpv4Draft(draft, 'ip', '192.168.1.10'), 'mask', `/${prefix}`);
    expect(parseIpv4Draft(withoutCidr.fields)).toEqual(parseIpv4Draft(draft.fields));
  }
});

it('consumes valid IP/prefix shortcuts without losing the configured subnet', () => {
  for (let prefix = 0; prefix <= 32; prefix++) {
    const draft = editIpv4Draft(newIpv4Draft(emptyIpv4('unconfigured')), 'ip', `192.168.1.10/${prefix}`);
    const fields = normalizeIpv4Shortcut(draft.fields);
    expect(fields.ip).toBe('192.168.1.10');
    expect(fields.mask).toBe(ipToString(maskOf(prefix)));
    expect(parseIpv4Draft(fields)).toEqual(parseIpv4Draft(draft.fields));
  }
});

it('does not eat the first prefix digit or erase incomplete/invalid shortcuts', () => {
  const draft = newIpv4Draft(emptyIpv4('unconfigured'));
  const firstDigit = editIpv4Draft(draft, 'ip', '192.168.1.10/2');
  expect(normalizeIpv4Shortcut(firstDigit.fields, false)).toBe(firstDigit.fields);
  const complete = editIpv4Draft(firstDigit, 'ip', firstDigit.fields.ip + '4');
  expect(normalizeIpv4Shortcut(complete.fields, false)).toMatchObject({ ip: '192.168.1.10', mask: '255.255.255.0' });
  for (const text of ['192.168.1.10/', '192.168.1.10/33', '192.168.1.10/240', '192.168.1.999/24']) {
    const fields = editIpv4Draft(draft, 'ip', text).fields;
    expect(normalizeIpv4Shortcut(fields)).toBe(fields);
  }
});

it('keeps partial/invalid addresses and prefixes in the draft without producing a configuration', () => {
  const original = parseStaticIpv4('192.168.1.10', '24', '', '')!;
  for (const text of ['192.', '192.168.1.', '192.168.1.10/', '192.168.1.10/-1', '192.168.1.10/33', '192.168.1.10/2.4', '192.168.1.999/24']) {
    const draft = editIpv4Draft(newIpv4Draft(original), 'ip', text);
    expect(draft.fields.ip).toBe(text); expect(draft.source).toEqual(original);
    expect(parseIpv4Draft(draft.fields)).toBeNull();
    expect(draft.fields.mask).toBe('255.255.255.0');
  }
  for (const mask of ['/', '/33', '-1', '255.0.255.0', '255.255.']) {
    expect(parseIpv4Draft(editIpv4Draft(newIpv4Draft(original), 'mask', mask).fields)).toBeNull();
  }
});

it('lets an explicit mask replace an earlier CIDR and clears optional gateway/DNS atomically', () => {
  let draft = editIpv4Draft(newIpv4Draft(parseStaticIpv4('192.168.1.10', '24', '192.168.1.1', '10.0.0.2')!), 'ip', '192.168.1.10/25');
  draft = editIpv4Draft(draft, 'mask', '/26');
  expect(draft.fields.ip).toBe('192.168.1.10');
  draft = editIpv4Draft(editIpv4Draft(draft, 'gateway', ''), 'dns', '');
  expect(parseIpv4Draft(draft.fields)).toMatchObject({ ip: { prefix: 26 }, gateway: null, dns: null });
});

it('shows external edits/Undo immediately after a save while protecting an actual unfinished draft', () => {
  const config = parseStaticIpv4('192.168.1.10', '24', '', '')!;
  const changed = parseStaticIpv4('192.168.1.20', '24', '', '')!;
  const typing = editIpv4Draft(newIpv4Draft(config), 'ip', '192.168.1.10/24');
  const committed = { ...typing, dirty: false };
  expect(syncIpv4Draft(committed, config)).toBe(committed); // Preserve representation and cursor.
  expect(syncIpv4Draft(committed, changed).fields.ip).toBe('192.168.1.20');
  const stale = syncIpv4Draft(typing, changed);
  expect(stale.stale).toBe(true); expect(stale.fields.ip).toBe('192.168.1.10/24');
  expect(stale.source).toEqual(config);
});

it('maps an entirely empty manual form to Unconfigured, but rejects incomplete forms', () => {
  const fields = newIpv4Draft(emptyIpv4('unconfigured')).fields;
  expect(parseIpv4Draft(fields)).toEqual(emptyIpv4('unconfigured'));
  expect(parseIpv4Draft({ ...fields, mask: '/24' })).toBeNull();
  expect(parseIpv4Draft({ ...fields, ip: '192.168.1.10' })).toBeNull();
  expect(parseIpv4Draft({ ...fields, dns: '10.0.0.1' })).toBeNull();
});
