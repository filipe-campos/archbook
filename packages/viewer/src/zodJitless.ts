import { config } from "zod";

// The site's Content Security Policy forbids eval, which Zod probes for when a schema is created.
// Imported first in main.tsx, so it runs before @archbook/schema builds its schemas.
config({ jitless: true });
