"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 -ml-2">
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
