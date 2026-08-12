import React from 'react';
import './ErrorBoundary.css';

function getErrorMessage(error) {
  if (!error) return 'Unknown error';
  return error instanceof Error ? error.toString() : String(error);
}

function getErrorReport(error, errorInfo) {
  return [
    'PlayChess unexpected error',
    `URL: ${window.location.origin}${window.location.pathname}`,
    `Time: ${new Date().toISOString()}`,
    '',
    'Error:',
    getErrorMessage(error),
    '',
    'Component stack:',
    errorInfo?.componentStack?.trim() || 'Unavailable',
  ].join('\n');
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copyState: 'idle' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  copyErrorReport = async () => {
    const report = getErrorReport(this.state.error, this.state.errorInfo);

    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copyState: 'copied' });
    } catch (error) {
      console.error('Could not copy error report:', error);
      this.setState({ copyState: 'failed' });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const errorMessage = getErrorMessage(this.state.error);
    const componentStack = this.state.errorInfo?.componentStack?.trim() || 'Unavailable';

    return (
      <div className="error-boundary">
        <div className="error-container" role="alert">
          <div className="error-content">
            <p className="error-eyebrow">PlayChess error</p>
            <h2>Something went wrong</h2>
            <p> The application encountered an unexpected error. Copy the report and send it to the site owner so it can be fixed.</p>
            <details className="error-details" open>
              <summary>Error details</summary>
              <div className="error-details-content">
                <div>
                  <strong>Error</strong>
                  <code>{errorMessage}</code>
                </div>
                <div>
                  <strong>Component stack</strong>
                  <code>{componentStack}</code>
                </div>
              </div>
            </details>
            <div className="error-actions">
              <button className="error-button error-button-primary" onClick={this.copyErrorReport} type="button">
                Copy error report
              </button>
              <button className="error-button error-button-secondary" onClick={() => window.location.reload()} type="button">
                Reload page
              </button>
            </div>
            {this.state.copyState === 'copied' && <p className="error-copy-status" role="status">Error report copied to clipboard.</p>}
            {this.state.copyState === 'failed' && <p className="error-copy-status error-copy-status-failed" role="status">Copy failed. Select the details above and copy them manually.</p>}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
