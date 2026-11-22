import type { Status } from './types.ts';

/**
 * Product defaults Dave may revisit. Changing a value here changes every
 * client; the matching test vectors pin the current choice.
 */
export interface Policy {
  /** Where "Move to In Progress" (formerly Resume) sends a waiting task. */
  resumeStatus: Exclude<Status, 'waiting'>;
  /**
   * What happens when the due date is moved earlier than the start date:
   * `move_start` moves the start date to the new due date; `reject` refuses the edit.
   */
  dueBeforeStart: 'move_start' | 'reject';
}

export const DEFAULT_POLICY: Policy = {
  resumeStatus: 'in_progress',
  dueBeforeStart: 'move_start',
};
