import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { captureSentryException } from '@/lib/sentry';
import { notifyCrash } from '@/lib/notifyCrash';
import { APP_VERSION } from '@/lib/version';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // Critical: log full React crash to diagnostics so admin sees it in Pulse.
    try {
      logDiagnostic({
        event: 'react_error_boundary',
        severity: 'critical',
        details: {
          message: error.message,
          name: error.name,
          stack: error.stack?.slice(0, 2000),
          componentStack: errorInfo.componentStack?.slice(0, 1000),
        },
      });
    } catch {
      /* logger must never break recovery */
    }
    // Send to Sentry for stack trace + breadcrumbs + grouping.
    captureSentryException(error, {
      componentStack: errorInfo.componentStack?.slice(0, 2000),
      source: 'ErrorBoundary',
    });
    // Instant email alert to admins (bypasses 5-min cron).
    try {
      notifyCrash({
        source: 'error_boundary',
        message: error.message || error.name || 'Unknown React error',
        stack: error.stack?.slice(0, 4000),
        componentStack: errorInfo.componentStack?.slice(0, 2000),
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        appVersion: APP_VERSION,
      });
    } catch {
      /* never break recovery */
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Ups, nešto je pošlo po krivu</h1>
              <p className="text-muted-foreground text-sm">
                Došlo je do neočekivane greške. Pokušajte osvježiti stranicu ili se vratite na početnu.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left bg-muted rounded-lg p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium mb-1">Tehnički detalji</summary>
                <pre className="whitespace-pre-wrap break-all mt-2">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Osvježi stranicu
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="w-4 h-4" />
                Idi na početnu
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
