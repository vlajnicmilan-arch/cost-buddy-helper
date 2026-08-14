import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle2, Link2, MapPin, Trash2, Upload, FileInput } from 'lucide-react';

/** TEMP diagnostic route — deleted after width investigation. */
const WidthProbe = () => {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto overflow-x-hidden max-w-full">
          <PageContainer noVerticalPadding className="pt-2 min-w-0 w-full">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <FileInput className="w-5 h-5 text-primary" />
                eRačuni — obveze i potraživanja
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <div className="space-y-3 w-full min-w-0 overflow-x-hidden" data-probe="panel">
                <Tabs value="out" className="w-full min-w-0">
                  <TabsList className="h-9 w-full">
                    <TabsTrigger value="in" className="text-xs flex-1 min-w-0">Dugujem</TabsTrigger>
                    <TabsTrigger value="out" className="text-xs flex-1 min-w-0">Duguju mi</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0" data-probe="toolbar">
                  <Tabs value="unpaid" className="min-w-0 max-w-full flex-1 basis-full sm:basis-auto">
                    <TabsList className="h-9 w-full sm:w-auto">
                      <TabsTrigger value="unpaid" className="text-xs flex-1 min-w-0 truncate">Nenaplaćeni (12)</TabsTrigger>
                      <TabsTrigger value="paid" className="text-xs flex-1 min-w-0 truncate">Naplaćeni (98)</TabsTrigger>
                      <TabsTrigger value="all" className="text-xs flex-1 min-w-0 truncate">Sve</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
                    <Button size="sm" variant="outline" className="min-h-[36px] flex-1 sm:flex-none min-w-0">
                      <Link2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                      <span className="truncate">Poveži uplate</span>
                    </Button>
                    <Button size="sm" className="min-h-[36px] flex-1 sm:flex-none min-w-0">
                      <Upload className="w-3.5 h-3.5 mr-1 shrink-0" />
                      <span className="truncate">Učitaj eRačun (XML)</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="p-3 rounded-lg border bg-card" data-probe="card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">DUGO IME TVRTKE d.o.o. za usluge</p>
                          <p className="text-[11px] text-muted-foreground truncate">2026-0001-0001 · dospijeće 15. kol 2026</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertTriangle className="w-3 h-3" />Kasni 120 d
                            </Badge>
                            <button className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground min-h-[24px] max-w-full">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">Bez oznake</span>
                            </button>
                          </div>
                        </div>
                        <div className="text-right shrink-0" data-probe="amount">
                          <p className="font-semibold text-sm">12.345,67 €</p>
                          <p className="text-[10px] text-muted-foreground">PDV 2.469,13 €</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 mt-2" data-probe="actions">
                        <Button size="sm" variant="ghost" className="text-muted-foreground">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Naplaćeno
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PageContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default WidthProbe;
