import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="badge" className={cn("badge", className)} {...props} />;
}
