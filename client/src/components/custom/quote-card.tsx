import { Quote } from "lucide-react";

export function QuoteCard() {
  return (
    <div className="bg-secondary/10 border border-secondary/20 rounded-2xl p-6 relative overflow-hidden">
      <Quote className="absolute top-4 left-4 w-8 h-8 text-secondary/20 rotate-180" />
      
      <blockquote className="relative z-10 text-center space-y-4 px-4 py-2">
        <p className="text-lg md:text-xl font-serif text-foreground/90 leading-relaxed italic">
          "Ikki ne'mat borki, ko'pchilik odamlar ularning qadriga yetmaydilar: sihat-salomatlik va bo'sh vaqt."
        </p>
        <footer className="text-sm font-medium text-primary/80 font-sans uppercase tracking-widest">
          — Hadis
        </footer>
      </blockquote>
      
      <Quote className="absolute bottom-4 right-4 w-8 h-8 text-secondary/20" />
    </div>
  );
}
