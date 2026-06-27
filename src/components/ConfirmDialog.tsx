import { GlassButton } from "@/components/glass/GlassButton";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  variant = "destructive",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: "destructive" | "primary";
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title=""
      footer={
        <div className="flex items-center gap-2">
          <GlassButton variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </GlassButton>
          <GlassButton
            variant={variant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="flex-1"
          >
            {confirmLabel}
          </GlassButton>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-base font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </BottomSheet>
  );
}
