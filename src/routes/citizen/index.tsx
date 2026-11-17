import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/citizen/")({
  head: () => beaconHead("Citizen Workspace", "Open the BeaconMesh citizen workspace."),
  component: () => <Navigate to="/citizen/home" />,
});
