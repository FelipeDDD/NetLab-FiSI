import { IpDevice } from '../engine/ipdevice';
import { networkOf, parseCidr, parseIp } from '../engine/ip';
import { restoreNetwork, type SaveFile } from '../engine/serialize';
import { validateSave } from '../engine/validateSave';
import { validateDhcpPool } from '../engine/dhcpPools';
import { disposeNetwork } from '../engine/networkLifecycle';
import type { ExerciseDraft } from './types';

// Fail closed at this development boundary, including for JSON produced by a future generator.
type Obj = Record<string, unknown>;
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function object(value: unknown, path: string): Obj {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${path}: expected object`);
  return value as Obj;
}
function text(value: unknown, path: string): string {
  requireValue(typeof value === 'string' && value.trim(), `${path}: required text`);
  return value;
}
function list(value: unknown, path: string, nonempty = true): unknown[] {
  requireValue(Array.isArray(value) && (!nonempty || value.length), `${path}: expected ${nonempty ? 'nonempty ' : ''}array`);
  return value;
}
function choice(value: unknown, choices: readonly unknown[], path: string) {
  requireValue(choices.includes(value), `${path}: unsupported value ${String(value)}`);
}
function unique(values: string[], path: string) {
  requireValue(new Set(values).size === values.length, `${path}: duplicate ID/name`);
}
function ip(value: unknown, path: string) {
  requireValue(parseIp(text(value, path)) !== null, `${path}: invalid IPv4`);
}
function cidr(value: unknown, path: string, subnet = false) {
  const parsed = parseCidr(text(value, path));
  requireValue(parsed && (!subnet || parsed.addr === networkOf(parsed.addr, parsed.prefix)), `${path}: invalid ${subnet ? 'network' : 'CIDR'}`);
}

function topology(value: unknown, path: string): SaveFile {
  validateSave(value);
  requireValue(!value.lab && !value.labProgress, `${path}: independent exercises must not carry Lab metadata`);
  value.devices.forEach(d => text(d.name, `${path}.device.name`));
  // restoreNetwork checks actual factory capacities, endpoints, occupied ports and media.
  const net = restoreNetwork(structuredClone(value));
  try {
    for (const saved of value.devices) {
      const d = net.devices.get(saved.id)!;
      requireValue(saved.ifaces.length === d.interfaces.length, `${path}/${saved.id}: author a complete interface list`);
      for (const r of saved.routes) {
        requireValue(d.getInterface(r.dev), `${path}/${saved.id}: unknown route interface ${r.dev}`);
        cidr(r.dest, `${path}/${saved.id}.route`, true);
      }
      for (const port of Object.keys(saved.vlans ?? {})) requireValue(d.getInterface(port), `${path}/${saved.id}: unknown VLAN interface`);
      if (d instanceof IpDevice) {
        for (const [name, pool] of d.configuredDhcpPools()) {
          requireValue(d.getInterface(name), `${path}/${saved.id}: unknown DHCP interface`);
          const error = validateDhcpPool(d, name, pool);
          requireValue(!error, `${path}/${saved.id}/${name}: ${error}`);
        }
      }
    }
  } finally { disposeNetwork(net); }
  return value;
}

function check(value: unknown, file: SaveFile, path: string) {
  const c = object(value, path);
  requireValue(c.resolveBy === 'id', `${path}: exercise checks must resolve devices by stable ID`);
  const endpoint = (field: string) => {
    const id = text(c[field], `${path}.${field}`);
    const d = file.devices.find(d => d.id === id);
    requireValue(d && d.kind !== 'switch' && d.kind !== 'ap', `${path}.${field}: unknown or non-IP device ID ${id}`);
    return d;
  };
  const target = () => {
    requireValue((c.toAddr !== undefined) !== (c.toDevice !== undefined), `${path}: provide exactly one target`);
    if (c.toDevice !== undefined) endpoint('toDevice');
    else ip(c.toAddr, `${path}.toAddr`);
  };
  switch (c.type) {
    case 'iface-ip': {
      const d = endpoint('device');
      requireValue(d.ifaces.some(i => i.name === c.iface), `${path}: unknown interface`);
      requireValue(!(c.cidr !== undefined && c.inSubnet !== undefined), `${path}: ambiguous address check`);
      if (c.cidr !== undefined) cidr(c.cidr, path);
      if (c.inSubnet !== undefined) cidr(c.inSubnet, path, true);
      break;
    }
    case 'default-route': endpoint('device'); if (c.via !== undefined) ip(c.via, path); break;
    case 'forwarding': endpoint('device'); requireValue(typeof c.expect === 'boolean', `${path}: expected boolean`); break;
    case 'fw-policy': endpoint('device'); choice(c.hook, ['input', 'forward', 'output'], path); choice(c.policy, ['accept', 'drop'], path); break;
    case 'ping': endpoint('from'); target(); choice(c.expect, ['success', 'fail'], path); break;
    case 'tcp':
      endpoint('from'); target(); choice(c.expect, ['open', 'refused', 'filtered'], path);
      requireValue(typeof c.port === 'number' && Number.isInteger(c.port) && c.port >= 1 && c.port <= 65535, `${path}: invalid TCP port`); break;
    case 'dns':
      endpoint('from'); text(c.name, path); choice(c.expect, ['resolves', 'nxdomain'], path);
      if (c.addr !== undefined) { ip(c.addr, path); requireValue(c.expect === 'resolves', `${path}: NXDOMAIN cannot have an address`); }
      break;
    case 'http': {
      endpoint('from'); choice(c.expect, ['ok', 'fail'], path);
      const raw = text(c.url, path), url = new URL(raw);
      requireValue(url.protocol === 'http:' && !url.username && !url.password && !url.hash && !url.search, `${path}: only plain HTTP supported`);
      requireValue(!url.hostname.includes(':'), `${path}: IPv6 not supported`);
      if (c.contains !== undefined) { text(c.contains, path); requireValue(c.expect === 'ok', `${path}: content requires success`); }
      break;
    }
    default: throw new Error(`${path}: unsupported engine check ${String(c.type)}`);
  }
}

/** Structural/engine compatibility only. It neither executes solutions nor approves content. */
export function validateDraft(value: unknown): asserts value is ExerciseDraft {
  const d = object(value, 'draft');
  requireValue(/^[a-z][a-z0-9-]+$/.test(text(d.id, 'id')), 'id: use a stable slug');
  requireValue(Number.isInteger(d.contentVersion) && (d.contentVersion as number) > 0, 'contentVersion: positive integer required');
  choice(d.status, ['draft'], 'status');
  choice(d.category, ['ipv4', 'routing', 'dhcp', 'dns-http', 'firewall'], 'category');
  choice(d.difficulty, ['beginner', 'intermediate', 'advanced'], 'difficulty');
  const student = object(d.student, 'student'), review = object(d.review, 'review');
  for (const field of ['title', 'description', 'task']) text(student[field], `student.${field}`);
  const objectives = list(student.learningObjectives, 'objectives').map(v => {
    const o = object(v, 'objective'); text(o.text, 'objective.text'); return text(o.id, 'objective.id');
  });
  unique(objectives, 'objectives');
  const requirements = list(student.requirements, 'requirements').map(v => {
    const r = object(v, 'requirement'); text(r.text, 'requirement.text');
    choice(r.evidence, ['final', 'historical'], 'requirement.evidence');
    for (const id of list(r.objectiveIds, 'objectiveIds')) requireValue(objectives.includes(text(id, 'objectiveId')), 'unknown objective reference');
    return { id: text(r.id, 'requirement.id'), evidence: r.evidence, objectiveIds: r.objectiveIds as string[] };
  });
  unique(requirements.map(r => r.id), 'requirements');
  for (const id of objectives) requireValue(requirements.some(r => r.objectiveIds.includes(id)), `unassessed objective ${id}`);
  const initial = topology(student.initialTopology, 'initial');
  const reference = object(review.reference, 'reference');
  text(reference.explanation, 'reference.explanation');
  const solved = topology(reference.topology, 'reference');
  for (const raw of list(reference.commands, 'commands', false)) {
    const cmd = object(raw, 'command'); text(cmd.line, 'command.line');
    requireValue(solved.devices.some(d => d.id === cmd.device && !['ap', 'switch', 'smartphone'].includes(d.kind)), 'command: unknown device or no terminal');
  }
  const assessments = list(review.assessments, 'assessments').map(v => {
    const a = object(v, 'assessment'), id = text(a.id, 'assessment.id');
    const r = requirements.find(r => r.id === a.requirementId);
    requireValue(r, `${id}: unknown requirement`);
    choice(a.kind, ['engine', 'manual'], id);
    if (a.kind === 'engine') {
      requireValue(r.evidence === 'final', `${id}: historical evidence cannot be inferred from a final-state probe`);
      check(a.check, initial, id); check(a.check, solved, id);
    } else { text(a.procedure, `${id}.procedure`); text(a.reason, `${id}.reason`); }
    return { id, requirementId: r.id };
  });
  unique(assessments.map(a => a.id), 'assessments');
  for (const r of requirements) requireValue(assessments.some(a => a.requirementId === r.id), `unassessed requirement ${r.id}`);
  for (const raw of list(review.alternatives, 'alternatives')) {
    const a = object(raw, 'alternative'); text(a.description, 'alternative.description'); text(a.rationale, 'alternative.rationale');
  }
  for (const field of ['rejectionCases', 'limitations']) for (const v of list(review[field], field)) text(v, field);
}

export function validateDraftCollection(values: unknown): string[] {
  const issues: string[] = [], ids = new Set<string>();
  if (!Array.isArray(values) || !values.length) return ['collection: nonempty array required'];
  values.forEach((value, index) => {
    try {
      validateDraft(value);
      requireValue(!ids.has(value.id), `duplicate exercise ID ${value.id}`);
      ids.add(value.id);
    } catch (error) { issues.push(`[${index}] ${error instanceof Error ? error.message : String(error)}`); }
  });
  return issues;
}
