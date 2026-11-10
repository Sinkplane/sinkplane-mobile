/**
 * In-memory stand-in for expo-task-manager (mapped in jest.config.base.js): records defined task
 * bodies (so tests can run one) and which tasks are registered with the OS scheduler.
 */
type TaskBody = (body: { data: unknown; error: null; executionInfo: unknown }) => Promise<unknown>;

export const mockTaskManager = {
  defined: new Map<string, TaskBody>(),
  registered: new Map<string, unknown>(),
  /** Run a defined task the way the OS would. */
  run(name: string): Promise<unknown> {
    const task = this.defined.get(name);
    if (!task) {
      return Promise.reject(new Error(`Task "${name}" is not defined`));
    }
    return task({ data: null, error: null, executionInfo: {} });
  },
  reset(): void {
    this.defined.clear();
    this.registered.clear();
  },
};

export const defineTask = jest.fn((name: string, body: TaskBody) => {
  mockTaskManager.defined.set(name, body);
});

export const isTaskDefined = jest.fn((name: string) => mockTaskManager.defined.has(name));

export const isTaskRegisteredAsync = jest.fn((name: string) =>
  Promise.resolve(mockTaskManager.registered.has(name)),
);

export const unregisterTaskAsync = jest.fn((name: string): Promise<void> => {
  mockTaskManager.registered.delete(name);
  return Promise.resolve();
});
