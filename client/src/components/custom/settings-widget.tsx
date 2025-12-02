import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { Moon, Sun, Bell, Globe, Trash2, Save } from "lucide-react";
import { useTheme } from "next-themes";

export function SettingsWidget() {
  // Note: Real theme switching requires next-themes provider setup in App.tsx, 
  // but for now we'll just simulate the UI state or toggle a class if simple.
  const [notifications, setNotifications] = useState(true);
  const [focusDuration, setFocusDuration] = useState("25");
  
  // Mock theme toggle for visual demo
  const [isDarkMode, setIsDarkMode] = useState(false); 

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 md:pb-0">
      <Card className="border-border/40 shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Umumiy Sozlamalar</CardTitle>
          <CardDescription>Ilovani o'zingizga moslang</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </div>
              <div className="space-y-0.5">
                <Label className="text-base">Tungi Rejim</Label>
                <p className="text-sm text-muted-foreground">Ko'zlarni asrash uchun qorong'u mavzu</p>
              </div>
            </div>
            <Switch checked={isDarkMode} onCheckedChange={toggleTheme} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                <Bell className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-base">Bildirishnomalar</Label>
                <p className="text-sm text-muted-foreground">Vazifalar va taymer haqida eslatmalar</p>
              </div>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                <Globe className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <Label className="text-base">Til (Language)</Label>
                <p className="text-sm text-muted-foreground">Ilova interfeysi tili</p>
              </div>
            </div>
            <Select defaultValue="uz">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tilni tanlang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uz">O'zbekcha</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      <Card className="border-border/40 shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Fokus Taymer</CardTitle>
          <CardDescription>Pomodoro texnikasi sozlamalari</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fokus vaqti (daq)</Label>
              <Input 
                type="number" 
                value={focusDuration} 
                onChange={(e) => setFocusDuration(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Tanaffus vaqti (daq)</Label>
              <Input type="number" defaultValue="5" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/20 shadow-sm bg-destructive/5">
        <CardHeader>
          <CardTitle className="font-serif text-xl text-destructive">Xavfli Hudud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-destructive">Ma'lumotlarni tozalash</Label>
              <p className="text-sm text-muted-foreground">Barcha vazifalar va statistika o'chiriladi</p>
            </div>
            <Button variant="destructive" size="sm" className="gap-2">
              <Trash2 className="w-4 h-4" /> Tozalash
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button size="lg" className="gap-2 rounded-full px-8">
          <Save className="w-4 h-4" /> Saqlash
        </Button>
      </div>
    </div>
  );
}
