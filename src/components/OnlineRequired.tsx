import { useState, useEffect, ReactNode } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnlineRequiredProps {
  children: ReactNode;
}

export function OnlineRequired({ children }: OnlineRequiredProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 p-8 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <WifiOff className="h-10 w-10 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Sem conexão com a internet
            </h1>
            <p className="text-muted-foreground">
              Este aplicativo requer conexão com a internet para funcionar.
              Verifique sua conexão e tente novamente.
            </p>
          </div>

          <Button
            onClick={() => window.location.reload()}
            className="gap-2"
            size="lg"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>

          <p className="text-xs text-muted-foreground">
            Dica: Verifique se o Wi-Fi ou dados móveis estão ativados
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
