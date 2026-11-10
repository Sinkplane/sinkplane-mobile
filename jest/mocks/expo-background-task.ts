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
  reset(): void {
    this.status = BackgroundTaskStatus.Available;
  },
};

export const getStatusAsync = jest.fn(() => Promise.resolve(mockBackgroundTask.status));

export const registerTaskAsync = jest.fn(
  (name: string, options?: { minimumInterval?: number }): Promise<void> => {
    mockTaskManager.registered.set(name, options ?? {});
    return Promise.resolve();
  },
);

export const unregisterTaskAsync = jest.fn((name: string): Promise<void> => {
  mockTaskManager.registered.delete(name);
  return Promise.resolve();
});
