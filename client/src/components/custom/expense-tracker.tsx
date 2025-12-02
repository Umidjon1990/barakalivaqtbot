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
  Trash2,
  Settings2,
  X,
  Pencil,
  Check,
  Utensils,
  Home,
  Heart,
  Plane,
  Gift,
  Briefcase,
  Smartphone,
  Music
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Expense, InsertExpense, ExpenseCategory, InsertExpenseCategory } from "@shared/schema";

const AVAILABLE_ICONS = [
  { name: "wallet", icon: Wallet, label: "Hamyon" },
  { name: "coffee", icon: Coffee, label: "Kofe" },
  { name: "car", icon: Car, label: "Mashina" },
  { name: "shopping", icon: ShoppingBag, label: "Xarid" },
  { name: "zap", icon: Zap, label: "Elektr" },
  { name: "utensils", icon: Utensils, label: "Ovqat" },
  { name: "home", icon: Home, label: "Uy" },
  { name: "heart", icon: Heart, label: "Salomatlik" },
  { name: "plane", icon: Plane, label: "Sayohat" },
  { name: "gift", icon: Gift, label: "Sovg'a" },
  { name: "briefcase", icon: Briefcase, label: "Ish" },
  { name: "smartphone", icon: Smartphone, label: "Telefon" },
  { name: "music", icon: Music, label: "Ko'ngilochar" },
];

const DEFAULT_CATEGORIES = [
  { name: "Ovqat", icon: "coffee" },
  { name: "Yo'l", icon: "car" },
  { name: "Xarid", icon: "shopping" },
  { name: "To'lov", icon: "zap" },
  { name: "Boshqa", icon: "wallet" },
];

async function fetchExpenses(): Promise<Expense[]> {
  const res = await fetch("/api/expenses");
  if (!res.ok) throw new Error("Failed to fetch expenses");
  return res.json();
}

async function createExpense(expense: InsertExpense): Promise<Expense> {
  const res = await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expense),
  });
  if (!res.ok) throw new Error("Failed to create expense");
  return res.json();
}

async function deleteExpense(id: number): Promise<void> {
  const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete expense");
}

async function fetchCategories(): Promise<ExpenseCategory[]> {
  const res = await fetch("/api/expense-categories");
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

async function createCategory(category: InsertExpenseCategory): Promise<ExpenseCategory> {
  const res = await fetch("/api/expense-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(category),
  });
  if (!res.ok) throw new Error("Failed to create category");
  return res.json();
}

