"use client";

import Link from "next/link";
import { Play, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthRole } from "@/lib/auth/useAuthRole";

export default function HomeActions() {
  const role = useAuthRole();
  const showClinicianWorkspace = role === "clinician" || role === "admin";

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {(role === "parent" || role === "admin" || role === null) && (
        <Link href="/start" className="w-full sm:w-auto">
          <Button size="lg" className="h-12 w-full rounded-xl">
            <Play className="h-4 w-4" />
            Start a walking check
          </Button>
        </Link>
      )}
      {showClinicianWorkspace && (
        <Link href="/portal/clinician" className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="h-12 w-full rounded-xl">
            <Stethoscope className="h-4 w-4" />
            Clinician workspace
          </Button>
        </Link>
      )}
    </div>
  );
}
