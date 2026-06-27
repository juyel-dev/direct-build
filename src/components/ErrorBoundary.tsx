import { Component, type ReactNode } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlassCard className="p-8 text-center">
          <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">
            {this.props.fallbackTitle || "Something went wrong"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="mt-6">
            <GlassButton
              variant="primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Try again
            </GlassButton>
          </div>
        </GlassCard>
      );
    }

    return this.props.children;
  }
}
