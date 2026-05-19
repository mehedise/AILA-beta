"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatGicsLabel,
  GICS_ENTRIES,
  getGicsEntry,
  type GicsEntry,
} from "@/lib/taxonomy/gics";

type Props = {
  value?: string | null;
  onChange: (entry: GicsEntry) => void;
};

export function TaxonomyPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value ? getGicsEntry(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between font-normal text-left"
        )}
        aria-expanded={open}
      >
        <span className="truncate">
          {selected
            ? formatGicsLabel(selected)
            : "Select GICS classification…"}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search sector, industry, sub-industry…" />
          <CommandList>
            <CommandEmpty>No GICS classification found.</CommandEmpty>
            <CommandGroup>
              {GICS_ENTRIES.map((entry) => (
                <CommandItem
                  key={entry.key}
                  value={`${entry.sector} ${entry.industryGroup} ${entry.industry} ${entry.subIndustry} ${entry.subIndustryDescription}`}
                  onSelect={() => {
                    onChange(entry);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === entry.key ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {entry.subIndustry}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.sector} › {entry.industryGroup} › {entry.industry}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
