import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PixelAvatar } from "@/components/ai-avatar/PixelAvatar";
import { RobotAvatar } from "@/components/ai-avatar/RobotAvatar";
import { FoxAvatar } from "@/components/ai-avatar/FoxAvatar";
import { BlobAvatar } from "@/components/ai-avatar/BlobAvatar";

type Mood = "neutral" | "happy" | "thinking" | "worried";

const moods: { label: string; value: Mood; emoji: string }[] = [
  { label: "Neutral", value: "neutral", emoji: "😐" },
  { label: "Happy", value: "happy", emoji: "😊" },
  { label: "Thinking", value: "thinking", emoji: "🤔" },
  { label: "Worried", value: "worried", emoji: "😟" },
];

const avatars = [
  { name: "Pixel Art Maskota", desc: "Retro 8-bit stil, Tamagotchi feeling", Component: PixelAvatar },
  { name: "Minimalistički Robot", desc: "LED oči, antena, mehanički pokreti", Component: RobotAvatar },
  { name: "Slatka Lisica", desc: "Ekspresivne uši, rep, topli tonovi", Component: FoxAvatar },
  { name: "Apstraktni Blob", desc: "Fluidna forma, mijenja boju i oblik", Component: BlobAvatar },
];

const AvatarDemo = () => {
  const [moodMap, setMoodMap] = useState<Record<number, Mood>>({});

  return (
    <div className="min-h-dvh bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">AI Avatar Demo</h1>
        <p className="text-muted-foreground mb-8">Klikni na raspoloženja ispod svakog avatara da vidiš kako reagira.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {avatars.map((av, i) => {
            const mood = moodMap[i] || "neutral";
            return (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{av.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{av.desc}</p>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4 pb-6">
                  <div className="h-36 flex items-center justify-center">
                    <av.Component mood={mood} size={130} />
                  </div>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {moods.map((m) => (
                      <Button
                        key={m.value}
                        variant={mood === m.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMoodMap((p) => ({ ...p, [i]: m.value }))}
                      >
                        {m.emoji} {m.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AvatarDemo;
