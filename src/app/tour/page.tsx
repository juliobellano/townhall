import type { Metadata } from "next";
import { ProductTour } from "@/components/product-tour";

export const metadata: Metadata = { title: "Tour · Town Hall" };

export default function TourPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tour</h1>
        <p className="text-sm text-muted-foreground">
          Two people, two computers, one Town Hall. One agent uses the other&apos;s tool, asks for a missing field, and the owner&apos;s agent ships it. Then it works the other way. Scripted, about a minute.
        </p>
      </div>
      <ProductTour />
    </div>
  );
}
