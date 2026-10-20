import { expect, it } from 'vitest';
import { applyMovement, emptyTopologyHistory, recordMovement, type MoveOperation } from './topologyHistory';

it('limits history to 50 independent typed operations and clears redo only for effective edits', () => {
  let history = emptyTopologyHistory();
  for (let x = 0; x < 55; x++) history = recordMovement(history, [{ id: 'a', before: { x, y: 0 }, after: { x: x + 1, y: 0 } }]);
  expect(history.past).toHaveLength(50);
  expect((history.past[0] as MoveOperation).changes[0].before.x).toBe(5);
  const old = history.past.at(-1)!;
  history = { past: history.past.slice(0, -1), future: [old] };
  expect(recordMovement(history, [{ id: 'a', before: { x: 1, y: 0 }, after: { x: 1, y: 0 } }])).toBe(history);
  const before = { x: 4, y: 2 }, after = { x: 9, y: 2 };
  const next = recordMovement(history, [{ id: 'a', before, after }]);
  before.x = 100; after.y = 100;
  expect(next.future).toEqual([]);
  expect((next.past.at(-1) as MoveOperation)?.changes[0]).toEqual({ id: 'a', before: { x: 4, y: 2 }, after: { x: 9, y: 2 } });
});

it('applies a multi-node action atomically without touching unrelated node data', () => {
  const history = recordMovement(emptyTopologyHistory(), ['a', 'b'].map((id) => ({ id, before: { x: 0, y: 0 }, after: { x: 10, y: 20 } })));
  const op = history.past[0] as MoveOperation;
  expect(op.label).toBe('Move 2 devices');
  const nodes = ['a', 'b', 'c'].map((id) => ({ id, position: { x: 10, y: 20 }, data: { label: id } }));
  const undone = applyMovement(nodes, op, 'undo')!;
  expect(undone[0].position).toEqual({ x: 0, y: 0 });
  expect(undone[0].data).toBe(nodes[0].data);
  expect(undone[2]).toBe(nodes[2]);
  expect(applyMovement(undone, op, 'redo')).toEqual(nodes);
  expect(applyMovement(nodes.slice(1), op, 'undo')).toBeNull();
  expect(applyMovement([{ ...nodes[0], position: { x: 99, y: 0 } }, ...nodes.slice(1)], op, 'undo')).toBeNull();
});
