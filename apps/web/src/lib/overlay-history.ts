/**
 * The address for the task sheet, the image preview, and the completed log.
 *
 *   /                              the board
 *   /completed                     the completed log
 *   /tasks/<taskId>                the task sheet, or the detail pane on a wide window
 *   /tasks/<taskId>/files/<fileId> a previewable image on that task
 *
 * The query string stays put (`?today=`, `?autosignin=`). A file that is not
 * previewable never uses the files path: it still opens its signed URL.
 * A shared or refreshed link is stacked as board, then task, then preview, so
 * Back closes the preview, then the task, then leaves the board. A completed
 * log link is stacked as board, then the log, so Back returns to the board
 * and Forward opens the log again. Which weeks are open is remembered on the
 * device, so coming back shows the log as it was left.
 */

export const COMPLETED_PATH = '/completed';

export type OverlayAddress = {
  taskId: string | null;
  fileId: string | null;
  log: boolean;
};

export type OverlayHistoryState = {
  overlay: 'board' | 'task' | 'file' | 'log';
  /** The screen under a completed-log entry this screen pushed, so Back can restore it before popstate. */
  logBack?: OverlayAddress;
};

export type OverlayEntry = {
  overlay: OverlayHistoryState['overlay'];
  path: string;
  search: string;
};

export type HistoryAction =
  | { type: 'none' }
  | { type: 'push'; overlay: 'task' | 'file' | 'log'; url: string }
  | { type: 'replace'; overlay: 'board' | 'task' | 'file'; url: string }
  | { type: 'back'; steps: 1 | 2 };

const BOARD: OverlayAddress = { taskId: null, fileId: null, log: false };

const TASK_PATH = /^\/tasks\/([^/]+)$/;
const FILE_PATH = /^\/tasks\/([^/]+)\/files\/([^/]+)$/;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function withSearch(path: string, search: string): string {
  if (!search) return path;
  return path + (search.startsWith('?') ? search : `?${search}`);
}

/** The task, preview file, or completed log named by the path. */
export function parseOverlayPath(pathname: string): OverlayAddress {
  const path = normalizePath(pathname);
  if (path === COMPLETED_PATH) return { taskId: null, fileId: null, log: true };
  const file = FILE_PATH.exec(path);
  if (file) {
    const taskId = decodeSegment(file[1] ?? '');
    const fileId = decodeSegment(file[2] ?? '');
    if (taskId && fileId) return { taskId, fileId, log: false };
  }
  const task = TASK_PATH.exec(path);
  if (task) {
    const taskId = decodeSegment(task[1] ?? '');
    if (taskId) return { taskId, fileId: null, log: false };
  }
  return BOARD;
}

/** Path for a task, a preview, or the board. Ids are encoded. */
export function overlayPath(taskId: string | null, fileId: string | null): string {
  if (!taskId) return '/';
  const task = `/tasks/${encodeURIComponent(taskId)}`;
  if (!fileId) return task;
  return `${task}/files/${encodeURIComponent(fileId)}`;
}

/**
 * History entries for a loaded address, oldest first. Null for the design
 * screens, which are not the board. A task or preview gets a board entry under
 * it. Anything else under `/tasks` is sent back to the board.
 */
export function overlayHistoryEntries(pathname: string, search: string): OverlayEntry[] | null {
  const path = normalizePath(pathname);
  if (path === '/design' || path.startsWith('/design/')) return null;
  const query = search && !search.startsWith('?') ? `?${search}` : search;
  if (path === COMPLETED_PATH) {
    return [
      { overlay: 'board', path: '/', search: query },
      { overlay: 'log', path: COMPLETED_PATH, search: query },
    ];
  }
  const address = parseOverlayPath(path);
  if (address.taskId) {
    const entries: OverlayEntry[] = [
      { overlay: 'board', path: '/', search: query },
      { overlay: 'task', path: overlayPath(address.taskId, null), search: query },
    ];
    if (address.fileId) entries.push({ overlay: 'file', path: overlayPath(address.taskId, address.fileId), search: query });
    return entries;
  }
  if (path.startsWith('/tasks')) return [{ overlay: 'board', path: '/', search: query }];
  return [{ overlay: 'board', path: path || '/', search: query }];
}

