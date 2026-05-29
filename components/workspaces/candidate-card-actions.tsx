"use client";

import { Ellipsis, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type CandidateCardActionsProps = {
  apiPath: string;
  candidateName: string;
};

export function CandidateCardActions({ apiPath, candidateName }: CandidateCardActionsProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleDelete() {
    if (!window.confirm(`确定删除候选人「${candidateName}」吗？这会同时删除简历材料和分析结果。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(apiPath, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "删除失败");
      }

      setIsOpen(false);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="candidate-card-actions" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${candidateName} 操作`}
        className="icon-button candidate-card-action-trigger"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="candidate-card-action-menu" role="menu">
          <button
            className="candidate-card-action-item danger"
            disabled={isDeleting}
            onClick={handleDelete}
            role="menuitem"
            type="button"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>{isDeleting ? "删除中" : "删除候选人"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
