"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> & {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      className,
      checked = false,
      indeterminate = false,
      disabled,
      onCheckedChange,
      "aria-label": ariaLabel,
      ...props
    },
    forwardedRef
  ) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle(forwardedRef, () => innerRef.current!, []);

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <label
        className={cn(
          "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border bg-background transition-colors",
          (checked || indeterminate)
            ? "border-transparent text-white"
            : "border-input hover:border-foreground/40",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        style={
          checked || indeterminate
            ? {
                background:
                  "linear-gradient(135deg, var(--brand-green), color-mix(in oklab, var(--brand-green) 70%, var(--brand-marigold) 30%))",
              }
            : undefined
        }
      >
        <input
          {...props}
          ref={innerRef}
          type="checkbox"
          aria-label={ariaLabel}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="peer absolute h-0 w-0 cursor-pointer opacity-0"
        />
        {indeterminate ? (
          <Minus className="h-3 w-3" strokeWidth={3} />
        ) : checked ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : null}
      </label>
    );
  }
);
