/**
 * `Alert.alert` in tests: spy on it, read the alert last shown, and press one of its buttons the
 * way a user would (wrap the press in `act`).
 */
import type { Alert, AlertButton } from 'react-native';

export interface ShownAlert {
  title: string | null | undefined;
  message: string | null | undefined;
  buttons: AlertButton[];
}

type AlertModule = typeof Alert;
type AlertSpy = jest.SpiedFunction<AlertModule['alert']>;

export function spyOnAlert(alert: AlertModule): AlertSpy {
  return jest.spyOn(alert, 'alert').mockImplementation(() => undefined);
}

export function lastAlert(spy: AlertSpy): ShownAlert {
  const call = spy.mock.lastCall;
  if (call === undefined) {
    throw new Error('No alert was shown');
  }
  const [title, message, buttons = []] = call;
  return { title, message, buttons };
}

export const alertLabels = (spy: AlertSpy): (string | undefined)[] =>
  lastAlert(spy).buttons.map((button) => button.text);

/** Presses the last alert's button labelled `text`. */
export function pressAlertButton(spy: AlertSpy, text: string): void {
  const button = lastAlert(spy).buttons.find((candidate) => candidate.text === text);
  if (button === undefined) {
    throw new Error(`The alert has no "${text}" button`);
  }
  button.onPress?.();
}
