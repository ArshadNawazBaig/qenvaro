import type * as React from "react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function FilterSelect({
  label,
  options,
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  options: readonly { label: string; value: string }[];
}) {
  return (
    <label className={cn("min-w-0 sm:min-w-32", className)}>
      <span className="sr-only">{label}</span>
      <Select
        aria-label={label}
        className="appearance-none pr-8 text-xs font-semibold"
        style={{
          backgroundImage:
            "linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%)",
          backgroundPosition: "calc(100% - 14px) 50%,calc(100% - 10px) 50%",
          backgroundSize: "4px 4px,4px 4px",
          backgroundRepeat: "no-repeat",
        }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
