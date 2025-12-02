import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, TrendingUp, Wallet } from "lucide-react";

const taskData = [
  { name: "Du", completed: 8, total: 12 },
  { name: "Se", completed: 10, total: 12 },
  { name: "Ch", completed: 7, total: 10 },
  { name: "Pa", completed: 12, total: 14 },
  { name: "Ju", completed: 9, total: 10 },
  { name: "Sh", completed: 5, total: 8 },
  { name: "Ya", completed: 6, total: 6 },
];

const expenseData = [
  { name: "Ovqat", value: 450000, color: "hsl(150, 40%, 30%)" },
  { name: "Yo'l", value: 120000, color: "hsl(45, 60%, 50%)" },
  { name: "Xarid", value: 850000, color: "hsl(170, 30%, 40%)" },
  { name: "To'lov", value: 300000, color: "hsl(30, 50%, 60%)" },
];

export function StatsWidget() {
  return (
    <div className="space-y-6 h-full overflow-y-auto pb-20 md:pb-0">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 text-sm font-medium">Haftalik Unumdorlik</p>
              <h3 className="text-3xl font-bold mt-2">85%</h3>
            </div>
            <div className="bg-primary-foreground/20 p-3 rounded-full">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">Bajarilgan Vazifalar</p>
              <h3 className="text-3xl font-bold mt-2 text-primary">42</h3>
            </div>
            <div className="bg-muted p-3 rounded-full text-muted-foreground">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">Haftalik Xarajat</p>
              <h3 className="text-3xl font-bold mt-2 text-destructive">1.7m</h3>
            </div>
            <div className="bg-muted p-3 rounded-full text-muted-foreground">
              <Wallet className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Vazifalar Statistikasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskData}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `${value}`} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar 
                    dataKey="total" 
                    fill="hsl(var(--muted))" 
                    radius={[4, 4, 0, 0]} 
                    stackId="a"
                  />
                  <Bar 
                    dataKey="completed" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                    stackId="b"
                    className="opacity-90 hover:opacity-100 transition-opacity"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Xarajatlar Taqsimoti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(value)}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {expenseData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
