import { loadBoard } from '@app/cli/commands';
import {
  addTask,
  deleteTask,
  doneTask,
  editTask,
  findTask,
  historyTask,
  search,
  setStatus,
  showTask,
  skipTask,
  undoneTask,
  type Changed,
  type Context,
} from '@app/cli/tasks';
import { HISTORY_ZONE, localDate, resolveDate, type ISODate, type Task } from '@app/core';
import { addAttachment, downloadAttachment, loadSnapshot, type Scope } from '@app/data';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { repeatFlagsIfSet, tagsFlag, toSubtaskEdits, type RepeatInput, type SubtaskInput } from './args.ts';
import { decodeFileData, fileMediaType, pickFile } from './files.ts';

const DATE = 'A day: YYYY-MM-DD, today, or relative to today (+3d, -2w, +1m). none clears a date.';
const TASK = 'A task id, an id prefix of at least 4 characters, or a title prefix.';

const date = z.string().describe(DATE);
const repeat = z
  .object({
    repeat: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'none']).optional().describe('weekdays is Monday through Friday. none removes the repeat.'),
    mode: z.enum(['schedule', 'after_completion', 'dates']).optional().describe('schedule is by due date.'),
    interval: z.number().int().min(1).optional().describe('Every N days, weeks, months, or years.'),
    byWeekday: z.string().optional().describe('Comma-separated weekdays for a weekly schedule: mon,tue,wed,thu,fri,sat,sun.'),
    monthly: z.string().optional().describe('A day (31 or last) or an nth weekday (2nd tue, last fri).'),
    dates: z.string().optional().describe('Comma-separated dates for dates mode.'),
    startOffset: z.union([z.number().int().min(0), z.literal('none')]).optional().describe('Days before each due date that the task becomes Ready. 0 means the due date. none means no start date.'),
    ends: z.string().optional().describe('never, a date (that day is included), or count:N.'),
  })
  .describe('One repeat rule on the task. A repeat with no due date uses today, or the first listed date.');

const subtasks = z
  .object({
    add: z.array(z.string()).optional().describe('New subtask titles, added at the bottom.'),
    done: z.array(z.string()).optional().describe('Mark these done. A ref is a position (1 is the top), an id prefix, or a title prefix, read against the list before this edit.'),
    undone: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
    rename: z.array(z.object({ ref: z.string(), title: z.string() })).optional(),
    move: z.array(z.object({ ref: z.string(), position: z.number().int().min(1) })).optional().describe('position is where it ends up, 1 is the top, after the other edits.'),
  })
  .describe('Subtask edits for this one call. Renames and ticks happen first, then removals, then adds, then moves.');

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

function todayOrDefault(today: string | undefined): ISODate {
  const day = localDate(new Date(), HISTORY_ZONE);
  return today ? resolveDate(today, day) : day;
}

function context(scope: Scope, today: string | undefined): Context {
  return { scope, today: todayOrDefault(today), now: new Date().toISOString() };
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function toolFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true as const, content: [{ type: 'text' as const, text: message }] };
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (error) {
    return toolFailure(error);
  }
}

interface UpdateInput {
  task: string;
  title?: string;
  description?: string;
  status?: 'open' | 'in_progress' | 'waiting';
  flagged?: boolean;
  start?: string;
  due?: string;
  hideUntil?: string;
  tags?: string[];
  subtasks?: SubtaskInput;
  repeat?: RepeatInput;
  today?: string;
}

