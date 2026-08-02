import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 bg-card border-border shadow-xl">
        <CardContent className="pt-6 text-center">
          <div className="flex flex-col items-center mb-4 gap-4">
            <AlertCircle className="h-16 w-16 text-primary" />
            <h1 className="text-3xl font-extrabold text-foreground">404</h1>
            <h2 className="text-xl font-bold text-foreground">Page Not Found</h2>
          </div>

          <p className="mt-4 text-text-dim">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-8 px-6 py-3 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition-all"
          >
            Go Home
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
