import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.toString() };
  }

  componentDidCatch(error, errorInfo) {
    console.error("🚨 Sanatani CRM Error Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
          <AlertTriangle size={64} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">System Interruption</h2>
          <p className="text-sm font-bold text-gray-600 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm max-w-md break-words">
            {this.state.errorMessage}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-sanatani-orange hover:bg-orange-600 text-white font-black py-3 px-6 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-md"
          >
            <RefreshCw size={16} /> REBOOT WORKSPACE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
