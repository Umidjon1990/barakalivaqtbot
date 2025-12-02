import { FocusTimer } from "@/components/custom/timer";
import { PlannerWidget } from "@/components/custom/planner";
import { QuoteCard } from "@/components/custom/quote-card";
import { ExpenseTracker } from "@/components/custom/expense-tracker";
import { StatsWidget } from "@/components/custom/stats-widget";
import { SettingsWidget } from "@/components/custom/settings-widget";
import { Button } from "@/components/ui/button";
import { Settings, PieChart, Calendar, LayoutGrid, Home, ListTodo, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"home" | "planner" | "expenses" | "stats" | "settings">("home");

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
        
        {/* Desktop Header Navigation (Hidden on Mobile) */}
        <header className="hidden md:flex items-center justify-between pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold text-primary font-serif tracking-tight">Barakali Vaqt</h1>
            <p className="text-muted-foreground font-medium">Rejalashtirish va unumdorlik yordamchisi</p>
          </div>
          
          <div className="flex gap-2 bg-card/50 backdrop-blur-sm p-1.5 rounded-2xl border border-border/40 shadow-sm">
            <NavButton icon={<LayoutGrid className="w-5 h-5" />} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
            <NavButton icon={<Calendar className="w-5 h-5" />} active={activeTab === "planner"} onClick={() => setActiveTab("planner")} />
            <NavButton icon={<Wallet className="w-5 h-5" />} active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
            <NavButton icon={<PieChart className="w-5 h-5" />} active={activeTab === "stats"} onClick={() => setActiveTab("stats")} />
            <div className="w-px h-6 bg-border mx-1 self-center" />
            <NavButton icon={<Settings className="w-5 h-5" />} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          </div>
        </header>

        {/* Mobile Header (Simplified) */}
        <header className="md:hidden flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
               <LayoutGrid className="w-6 h-6" />
             </div>
             <div>
                <h1 className="text-xl font-bold text-foreground font-serif">Barakali Vaqt</h1>
                <p className="text-xs text-muted-foreground">Xush kelibsiz</p>
             </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setActiveTab("settings")}>
            <Settings className="w-5 h-5" />
          </Button>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 h-full">
          
          {/* Mobile Tab Switching Logic */}
          <div className={cn("lg:col-span-4 space-y-6", activeTab !== "home" && "hidden lg:block")}>
            {/* Timer Card */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
              <FocusTimer />
            </div>

            {/* Quote Card */}
            <QuoteCard />
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Fokus (soat)" value="4.5" trend="+12%" />
              <StatCard label="Vazifalar" value="8/12" trend="66%" color="text-secondary" />
            </div>
          </div>

          {/* Right Column: The Planner & Expenses & Stats & Settings */}
          <div className={cn("lg:col-span-8 h-full space-y-6", activeTab === "home" && "hidden lg:block")}>
            
            <div className={cn(activeTab !== "planner" && activeTab !== "home" && "hidden", activeTab === "expenses" && "hidden", activeTab === "stats" && "hidden", activeTab === "settings" && "hidden")}>
               <PlannerWidget />
            </div>
            
            <div className={cn(activeTab !== "expenses" && "hidden")}>
               <ExpenseTracker />
            </div>

            <div className={cn(activeTab !== "stats" && "hidden")}>
               <StatsWidget />
            </div>

            <div className={cn(activeTab !== "settings" && "hidden")}>
               <SettingsWidget />
            </div>

          </div>

        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-lg border-t border-border/50 p-2 pb-safe z-50">
        <div className="grid grid-cols-4 gap-1">
          <MobileNavButton 
            icon={<Home className="w-6 h-6" />} 
            label="Asosiy" 
            active={activeTab === "home"} 
            onClick={() => setActiveTab("home")} 
          />
          <MobileNavButton 
            icon={<ListTodo className="w-6 h-6" />} 
            label="Rejalar" 
            active={activeTab === "planner"} 
            onClick={() => setActiveTab("planner")} 
          />
          <MobileNavButton 
            icon={<Wallet className="w-6 h-6" />} 
            label="Xarajat" 
            active={activeTab === "expenses"} 
            onClick={() => setActiveTab("expenses")} 
          />
          <MobileNavButton 
            icon={<PieChart className="w-6 h-6" />} 
            label="Statistika" 
            active={activeTab === "stats"} 
            onClick={() => setActiveTab("stats")} 
          />
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon, active = false, onClick }: { icon: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <Button 
      variant={active ? "secondary" : "ghost"} 
      size="icon" 
      onClick={onClick}
      className={cn(
        "rounded-xl transition-all duration-300",
        active ? "bg-secondary/10 text-secondary shadow-sm" : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
    </Button>
  );
}

function MobileNavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all active:scale-95",
        active ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
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
