import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/responder/")({
    head: () => beaconHead("Responder Workspace", "Open the BeaconMesh responder workspace."),
    component: () => <Navigate to="/responder/overview"/>,
});
