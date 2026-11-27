import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  closeFileAction,
  closeLogAction,
  closeTaskAction,
  logReturnAddress,
  openFileAction,
  openLogAction,
  openTaskAction,
  parseOverlayPath,
  type HistoryAction,
  type OverlayAddress,
  type OverlayHistoryState,
} from './overlay-history';

export type OverlayController = {
  taskId: string | null;
  fileId: string | null;
  log: boolean;
  openTask: (taskId: string) => void;
  closeTask: () => void;
  openFile: (taskId: string, fileId: string) => void;
  closeFile: () => void;
  openLog: () => void;
  closeLog: () => void;
};

const OverlayHistoryContext = createContext<OverlayController | null>(null);

/** Blocks a second Back while the first traversal is still settling. Survives a strict-mode remount. */
let traversing = false;

function readState(): OverlayHistoryState | null {
  const value = window.history.state as OverlayHistoryState | null;
  if (!value || typeof value !== 'object' || !('overlay' in value)) return null;
  return value;
}

/**
 * The open task, image preview, and completed log, kept in the address bar.
 * Browser Back and Forward move the same state. Closing from the screen uses
 * Back when this screen pushed the entry, so Forward opens it again.
 */
export function useOverlayHistory(): OverlayController {
  const [address, setAddress] = useState<OverlayAddress>(() => parseOverlayPath(window.location.pathname));

  useEffect(() => {
    const onPop = () => {
      traversing = false;
      setAddress(parseOverlayPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const apply = useCallback((action: HistoryAction, next: OverlayAddress) => {
    if (action.type === 'none' || traversing) return;
    if (action.type === 'back') {
      traversing = true;
      const before = window.location.href;
      setAddress(next);
      window.history.go(-action.steps);
      window.setTimeout(() => {
        if (traversing && window.location.href === before) traversing = false;
      }, 500);
      return;
    }
    const historyState: OverlayHistoryState = { overlay: action.overlay };
    if (action.type === 'push' && action.overlay === 'log') historyState.logBack = parseOverlayPath(window.location.pathname);
    if (action.type === 'push') window.history.pushState(historyState, '', action.url);
    else window.history.replaceState(historyState, '', action.url);
    setAddress(next);
  }, []);

  const openTask = useCallback(
    (taskId: string) => {
      const now = parseOverlayPath(window.location.pathname);
      apply(openTaskAction(now, taskId, window.location.search), { taskId, fileId: null, log: false });
    },
    [apply],
  );

  const openFile = useCallback(
    (taskId: string, fileId: string) => {
      const now = parseOverlayPath(window.location.pathname);
      apply(openFileAction(now, taskId, fileId, window.location.search), { taskId, fileId, log: false });
    },
    [apply],
  );

  const closeFile = useCallback(() => {
    const now = parseOverlayPath(window.location.pathname);
    apply(closeFileAction(now, readState(), window.location.search), { taskId: now.taskId, fileId: null, log: false });
  }, [apply]);

  const closeTask = useCallback(() => {
    const now = parseOverlayPath(window.location.pathname);
    apply(closeTaskAction(now, readState(), window.location.search), { taskId: null, fileId: null, log: false });
  }, [apply]);

  const openLog = useCallback(() => {
    const now = parseOverlayPath(window.location.pathname);
    apply(openLogAction(now, window.location.search), { taskId: null, fileId: null, log: true });
  }, [apply]);

  const closeLog = useCallback(() => {
    const now = parseOverlayPath(window.location.pathname);
    const state = readState();
    apply(closeLogAction(now, state, window.location.search), logReturnAddress(state));
  }, [apply]);

  return useMemo(
    () => ({ taskId: address.taskId, fileId: address.fileId, log: address.log, openTask, closeTask, openFile, closeFile, openLog, closeLog }),
    [address.taskId, address.fileId, address.log, openTask, closeTask, openFile, closeFile, openLog, closeLog],
  );
}

export function OverlayHistoryProvider({ children }: { children: ReactNode | ((overlay: OverlayController) => ReactNode) }) {
  const overlay = useOverlayHistory();
  return <OverlayHistoryContext.Provider value={overlay}>{typeof children === 'function' ? children(overlay) : children}</OverlayHistoryContext.Provider>;
}

/** Null on the design screens, which have no address history. */
export function useOverlayController(): OverlayController | null {
  return useContext(OverlayHistoryContext);
}
