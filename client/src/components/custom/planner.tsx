import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  Flag, 
  MoreVertical, 
  Plus, 
  Calendar as CalendarIcon,
  Trash2,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  time?: string; // e.g., "14:00"
  category?: string;
  createdAt: Date;
}

export function PlannerWidget() {
  const [tasks, setTasks] = useState<Task[]>([
    { 
      id: "1", 
      text: "Bomdod namozi va zikrlar", 
      completed: true, 
      priority: "high", 
      time: "05:30",
      category: "Ibadat",
      createdAt: new Date() 
    },
    { 
      id: "2", 
      text: "Loyiha ustida ishlash (Deep Work)", 
      completed: false, 
      priority: "high", 
      time: "09:00",
      category: "Ish",
      createdAt: new Date() 
    },
    { 
      id: "3", 
      text: "Ingliz tili darsi", 
      completed: false, 
      priority: "medium", 
      time: "14:00",
      category: "Ta'lim",
      createdAt: new Date() 
    },
    { 
      id: "4", 
      text: "Oilaviy kechki ovqat", 
      completed: false, 
      priority: "medium", 
      time: "19:00",
      category: "Oila",
      createdAt: new Date() 
    }
  ]);
  
  const [newTask, setNewTask] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<Priority>("medium");

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    const task: Task = {
      id: Date.now().toString(),
      text: newTask,
      completed: false,
      priority: selectedPriority,
      createdAt: new Date(),
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    };

    setTasks([...tasks, task]);
    setNewTask("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const getPriorityColor = (p: Priority) => {
    switch(p) {
      case "high": return "text-destructive bg-destructive/10 border-destructive/20";
      case "medium": return "text-secondary bg-secondary/10 border-secondary/20";
      case "low": return "text-muted-foreground bg-muted border-muted-foreground/20";
    }
  };

  return (
    <div className="bg-card rounded-3xl shadow-sm border border-border/40 overflow-hidden flex flex-col h-[600px]">
      {/* Header Input Section */}
      <div className="p-6 border-b border-border/40 bg-muted/20 space-y-4">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-primary mb-1">Kun Rejalari</h2>
          <p className="text-sm text-muted-foreground">Bugungi maqsadlaringizni belgilang</p>
        </div>

        <form onSubmit={addTask} className="relative">
          <Input 
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Yangi vazifa yozing..." 
            className="pr-24 py-6 text-lg bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-primary rounded-2xl"
          />
          <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                  <Flag className={cn("w-4 h-4", getPriorityColor(selectedPriority).split(" ")[0])} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedPriority("high")}>
                  <Flag className="w-4 h-4 mr-2 text-destructive" /> Muhim
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedPriority("medium")}>
                  <Flag className="w-4 h-4 mr-2 text-secondary" /> O'rta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedPriority("low")}>
                  <Flag className="w-4 h-4 mr-2 text-muted-foreground" /> Oddiy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button type="submit" size="icon" className="h-8 w-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="active" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-4">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="active" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Jarayonda ({activeTasks.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Bajarilgan ({completedTasks.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <ScrollArea className="h-full pr-4">
            <TabsContent value="active" className="mt-0 space-y-3">
              <AnimatePresence mode="popLayout">
                {activeTasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-6 h-6 opacity-20" />
                    </div>
                    <p>Hozircha faol vazifalar yo'q</p>
                  </motion.div>
                ) : (
                  activeTasks.map((task) => (
                    <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
                  ))
                )}
              </AnimatePresence>
            </TabsContent>
            
            <TabsContent value="completed" className="mt-0 space-y-3">
              <AnimatePresence mode="popLayout">
                {completedTasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center"
                  >
                    <p>Hali hech narsa bajarilmadi</p>
                  </motion.div>
                ) : (
                  completedTasks.map((task) => (
                    <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
                  ))
                )}
              </AnimatePresence>
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group relative flex items-start gap-3 p-4 rounded-2xl border transition-all duration-300",
        task.completed 
          ? "bg-muted/20 border-transparent" 
          : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
      )}
    >
      <button 
        onClick={onToggle}
        className={cn(
          "mt-1 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
          task.completed 
            ? "bg-primary border-primary text-primary-foreground" 
            : "border-muted-foreground/30 hover:border-primary text-transparent"
        )}
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn(
          "font-medium leading-snug transition-all break-words",
          task.completed && "text-muted-foreground line-through decoration-primary/30"
        )}>
          {task.text}
        </p>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.time && (
            <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md">
              <Clock className="w-3 h-3" /> {task.time}
            </span>
          )}
          {task.category && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" /> {task.category}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3 bg-card/80 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-border/50">
         <PriorityBadge priority={task.priority} />
         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onDelete}>
           <Trash2 className="w-4 h-4" />
         </Button>
      </div>
    </motion.div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const colors = {
    high: "text-destructive bg-destructive/10",
    medium: "text-secondary bg-secondary/10",
    low: "text-muted-foreground bg-muted"
  };

  if (priority === 'low') return null;

  return (
    <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", colors[priority])}>
      {priority === 'high' ? 'Muhim' : 'O\'rta'}
    </div>
  );
}
