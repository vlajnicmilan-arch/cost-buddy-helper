// MAIL UVOZ — most prema JEDINOM UBL parseru.
// Deno nema globalni DOMParser, pa ga ubrizgavamo iz deno-dom. Logika
// parsiranja se NE duplicira — koristi se ista implementacija kao u aplikaciji.

import { DOMParser as DenoDOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { parseUbl as parseUblCore, setUblXmlParser } from "../eracun/parseUbl.ts";

let configured = false;

const ensureParser = (): void => {
  if (configured) return;
  setUblXmlParser({
    parseFromString: (xml: string, _type: string) =>
      new DenoDOMParser().parseFromString(xml, "text/html") as unknown as Document,
  });
  configured = true;
};

export const parseUbl = (xml: string): Record<string, unknown> => {
  ensureParser();
  return parseUblCore(xml) as unknown as Record<string, unknown>;
};
