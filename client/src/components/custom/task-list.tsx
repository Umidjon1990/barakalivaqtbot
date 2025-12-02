import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", text: "Tonggi zikr va mulohaza", completed: true },
    { id: "2", text: "Eng muhim ishni aniqlash", completed: false },
    { id: "3", text: "Kitob o'qish (20 bet)", completed: false },
  ]);
  const [newTask, setNewTask] = useState("");

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    
    setTasks([
      ...tasks,
      { id: Date.now().toString(), text: newTask, completed: false }
    ]);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-serif font-semibold text-primary">Bugungi Maqsadlar</h3>
        <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {tasks.filter(t => t.completed).length}/{tasks.length}
        </span>
      </div>

      <form onSubmit={addTask} className="flex gap-2">
        <Input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Yangi vazifa qo'shish..."
          className="bg-background/50 border-muted-foreground/20 focus-visible:ring-primary"
          data-testid="input-new-task"
        />
        <Button type="submit" size="icon" className="shrink-0" data-testid="btn-add-task">
          <Plus className="w-5 h-5" />
        </Button>
      </form>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "group flex items-center gap-3 p-4 rounded-xl border transition-all duration-300",
                task.completed 
                  ? "bg-muted/30 border-transparent" 
                  : "bg-card border-border shadow-sm hover:shadow-md hover:border-primary/20"
              )}
            >
              <Checkbox
                checked={task.completed}
                onCheckedChange={() => toggleTask(task.id)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary w-5 h-5 rounded-full"
                data-testid={`checkbox-task-${task.id}`}
              />
              <span 
                className={cn(
                  "flex-1 font-medium transition-all",
                  task.completed && "text-muted-foreground line-through decoration-primary/30"
                )}
              >
                {task.text}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                data-testid={`btn-delete-task-${task.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {tasks.length === 0 && (
          <div className="text-center py-10 text-muted-foreground italic">
            Hozircha vazifalar yo'q. Boshlash uchun qo'shing.
          </div>
        )}
      </div>
    </div>
  );
}
