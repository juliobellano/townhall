import type { Metadata } from "next";
import { ProductTour } from "@/components/product-tour";

export const metadata: Metadata = { title: "Tour · Town Hall" };

export default function TourPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tour</h1>
        <p className="text-sm text-muted-foreground">
          Share a tool, let a colleague&apos;s agent use it, and watch the creator&apos;s agent ship the field it was missing. Scripted, about 25 seconds.
        </p>
      </div>
      <ProductTour />
    </div>
  );
}