/** Status first, so a Hide until date rides along into Waiting. Other fields then edit the task it became. */
async function applyUpdate(scope: Scope, input: UpdateInput): Promise<Changed> {
  const ctx = context(scope, input.today);
  const statusTakesHideUntil = input.status === 'waiting' && input.hideUntil !== undefined;
  const repeat = repeatFlagsIfSet(input.repeat);
  const subtaskEdits = toSubtaskEdits(input.subtasks);
  const hasEdit =
    input.title !== undefined ||
    input.description !== undefined ||
    input.flagged !== undefined ||
    input.start !== undefined ||
    input.due !== undefined ||
    (input.hideUntil !== undefined && !statusTakesHideUntil) ||
    input.tags !== undefined ||
    repeat !== undefined ||
    (subtaskEdits !== undefined && Object.values(subtaskEdits).some((list) => list && list.length > 0));
  if (input.status === undefined && !hasEdit) throw new Error('update_task needs a field to change.');

  let result: Changed | undefined;
  let ref = input.task;
  if (input.status !== undefined) {
    result = await setStatus(ctx, ref, input.status, statusTakesHideUntil ? { hideUntil: input.hideUntil } : {});
    ref = result.task.id;
  }
  if (!hasEdit) return result!;
  const edited = await editTask(ctx, ref, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.flagged !== undefined ? { flag: input.flagged } : {}),
    ...(input.start !== undefined ? { start: input.start } : {}),
    ...(input.due !== undefined ? { due: input.due } : {}),
    ...(input.hideUntil !== undefined && !statusTakesHideUntil ? { hideUntil: input.hideUntil } : {}),
    ...(input.tags !== undefined ? { tags: tagsFlag(input.tags) } : {}),
    ...(repeat ? { repeat } : {}),
    ...(subtaskEdits ? { subtasks: subtaskEdits } : {}),
  });
  const note = [result?.note, edited.note].filter(Boolean).join(' ');
  return note ? { ...edited, note } : edited;
}

interface StoredFile {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  storagePath: string;
}

async function taskFiles(scope: Scope, ref: string): Promise<{ task: Task; files: StoredFile[] }> {
  const snapshot = await loadSnapshot(scope);
  const task = findTask(snapshot, ref);
  const { data, error } = await scope.db
    .from('attachments')
    .select('id,filename,mime,bytes,storage_path,created_at')
    .eq('user_id', scope.userId)
    .eq('task_id', task.id)
    .order('created_at')
    .order('id');
  if (error) throw new Error(`list files: ${error.message}`);
  const files = (data ?? []).map((row: { id: string; filename: string; mime: string; bytes: number | string; storage_path: string }) => ({
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    bytes: Number(row.bytes),
    storagePath: row.storage_path,
  }));
  return { task, files };
}

async function listFiles(scope: Scope, ref: string) {
  const { task, files } = await taskFiles(scope, ref);
  return {
    taskId: task.id,
    files: files.map((file) => ({ id: file.id, name: file.filename, type: file.mime, size: file.bytes })),
  };
}

/** Stores the bytes through the same bucket, row, and access token as the app. Photos are not downscaled. */
async function uploadFile(scope: Scope, ref: string, input: { name: string; type?: string; data: string }) {
  const snapshot = await loadSnapshot(scope);
  const task = findTask(snapshot, ref);
  if (task.deletedAt) throw new Error(`"${task.title}" is in Recently deleted, so a file can't be added. Restore the task first.`);
  const body = decodeFileData(input.data);
  const saved = await addAttachment(scope, task.id, {
    name: input.name,
    type: fileMediaType(input.type),
    size: body.byteLength,
    body,
  });
  return { taskId: task.id, file: { id: saved.id, name: saved.filename, type: saved.mime, size: saved.bytes } };
}

/** Reads the bytes back through storage, as the caller's access token. */
async function downloadFile(scope: Scope, ref: string, fileRef: string) {
  const { task, files } = await taskFiles(scope, ref);
  const file = pickFile(files, fileRef);
  const bytes = await downloadAttachment(scope, file.storagePath);
  if (bytes.byteLength !== file.bytes) throw new Error("Couldn't read the file.");
  return {
    taskId: task.id,
    file: { id: file.id, name: file.filename, type: file.mime, size: file.bytes },
    data: Buffer.from(bytes).toString('base64'),
  };
}

/** Sets deleted_at. Never passes the CLI's delete-forever flag, and never completes the task. */
async function deleteToRecentlyDeleted(scope: Scope, ref: string, today: string | undefined): Promise<Changed> {
  const snapshot = await loadSnapshot(scope);
  const task = findTask(snapshot, ref);
  if (task.deletedAt) {
    throw new Error(`"${task.title}" is already in Recently deleted. Delete does not mark it done, and it does not remove the task permanently.`);
  }
  return deleteTask(context(scope, today), task.id, false);
}

