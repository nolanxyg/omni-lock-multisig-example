import { Transaction } from "@ckb-lumos/base";
import { common } from "@ckb-lumos/common-scripts";
import { sealTransaction, TransactionSkeletonType } from "@ckb-lumos/helpers";
import { key } from "@ckb-lumos/hd";
import { nonNullable } from "./utils";

export async function signCreateAdminCellTx(
  txSkeleton: TransactionSkeletonType,
  privateKey: string
): Promise<Transaction> {
  txSkeleton = common.prepareSigningEntries(txSkeleton);
  const { message } = nonNullable(txSkeleton.get("signingEntries").get(0));
  const Sig = key.signRecoverable(message, privateKey);
  return sealTransaction(txSkeleton, [Sig]);
  // const hash = await provider.sendTransaction(tx);
  // await provider.waitForTransactionCommitted(hash);
  // return hash;
}
