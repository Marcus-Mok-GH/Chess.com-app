import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <h2>🚨 Something went wrong</h2>
            <p>The application encountered an unexpected error.</p>
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
              <summary>Error Details</summary>
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                <strong>Error:</strong> {this.state.error && this.state.error.toString()}
                <br />
                <strong>Stack:</strong> {this.state.errorInfo.componentStack}
              </div>
            </details>
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                marginTop: '1rem', 
                padding: '0.5rem 1rem', 
                backgroundColor: '#7fa650', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
