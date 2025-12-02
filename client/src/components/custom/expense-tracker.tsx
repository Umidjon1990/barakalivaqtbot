import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Wallet, 
  TrendingDown, 
  ShoppingBag, 
  Coffee, 
  Car, 
  Zap,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: "food" | "transport" | "shopping" | "bills" | "other";
  date: Date;
}

export function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: "1", amount: 25000, description: "Tushlik", category: "food", date: new Date() },
    { id: "2", amount: 12000, description: "Taksi", category: "transport", date: new Date() },
  ]);
  
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("food");

  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  const addExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const newExpense: Expense = {
      id: Date.now().toString(),
      amount: parseInt(amount.replace(/\s/g, "")),
      description,
      category: category as any,
      date: new Date(),
    };

    setExpenses([newExpense, ...expenses]);
    setAmount("");
    setDescription("");
  };

  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="bg-card rounded-3xl shadow-sm border border-border/40 overflow-hidden flex flex-col h-[600px]">
      {/* Header & Total */}
      <div className="p-6 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-primary">Sarf-Xarajat</h2>
            <p className="text-sm text-muted-foreground">Bugungi moliyaviy holat</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Jami</span>
            <div className="text-2xl font-bold text-destructive flex items-center justify-end gap-2 font-mono">
              {formatCurrency(totalSpent)}
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        <form onSubmit={addExpense} className="space-y-3">
          <div className="flex gap-2">
            <Input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Summa (so'm)" 
              className="flex-1 bg-background font-mono"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food"><span className="flex items-center gap-2"><Coffee className="w-4 h-4" /> Ovqat</span></SelectItem>
                <SelectItem value="transport"><span className="flex items-center gap-2"><Car className="w-4 h-4" /> Yo'l</span></SelectItem>
                <SelectItem value="shopping"><span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Xarid</span></SelectItem>
                <SelectItem value="bills"><span className="flex items-center gap-2"><Zap className="w-4 h-4" /> To'lov</span></SelectItem>
                <SelectItem value="other"><span className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Boshqa</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nima uchun?" 
              className="flex-1 bg-background"
            />
            <Button type="submit" size="icon" className="bg-primary text-primary-foreground shrink-0">
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {expenses.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center opacity-50"
              >
                <Wallet className="w-12 h-12 mb-2" />
                <p>Bugun xarajat qilmadingiz</p>
              </motion.div>
            ) : (
              expenses.map((expense) => (
                <ExpenseItem 
                  key={expense.id} 
                  expense={expense} 
                  onDelete={() => deleteExpense(expense.id)}
                  formatCurrency={formatCurrency}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

function ExpenseItem({ expense, onDelete, formatCurrency }: { expense: Expense, onDelete: () => void, formatCurrency: (v: number) => string }) {
  const icons = {
    food: Coffee,
    transport: Car,
    shopping: ShoppingBag,
    bills: Zap,
    other: Wallet
  };

  const Icon = icons[expense.category];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center justify-between p-3 rounded-xl bg-card border border-border/50 hover:border-primary/20 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-medium leading-none">{expense.description}</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{expense.category}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold text-destructive">
          -{formatCurrency(expense.amount)}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onDelete}
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
