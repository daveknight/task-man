import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { AppearanceProvider } from "./lib/appearance.tsx";
import "./index.css";

// Dev-only, so production builds leave the design screens and seed data out.
const DesignApp = import.meta.env.DEV
  ? lazy(() =>
      import("./design/design-app.tsx").then((m) => ({ default: m.DesignApp })),
    )
  : null;

const path = window.location.pathname;
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <TooltipProvider>
          {DesignApp && path.startsWith("/design") ? (
            <Suspense>
              <DesignApp screen={path.split("/")[2] ?? ""} />
            </Suspense>
          ) : (
            <App />
          )}
        </TooltipProvider>
      </AppearanceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
