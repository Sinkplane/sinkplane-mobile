/**
 * React Native's own fetch and WebSocket, captured before ./install.ts imports the E2E mocks (they
 * replace both globals when loaded). Demo mode hands every non-Floatplane request back to these:
 * the media server, Metro's hot reload socket, dev tools.
 */

export const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export const NativeWebSocket: typeof WebSocket = globalThis.WebSocket;