/** Tools follow the app and the CLI. They do not reorder tasks or set reminders. */
export function createTaskServer(scope: Scope): McpServer {
  const server = new McpServer({ name: 'taskman', version: '0.0.0' });

  server.registerTool(
    'board',
    {
      title: 'Board for a day',
      description: 'The main board for one day, grouped and ordered the way the app shows it. Upcoming is included. Completed and Recently deleted are not. Today is the Pacific calendar day when you leave the date out.',
      inputSchema: z.object({ today: date.optional() }),
      annotations: readOnly,
    },
    async ({ today }) => run(() => loadBoard(scope.db, scope.userId, { today: todayOrDefault(today), completed: false, trash: false })),
  );

  server.registerTool(
    'task',
    {
      title: 'One task',
      description: `One task: its fields, subtasks, tags, where it sits on the board, and the actions the app would offer. ${TASK}`,
      inputSchema: z.object({ task: z.string().describe(TASK), today: date.optional() }),
      annotations: readOnly,
    },
    async ({ task, today }) => run(() => showTask(context(scope, today), task)),
  );

  server.registerTool(
    'search',
    {
      title: 'Search tasks',
      description: 'Search titles, descriptions, and tag names. Recently deleted tasks are never included. With no words, the other filters still apply. Tags are AND: a task must have every tag named.',
      inputSchema: z.object({
        query: z.string().optional().describe('Words to find. Empty searches every task the filters allow.'),
        completed: z.boolean().optional().describe('Include completed tasks. Off by default.'),
        flagged: z.boolean().optional().describe('Only flagged tasks.'),
        tags: z.array(z.string()).optional().describe('Tag names. The task must have every one.'),
        today: date.optional(),
      }),
      annotations: readOnly,
    },
    async ({ query, completed, flagged, tags, today }) =>
      run(() => search(context(scope, today), query ?? '', { completed, flagged, tags })),
  );

  server.registerTool(
    'history',
    {
      title: 'Task history',
      description: 'One task\'s history, oldest first: field changes, plus each Done and Skipped occurrence. A field change has no undo. The latest occurrence says whether it can still be undone.',
      inputSchema: z.object({ task: z.string().describe(TASK), today: date.optional() }),
      annotations: readOnly,
    },
    async ({ task, today }) => run(() => historyTask(context(scope, today), task)),
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create a task',
      description: 'Create one task. It lands at the top of its section, or in Upcoming when the start date is after today. Only an Open task has a start date. Only a Waiting task has a Hide until date; leave it out and the task needs follow-up now (Don\'t hide). A repeat with no due date uses today, or the first listed date.',
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(['open', 'in_progress', 'waiting']).optional().describe('Defaults to open.'),
        flagged: z.boolean().optional(),
        start: date.optional().describe('Only for an Open task.'),
        due: date.optional(),
        hideUntil: date.optional().describe('Only with status waiting. none, or leaving it out, is Don\'t hide.'),
        tags: z.array(z.string()).optional().describe('Tag names. Ones that do not exist yet are created.'),
        subtasks: z.array(z.string()).optional().describe('Subtask titles, in order.'),
        repeat: repeat.optional(),
        today: date.optional(),
      }),
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const rule = repeatFlagsIfSet(input.repeat);
      return run(() =>
        addTask(context(scope, input.today), input.title, {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.start !== undefined ? { start: input.start } : {}),
          ...(input.hideUntil !== undefined ? { hideUntil: input.hideUntil } : {}),
          ...(input.due !== undefined ? { due: input.due } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.flagged ? { flag: true } : {}),
          ...(input.subtasks ? { subtasks: input.subtasks } : {}),
          ...(input.tags !== undefined ? { tags: tagsFlag(input.tags) } : {}),
          ...(rule ? { repeat: rule } : {}),
        }),
      );
    },
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update a task',
      description: 'Change title, description, status, flag, start, due, Hide until, repeat, tags, or subtasks. Only the fields you send are changed. Status changes clear the dates that no longer apply: going into Waiting or In Progress clears the start date, and leaving Waiting clears Hide until. Going into Waiting uses hideUntil (none, or leaving it out, is Don\'t hide). Tags replace the whole set. Start dates only apply to Ready and Upcoming tasks. Hide until only applies to Waiting tasks.',
      inputSchema: z.object({
        task: z.string().describe(TASK),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['open', 'in_progress', 'waiting']).optional(),
        flagged: z.boolean().optional().describe('true sets the flag. false removes it.'),
        start: date.optional(),
        due: date.optional(),
        hideUntil: date.optional().describe('Waiting only. none is Don\'t hide.'),
        tags: z.array(z.string()).optional().describe('Replaces the task\'s tags. An empty list removes them.'),
        subtasks: subtasks.optional(),
        repeat: repeat.optional(),
        today: date.optional(),
      }),
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (input) => run(() => applyUpdate(scope, input)),
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete a task',
      description: 'Mark a task done. A repeating task records this occurrence and advances to the next one. A task that has reached the end of its repeat is completed for good.',
      inputSchema: z.object({
        task: z.string().describe(TASK),
        on: date.optional().describe('The calendar day the completion counts on. Defaults to today.'),
        today: date.optional(),
      }),
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ task, on, today }) => run(() => doneTask(context(scope, today), task, on)),
  );

  server.registerTool(
    'skip_task',
    {
      title: 'Skip this occurrence',
      description: 'Skip the current occurrence of a repeating task. It counts toward an end-after-N rule and does not record a completion. The next occurrence stays open.',
      inputSchema: z.object({
        task: z.string().describe(TASK),
        on: date.optional().describe('The calendar day the skip counts on. Defaults to today.'),
        today: date.optional(),
      }),
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ task, on, today }) => run(() => skipTask(context(scope, today), task, on)),
  );

  server.registerTool(
    'undo_task',
    {
      title: 'Undo the latest occurrence',
      description: 'Undo the latest Done or Skipped occurrence, restoring the dates and subtasks it left behind. It only works while the task has not been edited since. A one-off completed task is marked not done instead.',
      inputSchema: z.object({ task: z.string().describe(TASK), today: date.optional() }),
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ task, today }) => run(() => undoneTask(context(scope, today), task)),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description:
        'Move a task to Recently deleted. Delete sets the deletion time and takes the task off the board. It is not marking the task done. It is not complete_task, not skip_task, and not undo_task. The task is not removed permanently; it stays in Recently deleted. complete_task marks a task done. skip_task skips one occurrence of a repeat. undo_task undoes the latest Done or Skipped occurrence. A task already in Recently deleted is left there.',
      inputSchema: z.object({ task: z.string().describe(TASK), today: date.optional() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ task, today }) => run(() => deleteToRecentlyDeleted(scope, task, today)),
  );

  server.registerTool(
    'list_attachments',
    {
      title: 'List files',
      description: 'Files on one task: id, name, type, and size. Use upload_attachment to add bytes and download_attachment to read them.',
      inputSchema: z.object({ task: z.string().describe(TASK) }),
      annotations: readOnly,
    },
    async ({ task }) => run(() => listFiles(scope, task)),
  );

  server.registerTool(
    'upload_attachment',
    {
      title: 'Upload a file',
      description:
        'Add one file to a task. data is the file bytes as base64, not a data: URL. The bytes are stored in the same private bucket as the app, using the caller\'s access token, so row-level security applies. Photos are stored as sent and are not downscaled. A task in Recently deleted cannot take a new file.',
      inputSchema: z.object({
        task: z.string().describe(TASK),
        name: z.string().describe('The file name to store.'),
        type: z.string().optional().describe('The media type, such as image/jpeg or text/plain. Defaults to application/octet-stream.'),
        data: z.string().describe('The file bytes, base64-encoded.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ task, name, type, data }) => run(() => uploadFile(scope, task, { name, type, data })),
  );

  server.registerTool(
    'download_attachment',
    {
      title: 'Download a file',
      description:
        'Read one file\'s bytes. data in the result is base64. file is the file name, or its id when two files share a name. This is a read through the same storage path as the app, using the caller\'s access token. It does not change the task or its history.',
      inputSchema: z.object({
        task: z.string().describe(TASK),
        file: z.string().describe('The file name, or the file id from list_attachments.'),
      }),
      annotations: readOnly,
    },
    async ({ task, file }) => run(() => downloadFile(scope, task, file)),
  );

  return server;
}
