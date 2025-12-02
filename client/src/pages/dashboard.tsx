import { FocusTimer } from "@/components/custom/timer";
import { PlannerWidget } from "@/components/custom/planner";
import { QuoteCard } from "@/components/custom/quote-card";
import { Button } from "@/components/ui/button";
import { Settings, PieChart, Calendar, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Navigation */}
        <header className="flex items-center justify-between pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold text-primary font-serif tracking-tight">Barakali Vaqt</h1>
            <p className="text-muted-foreground font-medium">Rejalashtirish va unumdorlik yordamchisi</p>
          </div>
          
          <div className="flex gap-2 bg-card/50 backdrop-blur-sm p-1.5 rounded-2xl border border-border/40 shadow-sm">
            <NavButton icon={<LayoutGrid className="w-5 h-5" />} active />
            <NavButton icon={<Calendar className="w-5 h-5" />} />
            <NavButton icon={<PieChart className="w-5 h-5" />} />
            <div className="w-px h-6 bg-border mx-1 self-center" />
            <NavButton icon={<Settings className="w-5 h-5" />} />
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          
          {/* Left Column: Focus & Inspiration (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Timer Card */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
              <FocusTimer />
            </div>

            {/* Quote Card */}
            <QuoteCard />
            
            {/* Quick Stats (Mockup) */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Fokus (soat)" value="4.5" trend="+12%" />
              <StatCard label="Vazifalar" value="8/12" trend="66%" color="text-secondary" />
            </div>
          </div>

          {/* Right Column: The Planner (8 cols) */}
          <div className="lg:col-span-8 h-full">
            <PlannerWidget />
          </div>

        </div>
      </div>
    </div>
  );
}

function NavButton({ icon, active = false }: { icon: React.ReactNode, active?: boolean }) {
  return (
    <Button 
      variant={active ? "secondary" : "ghost"} 
      size="icon" 
      className={cn(
        "rounded-xl transition-all duration-300",
        active ? "bg-secondary/10 text-secondary shadow-sm" : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
    </Button>
  );
}

function StatCard({ label, value, trend, color = "text-primary" }: { label: string, value: string, trend: string, color?: string }) {
  return (
    <div className="bg-card p-5 rounded-2xl shadow-sm border border-border/40 flex flex-col justify-between hover:shadow-md transition-all duration-300">
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
      <div className="flex items-end justify-between mt-2">
        <span className={cn("text-3xl font-serif font-bold", color)}>{value}</span>
        <span className="text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
          {trend}
        </span>
      </div>
    </div>
  );
}
