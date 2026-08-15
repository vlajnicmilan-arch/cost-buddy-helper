/**
 * Fail-open ograda oko Brief-vrata: svaki kvar ekrana = običan ulazak u /home.
 */
import { Component, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class BriefGateBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[BriefGate] failed, entering app directly:', error?.message);
  }

  render() {
    if (this.state.failed) return <Navigate to="/home" replace />;
    return this.props.children;
  }
}
