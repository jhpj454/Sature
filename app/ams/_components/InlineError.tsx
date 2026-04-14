import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export function InlineError({
  title = "Couldn't load data.",
  details,
  retryHref,
  retryLabel = "Retry",
}: {
  title?: string;
  details: string;
  retryHref: string;
  retryLabel?: string;
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-700">{details}</p>
        <Link href={retryHref}>
          <Button variant="outline">{retryLabel}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
