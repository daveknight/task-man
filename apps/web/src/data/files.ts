import { addAttachment, listAttachmentFiles, removeAttachment, storageUsed, type AttachmentFile } from '@app/data';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseConfigured } from '@/supabase';
import { taskScope } from './board-data';

export const filesKey = (taskId: string) => ['attachments', taskId] as const;
export const STORAGE_KEY = ['storage-used'] as const;

export function useTaskFiles(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: filesKey(taskId),
    enabled: supabaseConfigured && enabled,
    queryFn: async () => listAttachmentFiles(await taskScope(), taskId),
  });
}

export function useStorageUsage(enabled: boolean) {
  return useQuery({
    queryKey: STORAGE_KEY,
    enabled: supabaseConfigured && enabled,
    queryFn: async () => storageUsed(await taskScope()),
  });
}

export function useFileWrites(taskId: string) {
  const client = useQueryClient();
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: filesKey(taskId) });
    await client.invalidateQueries({ queryKey: STORAGE_KEY });
  };
  return {
    async add(file: File) {
      await addAttachment(await taskScope(), taskId, { name: file.name, type: file.type, size: file.size, body: file });
      await refresh();
    },
    async remove(file: AttachmentFile) {
      await removeAttachment(await taskScope(), file.id);
      await refresh();
    },
  };
}
