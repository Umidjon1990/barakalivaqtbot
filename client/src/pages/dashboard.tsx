import { FocusTimer } from "@/components/custom/timer";
import { TaskList } from "@/components/custom/task-list";
import { QuoteCard } from "@/components/custom/quote-card";
import { Button } from "@/components/ui/button";
import { Settings, BarChart3, Calendar } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-border/40">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold text-primary">Barakali Vaqt</h1>
            <p className="text-muted-foreground">Har bir daqiqadan unumli foydalaning.</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary/10 hover:text-secondary">
              <BarChart3 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary/10 hover:text-secondary">
              <Calendar className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary/10 hover:text-secondary">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Timer & Quote */}
          <div className="lg:col-span-5 space-y-8">
            <FocusTimer />
            <QuoteCard />
          </div>

          {/* Right Column: Tasks & Stats */}
          <div className="lg:col-span-7 space-y-8">
            <TaskList />
            
            {/* Mini Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border/50">
                <div className="text-4xl font-serif text-primary mb-1">4.5</div>
                <div className="text-sm text-muted-foreground font-medium">Fokus Soatlari</div>
              </div>
              <div className="bg-card p-6 rounded-2xl shadow-sm border border-border/50">
                <div className="text-4xl font-serif text-secondary mb-1">12</div>
                <div className="text-sm text-muted-foreground font-medium">Bajarilgan Vazifalar</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
