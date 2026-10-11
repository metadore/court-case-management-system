import * as React from "react";
import { cn } from "../lib/cn";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        className={cn("text-sm font-medium text-gray-700", className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";
