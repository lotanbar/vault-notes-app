import type { LegacyTreeNode, LegacyVaultFile, TreeNode, VaultFile } from "../types/vault";
import { serializeVault } from "./serializeVault";
import { appendVaultBlob, backupVaultFile, finalizeVaultWrite, vaultCreateFresh, writeVaultHeader } from "./vaultFileIO";

const MIGRATION_TEMP_SUFFIX = ".migrating.tmp";
const PRE_MIGRATION_BACKUP_SUFFIX = ".pre-v2-backup";

// Moves every node's already-encrypted `content` string out of the tree and
// into the file's blob region, replacing it with a small offset/length ref.
// No decryption happens here — content stays opaque ciphertext the whole
// time, so this works uniformly for locked and unlocked nodes alike, without
// needing any node passwords. Writes to a temp file and only swaps it in via
// atomic rename once fully written; the original is preserved as a backup.
export async function migrateLegacyVault(path: string, legacy: LegacyVaultFile): Promise<VaultFile> {
  const tempPath = `${path}${MIGRATION_TEMP_SUFFIX}`;
  await vaultCreateFresh(tempPath);

  async function migrateNode(node: LegacyTreeNode): Promise<TreeNode> {
    const contentRef = node.content ? await appendVaultBlob(tempPath, node.content) : undefined;
    const children: TreeNode[] = [];
    for (const child of node.children) children.push(await migrateNode(child));
    const { content: _content, ...rest } = node;
    return { ...rest, contentRef, children };
  }

  const tree = await migrateNode(legacy.tree);
  const migrated: VaultFile = {
    version: 2,
    salt: legacy.salt,
    masterCheck: legacy.masterCheck,
    tree,
    index: legacy.index,
  };

  const headerJson = await serializeVault(migrated);
  await writeVaultHeader(tempPath, headerJson);

  await backupVaultFile(path, `${path}${PRE_MIGRATION_BACKUP_SUFFIX}`);
  await finalizeVaultWrite(tempPath, path);
  return migrated;
}
