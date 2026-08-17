import { SelectField } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function FilterSelect({
  label,
  options,
  className,
  value,
  defaultValue,
  disabled,
  name,
  onValueChange,
}: {
  label: string;
  options: readonly { label: string; value: string }[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 sm:min-w-32", className)}>
      <SelectField
        ariaLabel={label}
        options={options}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        onValueChange={onValueChange}
      />
    </div>
  );
}
