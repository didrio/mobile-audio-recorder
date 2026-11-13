import type { Edit } from './edit-changes';
import { emptyHistory, HISTORY_LIMIT, pushEdit, redoStep, undoStep } from './edit-history';

const edit = (label: string): Edit => ({ label, changes: [] });

describe('edit history', () => {
  it('undoes the newest edit first and redoes in the original order', () => {
    let history = pushEdit(pushEdit(emptyHistory, edit('one')), edit('two'));

    const undoTwo = undoStep(history)!;
    expect(undoTwo.edit.label).toBe('two');
    const undoOne = undoStep(undoTwo.history)!;
    expect(undoOne.edit.label).toBe('one');
    expect(undoStep(undoOne.history)).toBeNull();

    history = undoOne.history;
    const redoOne = redoStep(history)!;
    expect(redoOne.edit.label).toBe('one');
    expect(redoStep(redoOne.history)!.edit.label).toBe('two');
  });

  it('forgets the redo steps when a new edit is made', () => {
    const undone = undoStep(pushEdit(emptyHistory, edit('one')))!.history;
    const history = pushEdit(undone, edit('two'));

    expect(redoStep(history)).toBeNull();
    expect(history.past.map((e) => e.label)).toEqual(['two']);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    let history = emptyHistory;
    for (let index = 0; index < HISTORY_LIMIT + 5; index++) {
      history = pushEdit(history, edit(String(index)));
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.label).toBe('5');
  });
});
