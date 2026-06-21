import { Alert as RNAlert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (!buttons || buttons.length === 0) {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }

  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b.style !== 'cancel');

  if (actions.length <= 1) {
    const action = actions[0];
    if (cancel) {
      const ok = window.confirm(message ? `${title}\n\n${message}` : title);
      if (ok) action?.onPress?.();
      else cancel.onPress?.();
    } else {
      window.alert(message ? `${title}\n\n${message}` : title);
      action?.onPress?.();
    }
    return;
  }

  // Multiple actions — use confirm for the first non-cancel action
  const ok = window.confirm(
    (message ? `${title}\n\n${message}` : title) +
    `\n\nOK = ${actions[0]?.text ?? 'OK'}, Cancel = ${cancel?.text ?? actions[1]?.text ?? 'Cancel'}`
  );
  if (ok) actions[0]?.onPress?.();
  else (cancel ?? actions[1])?.onPress?.();
}

export const Alert = {
  alert: Platform.OS === 'web' ? webAlert : RNAlert.alert.bind(RNAlert),
};
