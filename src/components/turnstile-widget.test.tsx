import type * as React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import { TurnstileWidget, type TurnstileEvent } from '@/components/turnstile-widget';

/** Props the widget hands to the (mocked) native WebView. */
interface WebViewProps {
  source: { html: string; baseUrl: string };
  userAgent: string;
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onError: (event: { nativeEvent: { description?: string } }) => void;
  onRenderError: (event: { nativeEvent: { description?: string } }) => void;
  onHttpError: (event: { nativeEvent: { statusCode: number } }) => void;
}

const mockWebView = { props: null as WebViewProps | null, mounts: 0 };

jest.mock('react-native-webview', () => {
  const { useEffect } = jest.requireActual<typeof React>('react');
  const WebView = (props: WebViewProps) => {
    mockWebView.props = props;
    // Count real mounts so remounts (reloadKey) are observable.
    useEffect(() => {
      mockWebView.mounts += 1;
    }, []);
    return null;
  };
  // Computed key: the module's export is PascalCase, which object-literal naming rules reject.
  return { ['WebView']: WebView };
});

const webView = () => {
  if (!mockWebView.props) throw new Error('WebView not rendered');
  return mockWebView.props;
};

const send = (message: unknown) => {
  webView().onMessage({ nativeEvent: { data: JSON.stringify(message) } });
};

describe('TurnstileWidget', () => {
  beforeEach(() => {
    mockWebView.props = null;
    mockWebView.mounts = 0;
  });

  it('renders the managed Turnstile challenge for the site key and theme', async () => {
    await render(<TurnstileWidget siteKey="0xSITE-KEY" theme="dark" onEvent={jest.fn()} />);

    const { html, baseUrl } = webView().source;
    expect(baseUrl).toBe('https://www.floatplane.com/');
    expect(html).toContain('sitekey: "0xSITE-KEY"');
    expect(html).toContain('theme: "dark"');
    expect(html).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
  });

  it.each([
    ['ios', 'iPhone'],
    ['android', 'Android'],
  ] as const)('presents a real %s browser user agent', async (os, marker) => {
    jest.replaceProperty(Platform, 'OS', os);
    await render(<TurnstileWidget siteKey="key" theme="light" onEvent={jest.fn()} />);

    expect(webView().userAgent).toContain(marker);
    expect(webView().userAgent).toMatch(/^Mozilla\/5\.0/);
  });

  it('forwards load, token, expire and error messages from the page', async () => {
    const onEvent = jest.fn((_event: TurnstileEvent) => undefined);
    await render(<TurnstileWidget siteKey="key" theme="light" onEvent={onEvent} />);

    const events: TurnstileEvent[] = [
      { type: 'load' },
      { type: 'token', token: 'cf-token' },
      { type: 'expire' },
      { type: 'error', error: 'turnstile: 110200' },
    ];
    events.forEach(send);

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual(events);
  });

  it('ignores non-JSON messages', async () => {
    const onEvent = jest.fn((_event: TurnstileEvent) => undefined);
    await render(<TurnstileWidget siteKey="key" theme="light" onEvent={onEvent} />);

    webView().onMessage({ nativeEvent: { data: 'not json' } });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('reports WebView load, render and HTTP failures as error events', async () => {
    const onEvent = jest.fn((_event: TurnstileEvent) => undefined);
    await render(<TurnstileWidget siteKey="key" theme="light" onEvent={onEvent} />);

    webView().onError({ nativeEvent: { description: 'net::ERR_INTERNET_DISCONNECTED' } });
    webView().onRenderError({ nativeEvent: {} });
    webView().onHttpError({ nativeEvent: { statusCode: 403 } });

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' },
      { type: 'error', error: 'WebView failed to load' },
      { type: 'error', error: 'HTTP 403' },
    ]);
  });

  it('always delivers to the latest onEvent handler without remounting', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await render(
      <TurnstileWidget siteKey="key" theme="light" onEvent={first} />,
    );
    await rerender(<TurnstileWidget siteKey="key" theme="light" onEvent={second} />);

    send({ type: 'load' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: 'load' });
    expect(mockWebView.mounts).toBe(1);
  });

  it('remounts a fresh challenge when reloadKey changes', async () => {
    const { rerender } = await render(
      <TurnstileWidget siteKey="key" theme="light" onEvent={jest.fn()} />,
    );
    expect(mockWebView.mounts).toBe(1);

    await rerender(
      <TurnstileWidget siteKey="key" theme="light" onEvent={jest.fn()} reloadKey={1} />,
    );
    expect(mockWebView.mounts).toBe(2);
  });
});
