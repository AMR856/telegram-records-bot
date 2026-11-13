"use client";

import { AppShell } from "@/components/AppShell";
import { PackagesPage } from "@/components/packages/PackagesPage";

export default function PackagesRoute() {
  return (
    <AppShell>
      <PackagesPage />
    </AppShell>
  );
}
