import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { createContext, useContext } from 'react';
import { cn } from '~/lib/utils';

const toggleGroupVariants = cva(
  'group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input',
      },
      size: {
        default: 'h-11 min-w-9 sm:h-9',
        sm: 'h-11 min-w-8 sm:h-8',
        lg: 'h-12 min-w-10 sm:h-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const ToggleGroupContext = createContext<
  VariantProps<typeof toggleGroupVariants>
>({
  variant: 'default',
  size: 'default',
});

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleGroupVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(toggleGroupVariants({ variant, size }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupVariants>) {
  const context = useContext(ToggleGroupContext);
  const resolved = {
    variant: context.variant ?? variant,
    size: context.size ?? size,
  };

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={resolved.variant}
      data-size={resolved.size}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=outline]:border-l data-[variant=outline]:shadow-xs data-[variant=outline]:first:rounded-l-md data-[variant=outline]:last:rounded-r-md data-[variant=outline]:first:border-l-0",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, toggleGroupVariants };
