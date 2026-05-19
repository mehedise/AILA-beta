import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  confidence?: number | string | null;
  className?: string;
};

export function ConfidenceBadge({ confidence, className }: Props) {
  const value =
    typeof confidence === "string"
      ? parseFloat(confidence)
      : (confidence ?? 0);

  const variant =
    value >= 0.9
      ? "default"
      : value >= 0.6
        ? "secondary"
        : "destructive";

  const label =
    value >= 0.9 ? "High" : value >= 0.6 ? "Medium" : "Low";

  return (
    <Badge variant={variant} className={cn(className)}>
      {label} ({Math.round(value * 100)}%)
    </Badge>
  );
}

export function fieldConfidenceClass(confidence?: number): string {
  if (!confidence && confidence !== 0) return "";
  if (confidence >= 0.9) return "border-success/40";
  if (confidence >= 0.6) return "border-warning/50";
  return "border-destructive/50";
}
