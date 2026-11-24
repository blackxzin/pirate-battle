import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
};

type State = { readonly hasError: boolean };

/**
 * Catches render and lazy-loading errors below it (for example, the battle
 * chunk failing to download) and shows a recoverable fallback instead of a
 * blank page. Remount it (new `key`) to try again. React still requires a
 * class component for this.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
