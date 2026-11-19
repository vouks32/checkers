import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Une erreur inattendue est survenue.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F1F3F5] p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center space-y-4">
            <h1 className="text-xl font-semibold text-slate-900">
              Interruption inattendue
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              L’interface a rencontré un problème technique. Vous pouvez recharger la page pour restaurer votre partie en cours.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-emerald-800 text-white text-sm font-medium rounded-lg hover:bg-emerald-900 transition-colors"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
