/**
 * In-memory stand-in for expo-background-task (mapped in jest.config.base.js). Registering a task
 * records it in the task-manager mock, like the native module does.
 */
import { mockTaskManager } from './expo-task-manager';

export enum BackgroundTaskStatus {
  Restricted = 1,
  Available = 2,
}

export enum BackgroundTaskResult {
  Success = 1,
  Failed = 2,
}

export const mockBackgroundTask = {
  status: BackgroundTaskStatus.Available,
  reset() {
    this.status = BackgroundTaskStatus.Available;
  },
};

export const getStatusAsync = jest.fn(async () => mockBackgroundTask.status);

export const registerTaskAsync = jest.fn(async (name: string, options?: { minimumInterval?: number }) => {
  mockTaskManager.registered.set(name, options ?? {});
});

export const unregisterTaskAsync = jest.fn(async (name: string) => {
  mockTaskManager.registered.delete(name);
});
