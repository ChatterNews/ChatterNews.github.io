import { Component, type ReactNode } from 'react';

/** A missing help chunk must never unmount the student's editor. */
export class ReilyHelpBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="reily-help-loading" role="status"><b>Reily’s help could not open.</b><p>Keep your work open. Ask your adviser to check the connection and help you save before reloading Orbit. You can close this help panel and keep working.</p></div> : this.props.children;
  }
}
