"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteResourceButtonProps = {
  apiPath: string;
  confirmMessage: string;
  label?: string;
  redirectTo?: string;
  title: string;
};

export function DeleteResourceButton({
  apiPath,
  confirmMessage,
  label = "删除",
  redirectTo,
  title,
}: DeleteResourceButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(apiPath, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "删除失败");
      }

      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      className="row-action-button danger"
      disabled={isDeleting}
      onClick={handleDelete}
      title={title}
      type="button"
    >
      <Trash2 size={16} aria-hidden="true" />
      <span>{isDeleting ? "删除中" : label}</span>
    </button>
  );
}
