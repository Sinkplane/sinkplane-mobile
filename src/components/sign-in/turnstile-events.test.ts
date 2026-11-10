import { applyTurnstileEvent } from '@/components/sign-in/turnstile-events';

function setters() {
  return { setCaptchaToken: jest.fn(), setWidgetError: jest.fn(), setWidgetReady: jest.fn() };
}

describe('applyTurnstileEvent', () => {
  let info: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores an issued token and clears the widget error', () => {
    const state = setters();
    applyTurnstileEvent({ type: 'token', token: 'cf-token' }, state);

    expect(state.setCaptchaToken).toHaveBeenCalledWith('cf-token');
    expect(state.setWidgetError).toHaveBeenCalledWith(null);
    expect(info).toHaveBeenCalledWith('[Turnstile] event:', 'token', 'len=8');
  });

  it('marks the widget ready once it rendered', () => {
    const state = setters();
    applyTurnstileEvent({ type: 'load' }, state);

    expect(state.setWidgetReady).toHaveBeenCalledWith(true);
    expect(state.setWidgetError).toHaveBeenCalledWith(null);
    expect(info).toHaveBeenCalledWith('[Turnstile] event:', 'load', '');
  });

  it('drops the token and reports widget errors', () => {
    const state = setters();
    applyTurnstileEvent({ type: 'error', error: 'turnstile: 110200' }, state);

    expect(state.setCaptchaToken).toHaveBeenCalledWith(null);
    expect(state.setWidgetError).toHaveBeenCalledWith('turnstile: 110200');
    expect(error).toHaveBeenCalledWith('[Turnstile] widget error:', 'turnstile: 110200');
  });

  it('drops an expired token', () => {
    const state = setters();
    applyTurnstileEvent({ type: 'expire' }, state);

    expect(state.setCaptchaToken).toHaveBeenCalledWith(null);
    expect(state.setWidgetError).not.toHaveBeenCalled();
  });
});
