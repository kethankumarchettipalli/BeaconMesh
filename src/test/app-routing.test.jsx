import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
    it("matches a page for / instead of falling back to not found", () => {
        const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
        const matches = router.matchRoutes("/");
        expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    });
    it("matches every public, preview-auth, and workspace route directly", () => {
        const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
        const paths = [
            "/",
            "/about",
            "/how-it-works",
            "/login",
            "/signup",
            "/forgot-password",
            "/verify",
            "/citizen",
            "/citizen/home",
            "/citizen/reports",
            "/citizen/safe-zones",
            "/citizen/profile",
            "/responder",
            "/responder/overview",
            "/responder/incidents/BM-2408-018",
            "/responder/field-map",
            "/responder/status",
            "/command",
            "/command/overview",
            "/command/map",
            "/command/incidents",
            "/command/simulation",
            "/command/messages",
            "/command/users",
        ];
        for (const path of paths) {
            expect(router.matchRoutes(path).at(-1)?.routeId, path).not.toBe(rootRouteId);
        }
    });
});
