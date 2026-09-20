import { Alert, AlertButton, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert is a no-op, so on the web build validation errors and
 * confirmation prompts (e.g. "Delete borrower?") silently do nothing. This maps it onto the
 * browser's alert/confirm: one button -> alert; two or more -> confirm, where OK runs the first
 * non-cancel button and Cancel runs the cancel button (if any).
 */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancel = buttons.find((b) => b.style === 'cancel');
    const action = buttons.find((b) => b !== cancel) ?? buttons[0];
    if (window.confirm(text)) action.onPress?.();
    else cancel?.onPress?.();
  };
}
