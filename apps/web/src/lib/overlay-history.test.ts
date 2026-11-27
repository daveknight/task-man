import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  closeFileAction,
  closeLogAction,
  closeTaskAction,
  installOverlayHistory,
  logReturnAddress,
  openFileAction,
  openLogAction,
  openTaskAction,
  overlayHistoryEntries,
  parseOverlayPath,
  type HistoryHost,
  type OverlayHistoryState,
} from './overlay-history.ts';

const TODAY = '?today=2026-11-18';

function host(pathname: string, search = ''): HistoryHost & { stack: { state: OverlayHistoryState | null; url: string }[] } {
  const stack: { state: OverlayHistoryState | null; url: string }[] = [{ state: null, url: pathname + search }];
  let index = 0;
  const current = () => new URL(stack[index]!.url, 'http://task-man.local');
  return {
    stack,
    location: {
      get pathname() {
        return current().pathname;
      },
      get search() {
        return current().search;
      },
    },
    history: {
      get state() {
        return stack[index]!.state;
      },
      replaceState(state, _title, url) {
        stack[index] = { state, url };
      },
      pushState(state, _title, url) {
        stack.splice(index + 1);
        stack.push({ state, url });
        index += 1;
      },
    },
  };
}

describe('overlay address', () => {
  it('reads a task and a preview file from the path', () => {
    assert.deepEqual(parseOverlayPath('/'), { taskId: null, fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/completed'), { taskId: null, fileId: null, log: true });
    assert.deepEqual(parseOverlayPath('/completed/'), { taskId: null, fileId: null, log: true });
    assert.deepEqual(parseOverlayPath('/tasks/task-1'), { taskId: 'task-1', fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/tasks/task-1/files/file-1'), { taskId: 'task-1', fileId: 'file-1', log: false });
    assert.deepEqual(parseOverlayPath('/tasks/task%201/files/file%2F2'), { taskId: 'task 1', fileId: 'file/2', log: false });
  });

  it('ignores a path that is not a task, a preview, or the completed log', () => {
    assert.deepEqual(parseOverlayPath('/tasks'), { taskId: null, fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/tasks/'), { taskId: null, fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/tasks/task-1/files'), { taskId: null, fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/completed/extra'), { taskId: null, fileId: null, log: false });
    assert.deepEqual(parseOverlayPath('/design/board'), { taskId: null, fileId: null, log: false });
  });

  it('keeps the query string on every entry, with the board under a task and a preview', () => {
    assert.deepEqual(overlayHistoryEntries('/', TODAY), [{ overlay: 'board', path: '/', search: TODAY }]);
    assert.deepEqual(overlayHistoryEntries('/completed', TODAY), [
      { overlay: 'board', path: '/', search: TODAY },
      { overlay: 'log', path: '/completed', search: TODAY },
    ]);
    assert.deepEqual(overlayHistoryEntries('/tasks/task-1', TODAY), [
      { overlay: 'board', path: '/', search: TODAY },
      { overlay: 'task', path: '/tasks/task-1', search: TODAY },
    ]);
    assert.deepEqual(overlayHistoryEntries('/tasks/task-1/files/file-1', TODAY), [
      { overlay: 'board', path: '/', search: TODAY },
      { overlay: 'task', path: '/tasks/task-1', search: TODAY },
      { overlay: 'file', path: '/tasks/task-1/files/file-1', search: TODAY },
    ]);
  });

  it('leaves the design screens alone and sends a broken task path back to the board', () => {
    assert.equal(overlayHistoryEntries('/design/board', ''), null);
    assert.deepEqual(overlayHistoryEntries('/tasks/task-1/nope', TODAY), [{ overlay: 'board', path: '/', search: TODAY }]);
  });
});

describe('overlay history actions', () => {
  it('pushes a task from the board and replaces when another task is already open', () => {
    assert.deepEqual(openTaskAction({ taskId: null, fileId: null, log: false }, 'task-1', TODAY), {
      type: 'push',
      overlay: 'task',
      url: `/tasks/task-1${TODAY}`,
    });
    assert.deepEqual(openTaskAction({ taskId: 'task-1', fileId: null, log: false }, 'task-2', TODAY), {
      type: 'replace',
      overlay: 'task',
      url: `/tasks/task-2${TODAY}`,
    });
    assert.deepEqual(openTaskAction({ taskId: 'task-1', fileId: null, log: false }, 'task-1', TODAY), { type: 'none' });
    assert.deepEqual(openTaskAction({ taskId: 'task-1', fileId: 'file-1', log: false }, 'task-2', TODAY), { type: 'none' });
  });

  it('pushes a preview on the open task and does not record any other file', () => {
    assert.deepEqual(openFileAction({ taskId: 'task-1', fileId: null, log: false }, 'task-1', 'file-1', TODAY), {
      type: 'push',
      overlay: 'file',
      url: `/tasks/task-1/files/file-1${TODAY}`,
    });
    assert.deepEqual(openFileAction({ taskId: 'task-1', fileId: 'file-1', log: false }, 'task-1', 'file-2', TODAY), {
      type: 'replace',
      overlay: 'file',
      url: `/tasks/task-1/files/file-2${TODAY}`,
    });
    assert.deepEqual(openFileAction({ taskId: 'task-1', fileId: 'file-1', log: false }, 'task-1', 'file-1', TODAY), { type: 'none' });
    assert.deepEqual(openFileAction({ taskId: null, fileId: null, log: false }, 'task-1', 'file-1', TODAY), { type: 'none' });
  });

  it('closes the preview first, then the task, when those entries are ours', () => {
    assert.deepEqual(closeFileAction({ taskId: 'task-1', fileId: 'file-1', log: false }, { overlay: 'file' }, TODAY), { type: 'back', steps: 1 });
    assert.deepEqual(closeFileAction({ taskId: 'task-1', fileId: 'file-1', log: false }, null, TODAY), {
      type: 'replace',
      overlay: 'task',
      url: `/tasks/task-1${TODAY}`,
    });
    assert.deepEqual(closeTaskAction({ taskId: 'task-1', fileId: null, log: false }, { overlay: 'task' }, TODAY), { type: 'back', steps: 1 });
    assert.deepEqual(closeTaskAction({ taskId: 'task-1', fileId: 'file-1', log: false }, { overlay: 'file' }, TODAY), { type: 'back', steps: 2 });
    assert.deepEqual(closeTaskAction({ taskId: 'task-1', fileId: null, log: false }, null, TODAY), {
      type: 'replace',
      overlay: 'board',
      url: `/${TODAY}`,
    });
    assert.deepEqual(closeTaskAction({ taskId: null, fileId: null, log: false }, { overlay: 'board' }, TODAY), { type: 'none' });
    assert.deepEqual(closeFileAction({ taskId: 'task-1', fileId: null, log: false }, { overlay: 'task' }, TODAY), { type: 'none' });
  });

  it('pushes the completed log on the board or a task, and back returns there', () => {
    const board = { taskId: null, fileId: null, log: false };
    const task = { taskId: 'task-1', fileId: null, log: false };
    const log = { taskId: null, fileId: null, log: true };
    assert.deepEqual(openLogAction(board, TODAY), { type: 'push', overlay: 'log', url: `/completed${TODAY}` });
    assert.deepEqual(openLogAction(task, TODAY), { type: 'push', overlay: 'log', url: `/completed${TODAY}` });
    assert.deepEqual(openLogAction(log, TODAY), { type: 'none' });
    assert.deepEqual(closeLogAction(log, { overlay: 'log' }, TODAY), { type: 'back', steps: 1 });
    assert.deepEqual(closeLogAction(log, { overlay: 'log', logBack: task }, TODAY), { type: 'back', steps: 1 });
    assert.deepEqual(closeLogAction(log, null, TODAY), { type: 'replace', overlay: 'board', url: `/${TODAY}` });
    assert.deepEqual(closeLogAction(board, { overlay: 'board' }, TODAY), { type: 'none' });
    assert.deepEqual(logReturnAddress(null), board);
    assert.deepEqual(logReturnAddress({ overlay: 'log' }), board);
    assert.deepEqual(logReturnAddress({ overlay: 'log', logBack: task }), task);
    assert.deepEqual(logReturnAddress({ overlay: 'log', logBack: log }), board);
  });
});

describe('installOverlayHistory', () => {
  it('stacks the board under a task link so Back closes the task before leaving', () => {
    const page = host('/tasks/task-1', TODAY);
    installOverlayHistory(page);
    assert.deepEqual(
      page.stack.map((entry) => [entry.state?.overlay, entry.url]),
      [
        ['board', `/${TODAY}`],
        ['task', `/tasks/task-1${TODAY}`],
      ],
    );
    assert.equal(page.location.pathname, '/tasks/task-1');
    assert.equal(page.location.search, TODAY);
  });

  it('stacks the board and the task under a preview link', () => {
    const page = host('/tasks/task-1/files/file-1', TODAY);
    installOverlayHistory(page);
    assert.deepEqual(
      page.stack.map((entry) => entry.state?.overlay),
      ['board', 'task', 'file'],
    );
    assert.equal(page.location.pathname, '/tasks/task-1/files/file-1');
  });

  it('stacks the board under a completed log link so Back returns to the board', () => {
    const page = host('/completed', TODAY);
    installOverlayHistory(page);
    assert.deepEqual(
      page.stack.map((entry) => [entry.state?.overlay, entry.url]),
      [
        ['board', `/${TODAY}`],
        ['log', `/completed${TODAY}`],
      ],
    );
    assert.equal(page.location.pathname, '/completed');
    assert.equal(page.location.search, TODAY);
    installOverlayHistory(page);
    assert.equal(page.stack.length, 2);
  });

  it('tags the board without adding an entry, and does not touch a design screen', () => {
    const board = host('/', TODAY);
    installOverlayHistory(board);
    assert.deepEqual(
      board.stack.map((entry) => [entry.state?.overlay, entry.url]),
      [['board', `/${TODAY}`]],
    );
    installOverlayHistory(board);
    assert.equal(board.stack.length, 1);

    const design = host('/design/board', '');
    installOverlayHistory(design);
    assert.equal(design.stack.length, 1);
    assert.equal(design.stack[0]!.state, null);
    assert.equal(design.location.pathname, '/design/board');
  });
});
