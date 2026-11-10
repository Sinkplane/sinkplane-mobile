import { logError } from '@/utils/log';

describe('logError', () => {
  it('reports the message and the error to the console', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');
    logError('[Test] failed:', error);
    expect(errorSpy).toHaveBeenCalledWith('[Test] failed:', error);
    errorSpy.mockRestore();
  });
});