/** Opening a task from the board pushes. Switching tasks replaces. A preview stays put. */
export function openTaskAction(current: OverlayAddress, taskId: string, search: string): HistoryAction {
  if (!taskId || current.fileId || current.taskId === taskId) return { type: 'none' };
  const url = withSearch(overlayPath(taskId, null), search);
  if (current.taskId) return { type: 'replace', overlay: 'task', url };
  return { type: 'push', overlay: 'task', url };
}

/** A preview pushes on top of its task. Another preview of the same task replaces. */
export function openFileAction(current: OverlayAddress, taskId: string, fileId: string, search: string): HistoryAction {
  if (!taskId || !fileId || current.taskId !== taskId || current.fileId === fileId) return { type: 'none' };
  const url = withSearch(overlayPath(taskId, fileId), search);
  if (current.fileId) return { type: 'replace', overlay: 'file', url };
  return { type: 'push', overlay: 'file', url };
}

/** Opening the completed log pushes it on top of the board, a task, or a preview. */
export function openLogAction(current: OverlayAddress, search: string): HistoryAction {
  if (current.log) return { type: 'none' };
  return { type: 'push', overlay: 'log', url: withSearch(COMPLETED_PATH, search) };
}

/**
 * Where Back from the completed log returns. A log this screen pushed remembers
 * the screen under it. A direct link has the board stacked under it instead.
 */
export function logReturnAddress(state: OverlayHistoryState | null): OverlayAddress {
  const back = state?.logBack;
  if (!back || back.log) return BOARD;
  return { taskId: back.taskId, fileId: back.fileId, log: false };
}

/** Close the completed log. Back when we pushed it; otherwise replace so a direct link doesn't leave the site. */
export function closeLogAction(current: OverlayAddress, state: OverlayHistoryState | null, search: string): HistoryAction {
  if (!current.log) return { type: 'none' };
  if (state?.overlay === 'log') return { type: 'back', steps: 1 };
  return { type: 'replace', overlay: 'board', url: withSearch('/', search) };
}

/** Close the preview. Back when we pushed it; otherwise replace so a direct link doesn't leave the site. */
export function closeFileAction(current: OverlayAddress, state: OverlayHistoryState | null, search: string): HistoryAction {
  if (!current.fileId || !current.taskId) return { type: 'none' };
  if (state?.overlay === 'file') return { type: 'back', steps: 1 };
  return { type: 'replace', overlay: 'task', url: withSearch(overlayPath(current.taskId, null), search) };
}

/**
 * Close the task. Back when we pushed it. A preview still on top steps back
 * past both, which is how a deleted task leaves. Otherwise replace with the board.
 */
export function closeTaskAction(current: OverlayAddress, state: OverlayHistoryState | null, search: string): HistoryAction {
  if (!current.taskId) return { type: 'none' };
  if (current.fileId && state?.overlay === 'file') return { type: 'back', steps: 2 };
  if (!current.fileId && state?.overlay === 'task') return { type: 'back', steps: 1 };
  return { type: 'replace', overlay: 'board', url: withSearch('/', search) };
}

export interface HistoryHost {
  location: { readonly pathname: string; readonly search: string };
  history: {
    readonly state: OverlayHistoryState | null;
    replaceState(state: OverlayHistoryState, title: string, url: string): void;
    pushState(state: OverlayHistoryState, title: string, url: string): void;
  };
}

/** Tag the current entry, and stack the board (and the task) under a deep link. Safe to call again. */
export function installOverlayHistory(host: HistoryHost) {
  const entries = overlayHistoryEntries(host.location.pathname, host.location.search);
  if (!entries || entries.length === 0) return;
  const top = entries[entries.length - 1]!;
  const state = host.history.state;
  if (state?.overlay === top.overlay && host.location.pathname === top.path && host.location.search === top.search) return;
  const [first, ...rest] = entries;
  host.history.replaceState({ overlay: first!.overlay }, '', first!.path + first!.search);
  for (const entry of rest) host.history.pushState({ overlay: entry.overlay }, '', entry.path + entry.search);
}
