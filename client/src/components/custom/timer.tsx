import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, RotateCcw, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

export function FocusTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "break">("focus");

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((seconds) => seconds - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      // Play sound or notify
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === "focus" ? 25 * 60 : 5 * 60);
  };

  const switchMode = (newMode: "focus" | "break") => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(newMode === "focus" ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = mode === "focus" 
    ? ((25 * 60 - timeLeft) / (25 * 60)) * 100 
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  return (
    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
      <CardContent className="p-8 flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-full">
          <Button
            variant={mode === "focus" ? "default" : "ghost"}
            onClick={() => switchMode("focus")}
            className="rounded-full px-6 transition-all"
            data-testid="btn-mode-focus"
          >
            Diqqat (Focus)
          </Button>
          <Button
            variant={mode === "break" ? "secondary" : "ghost"}
            onClick={() => switchMode("break")}
            className="rounded-full px-6 transition-all"
            data-testid="btn-mode-break"
          >
            Tanaffus (Break)
          </Button>
        </div>

        <div className="relative flex items-center justify-center w-64 h-64">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-muted"
            />
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 120}
              strokeDashoffset={2 * Math.PI * 120 * (1 - progress / 100)}
              className={cn(
                "transition-all duration-1000 ease-linear",
                mode === "focus" ? "text-primary" : "text-secondary"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-mono font-bold tracking-tighter" data-testid="text-timer">
              {formatTime(timeLeft)}
            </span>
            <span className="text-muted-foreground mt-2 font-medium">
              {isActive ? (mode === "focus" ? "Diqqat qiling" : "Dam oling") : "Tayyormisiz?"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            size="lg"
            variant="outline"
            className="rounded-full w-14 h-14 p-0 border-2"
            onClick={resetTimer}
            data-testid="btn-reset"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
          
          <Button
            size="lg"
            className={cn(
              "rounded-full w-20 h-20 p-0 shadow-xl transition-all hover:scale-105",
              isActive ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"
            )}
            onClick={toggleTimer}
            data-testid="btn-toggle"
          >
            {isActive ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </Button>

          {mode === "focus" && (
             <Button
             size="lg"
             variant="outline"
             className="rounded-full w-14 h-14 p-0 border-2 text-secondary hover:text-secondary-foreground hover:bg-secondary"
             onClick={() => switchMode("break")}
             data-testid="btn-skip"
           >
             <Coffee className="w-5 h-5" />
           </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
