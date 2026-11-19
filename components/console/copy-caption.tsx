"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyCaption({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="primary"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        Copy caption
      </Button>
      {copied ? <p role="status">Copied.</p> : null}
    </div>
  );
}
