import { useEffect, useRef } from "react";
import type { NodeApi, NodeRendererProps } from "react-arborist";
import { ChevronRight, ChevronDown, Folder, File, Lock, Unlock } from "lucide-react";
import type { TreeNode } from "../types/vault";
import { useVaultStore } from "../store/vaultStore";

function EditInput({ node }: { node: NodeApi<TreeNode> }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="tree-name-input"
      defaultValue={node.data.name}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => node.reset()}
      onKeyDown={(e) => {
        if (e.key === "Escape") node.reset();
        if (e.key === "Enter") node.submit(inputRef.current?.value ?? "");
      }}
    />
  );
}

interface NodeRowProps extends NodeRendererProps<TreeNode> {
  interactive?: boolean;
}

export function NodeRow({ node, style, dragHandle, interactive = true }: NodeRowProps) {
  const data = node.data;
  const sessionUnlocked = useVaultStore((s) => s.sessionUnlockedIds.has(data.id));
  const toggleNodeLock = useVaultStore((s) => s.toggleNodeLock);

  const multiSelectActive = node.tree.selectedIds.size > 1;

  return (
    <div ref={dragHandle} style={style} className={`tree-row${node.isSelected ? " selected" : ""}`}>
      {data.type === "folder" ? (
        <span
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          {node.isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      ) : (
        <span className="tree-toggle" />
      )}
      <span className="tree-icon">
        {data.type === "folder" ? <Folder size={18} /> : <File size={18} />}
      </span>
      {node.isEditing ? <EditInput node={node} /> : <span className="tree-name">{data.name}</span>}
      {data.locked && (
        <span
          className={`tree-lock${multiSelectActive || !interactive ? " disabled" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (multiSelectActive || !interactive) return;
            toggleNodeLock(data.id);
          }}
        >
          {sessionUnlocked ? <Unlock size={16} /> : <Lock size={16} />}
        </span>
      )}
    </div>
  );
}
