

# Demo stranica: 4 stila AI avatara

## Pregled
Kreirati privremenu demo stranicu (`/avatar-demo`) koja prikazuje sva 4 stila avatara animirana uživo, tako da možeš vidjeti kako svaki izgleda i reagira prije nego odabereš.

## Što ćeš vidjeti

### 1. Pixel Art Maskota
- Retro pikselirani lik (stil Tamagotchi/8-bit igre)
- Pikselirane oči koje trepću, usta koja se mijenjaju
- Jednostavne ali šarmantne animacije (skakanje, mahanje)
- Boje: ograničena paleta, retro feeling

### 2. Minimalistički Robot
- Moderan obli robot s LED očima (dva kruga koji svijetle)
- Antena koja se njiše, mehanički pokreti
- Oči mijenjaju boju prema raspoloženju (zelena=happy, žuta=thinking, crvena=worried)
- Čist, tehnološki izgled

### 3. Slatka Lisica
- Mala lisica s velikim očima i ekspresivnim ušima
- Uši se pomiču (gore=happy, dolje=worried, nagnute=thinking)
- Rep koji se njiše, treptanje, osmijeh
- Topli narančasto-bijeli tonovi

### 4. Apstraktni Blob
- Fluidna forma koja neprestano mijenja oblik
- Boja se mijenja prema mood-u (plava=neutral, zelena=happy, žuta=thinking)
- "Oči" kao dva svjetleća kruga unutar forme
- Organsko, moderno, minimalistično

## Kako radi demo

Svaki avatar prikazan u kartici s:
- Naziv stila
- Avatar animiran u stvarnom vremenu (idle + floating)
- 4 gumba za mood: neutral, happy, thinking, worried
- Klikom na gumb vidiš kako avatar reagira

## Tehnički detalji

- Nova datoteka: `src/pages/AvatarDemo.tsx` — demo stranica s 4 SVG avatara
- Nova datoteka: `src/components/ai-avatar/PixelAvatar.tsx`
- Nova datoteka: `src/components/ai-avatar/RobotAvatar.tsx`
- Nova datoteka: `src/components/ai-avatar/FoxAvatar.tsx`
- Nova datoteka: `src/components/ai-avatar/BlobAvatar.tsx`
- Ruta dodana u `App.tsx`: `/avatar-demo`
- Sve pure SVG + framer-motion animacije
- Privremeno — briše se nakon odabira

Datoteke za promjenu:
- `src/pages/AvatarDemo.tsx` (nova)
- 4 nova avatar komponente
- `src/App.tsx` — dodati rutu