async function updateCategory(id: number, updates: Partial<InsertExpenseCategory>): Promise<ExpenseCategory> {
  const res = await fetch(`/api/expense-categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update category");
  return res.json();
}

async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`/api/expense-categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete category");
}

function getIconComponent(iconName: string) {
  const found = AVAILABLE_ICONS.find(i => i.name === iconName);
  return found ? found.icon : Wallet;
}

export function ExpenseTracker() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: fetchExpenses,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchCategories,
  });

  const createExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setAmount("");
      setDescription("");
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const allCategories = categories.length > 0 
    ? categories.map(c => ({ id: c.id, name: c.name, icon: c.icon }))
    : DEFAULT_CATEGORIES.map((c, i) => ({ id: i, ...c }));

  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  const addExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !category) return;

    createExpenseMutation.mutate({
      amount: parseInt(amount.replace(/\s/g, "")),
      description,
      category,
    });
  };

  const handleDeleteExpense = (id: number) => {
    deleteExpenseMutation.mutate(id);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="bg-card rounded-3xl shadow-sm border border-border/40 overflow-hidden flex flex-col h-[600px]">
      <div className="p-6 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-primary">Sarf-Xarajat</h2>
            <p className="text-sm text-muted-foreground">Bugungi moliyaviy holat</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Jami</span>
              <div className="text-2xl font-bold text-destructive flex items-center justify-end gap-2 font-mono">
                {formatCurrency(totalSpent)}
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full" data-testid="btn-open-categories">
                  <Settings2 className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[340px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle className="font-serif">Kategoriyalar</SheetTitle>
                  <SheetDescription>
                    O'z kategoriyalaringizni qo'shing va tahrirlang
                  </SheetDescription>
                </SheetHeader>
                <CategoryManager 
                  categories={categories} 
                  onClose={() => setSheetOpen(false)} 
                />
              </SheetContent>
            </Sheet>
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
              data-testid="input-expense-amount"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Kategoriya" />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((cat) => {
                  const IconComp = getIconComponent(cat.icon);
                  return (
                    <SelectItem key={cat.id} value={cat.name}>
                      <span className="flex items-center gap-2">
                        <IconComp className="w-4 h-4" /> {cat.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nima uchun?" 
              className="flex-1 bg-background"
              data-testid="input-expense-description"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="bg-primary text-primary-foreground shrink-0"
              data-testid="btn-add-expense"
              disabled={createExpenseMutation.isPending}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>

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
                  categories={allCategories}
                  onDelete={() => handleDeleteExpense(expense.id)}
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

function CategoryManager({ categories, onClose }: { categories: ExpenseCategory[], onClose: () => void }) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("wallet");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setNewCategoryName("");
      setNewCategoryIcon("wallet");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<InsertExpenseCategory> }) =>
      updateCategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    createMutation.mutate({ name: newCategoryName, icon: newCategoryIcon });
  };

  const startEdit = (cat: ExpenseCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
  };

  const saveEdit = () => {
    if (editingId === null || !editName.trim()) return;
    updateMutation.mutate({ id: editingId, updates: { name: editName, icon: editIcon } });
  };

  const allCats = categories.length > 0 
    ? categories 
    : DEFAULT_CATEGORIES.map((c, i) => ({ id: -(i + 1), name: c.name, icon: c.icon, color: "" }));

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="flex gap-2">
          <Input 
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Yangi kategoriya nomi..."
            className="flex-1"
            data-testid="input-new-category"
          />
          <Button type="submit" size="icon" disabled={createMutation.isPending} data-testid="btn-add-category">
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_ICONS.map((iconItem) => {
            const IconComp = iconItem.icon;
            return (
              <button
                key={iconItem.name}
                type="button"
                onClick={() => setNewCategoryIcon(iconItem.name)}
                className={cn(
                  "p-2 rounded-lg border transition-all",
                  newCategoryIcon === iconItem.name 
                    ? "border-primary bg-primary/10 text-primary" 
                    : "border-border hover:border-primary/50"
                )}
                title={iconItem.label}
              >
                <IconComp className="w-5 h-5" />
              </button>
            );
          })}
        </div>
      </form>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Mavjud Kategoriyalar</h4>
        {allCats.map((cat) => {
          const IconComp = getIconComponent(cat.icon);
          const isEditing = editingId === cat.id;
          const isDefault = cat.id < 0;

          return (
            <div 
              key={cat.id} 
              className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/20"
            >
              {isEditing ? (
                <>
                  <Select value={editIcon} onValueChange={setEditIcon}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ICONS.map((iconItem) => {
                        const IC = iconItem.icon;
                        return (
                          <SelectItem key={iconItem.name} value={iconItem.name}>
                            <IC className="w-4 h-4" />
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Input 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="icon" variant="ghost" onClick={saveEdit} className="text-primary">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <span className="flex-1 font-medium">{cat.name}</span>
                  {!isDefault && (
                    <>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => startEdit(cat)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => deleteMutation.mutate(cat.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {isDefault && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Standart</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpenseItem({ 
  expense, 
  categories,
  onDelete, 
  formatCurrency 
}: { 
  expense: Expense, 
  categories: { id: number; name: string; icon: string }[],
  onDelete: () => void, 
  formatCurrency: (v: number) => string 
}) {
  const cat = categories.find(c => c.name === expense.category);
  const Icon = cat ? getIconComponent(cat.icon) : Wallet;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center justify-between p-3 rounded-xl bg-card border border-border/50 hover:border-primary/20 transition-all"
      data-testid={`expense-item-${expense.id}`}
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
          data-testid={`btn-delete-expense-${expense.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
