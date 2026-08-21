import { createFileRoute } from "@tanstack/react-router";
import { HarborApp } from "@/components/harbor-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HarborApp />;
}
