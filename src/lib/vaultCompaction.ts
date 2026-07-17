import type { TreeNode, VaultFile } from "../types/vault";
import { serializeVault } from "./serializeVault";
import { appendVaultBlob, readVaultBlob, vaultCreateFresh, writeVaultHeader } from "./vaultFileIO";

// Rewrites the vault at a fresh path containing only live blobs (dropping
// the dead space left behind by edits/removed attachments since the last
// compaction). Used for "Save As" — since it has to produce a complete,
// valid file at a new path anyway, that's the natural point to compact.
export async function compactVaultTo(vault: VaultFile, oldPath: string, newPath: string): Promise<VaultFile> {
  await vaultCreateFresh(newPath);

  async function rewriteNode(node: TreeNode): Promise<TreeNode> {
    const contentRef = node.contentRef
      ? await appendVaultBlob(newPath, await readVaultBlob(oldPath, node.contentRef))
      : undefined;
    const children: TreeNode[] = [];
    for (const child of node.children) children.push(await rewriteNode(child));
    return { ...node, contentRef, children };
  }

  const tree = await rewriteNode(vault.tree);
  const compacted: VaultFile = { ...vault, tree };
  const headerJson = await serializeVault(compacted);
  await writeVaultHeader(newPath, headerJson);
  return compacted;
}
