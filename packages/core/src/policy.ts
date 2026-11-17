import type { Status } from './types.ts';

/**
 * Product defaults Dave may revisit. Changing a value here changes every
 * client; the matching test vectors pin the current choice.
 */
export interface Policy {
  /** Where Resume (labeled "Move to In Progress") sends a waiting task. */
  resumeStatus: Exclude<Status, 'waiting'>;
  /**
   * What happens when the due date is moved earlier than the start date:
   * `move_start` moves the start date to the new due date; `reject` refuses the edit.
   */
  dueBeforeStart: 'move_start' | 'reject';
  /**
   * The highlighted answer when a status change needs a start-date choice (see `changeStatus`).
   * Leaving Waiting with a future check-back date: `clear` it (the task is active now) or `keep` it
   * as a start date (the task goes to Upcoming). Going into Waiting with a future start date: `clear`
   * it (no check-back date, so it needs follow-up now) or `keep` it as the check-back date. Clients
   * ask for a check-back date whenever a task goes into Waiting; this is the answer they highlight.
   */
  leaveWaitingDefault: 'clear' | 'keep';
  enterWaitingDefault: 'clear' | 'keep';
}

export const DEFAULT_POLICY: Policy = {
  resumeStatus: 'in_progress',
  dueBeforeStart: 'move_start',
  leaveWaitingDefault: 'clear',
  enterWaitingDefault: 'clear',
};
