import { prepareHydration } from "./lib/extension-hydration";

// Next.js executes this synchronously after HTML loads and before React hydration.
prepareHydration(document);
