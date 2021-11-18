import {
  Address,
  Cell,
  CellDep,
  Hash,
  HexString,
  Script,
  Transaction,
  utils,
} from "@ckb-lumos/base";
import { common, MultisigScript } from "@ckb-lumos/common-scripts";
import {
  createTransactionFromSkeleton,
  minimalCellCapacity,
  TransactionSkeleton,
  TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import { CkitProvider, helpers } from "@ckitjs/ckit";
import { normalizers, Reader } from "ckb-js-toolkit";
import { SerializeRCData } from "./generated/xudt-rce";
import { SearchKey } from "@ckitjs/mercury-client";
import { SerializeRcLockWitnessLock } from "./generated/rc-lock";
import {
  SerializeTransaction,
  SerializeWitnessArgs,
} from "@ckb-lumos/base/lib/core";

export const SECP256K1_SIGNATURE_PLACEHOLDER =
  "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export interface CreateAdminCellOptions {
  sender: Address; // secp256k1_blake160 lockscript to supply capacity
  auth_smt_root: Hash; // smt_root field of RcRule in admin_cell_data
}

export interface CreateAdminCellResult {
  txSkeleton: TransactionSkeletonType;
  omnilockAddress: Address;
  adminCellTypeId: Script;
}

export interface UnlockMultisigCellOptions {
  sender: Address; // omni multisig lockscript address
  multisigScript: MultisigScript; // multisig config
  smtProof: HexString; // part of omni_multisig_lockscript witness
  adminCellTypeId: Script; // search admin cell via ckb indexer
  recipient: Address;
  amount: string; // unit ckb
}

// export interface UpdateAdminCellOptions {
//   auth_smt_root: Hash;
// }

export async function buildCreateAdminCellTx(
  provider: CkitProvider,
  options: CreateAdminCellOptions
): Promise<CreateAdminCellResult> {
  let txSkeleton = TransactionSkeleton({
    cellProvider: provider.asIndexerCellProvider(),
  });

  // caculate type id
  const [resolved] = await provider.collectCkbLiveCells(options.sender, "0");
  if (!resolved) throw new Error(`${options.sender} has no live ckb`);
  const typeId = provider.generateTypeIdScript(
    { previous_output: resolved.out_point, since: "0x0" },
    "0x0"
  );
  const typeIdHash = utils.computeScriptHash(typeId);
  console.log(`admin cell type id: ${JSON.stringify(typeId)}`);
  console.log(`typeIdHash: ${typeIdHash}`);

  // omni lockscript of admin cell
  const omniLockArgs =
    `0x000000000000000000000000000000000000000000` +
    `01` +
    `${typeIdHash.substring(2)}`;
  const omniLockscriptConfig = await provider.getScriptConfig("RC_LOCK");
  const omniLockscript: Script = {
    code_hash: omniLockscriptConfig.CODE_HASH,
    hash_type: omniLockscriptConfig.HASH_TYPE,
    args: omniLockArgs,
  };
  console.log(`omni multisig lockscript: ${JSON.stringify(omniLockscript)}`);
  console.log(
    `omni multisig lockscript address: ${provider.parseToAddress(
      omniLockscript
    )}`
  );

  // admin cell data
  const serializedRcData = SerializeRCData({
    type: "RCRule",
    value: {
      smt_root: new Reader(options.auth_smt_root).toArrayBuffer(),
      flags: 2,
    },
  });
  const serializedRcDataHexString = new Reader(
    serializedRcData
  ).serializeJson();
  console.log(`admin cell data: ${serializedRcDataHexString}`);

  // admin cell
  const adminCell: Cell = {
    cell_output: {
      capacity: "0x0",
      lock: omniLockscript,
      type: typeId,
    },
    data: serializedRcDataHexString,
  };
  const cellCapacity = minimalCellCapacity(adminCell);
  adminCell.cell_output.capacity = `0x${cellCapacity.toString(16)}`;

  // omnilock cell
  const omnilockCell: Cell = {
    cell_output: {
      capacity: `0x${BigInt(88800000000).toString(16)}`,
      lock: omniLockscript,
    },
    data: "0x",
  };

  // tx skeleton
  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.push(adminCell, omnilockCell);
  });
  txSkeleton = await completeTx(provider, txSkeleton, options.sender);
  console.log(`txSkeleton: ${JSON.stringify(txSkeleton)}`);

  // const secp256k1Config = provider.config.SCRIPTS.SECP256K1_BLAKE160;
  // txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
  //   return cellDeps.clear();
  // });
  // txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
  //   return cellDeps.push({
  //     out_point: {
  //       tx_hash: secp256k1Config.TX_HASH,
  //       index: secp256k1Config.INDEX,
  //     },
  //     dep_type: secp256k1Config.DEP_TYPE,
  //   });
  // });

  return {
    txSkeleton: txSkeleton,
    omnilockAddress: provider.parseToAddress(omniLockscript),
    adminCellTypeId: typeId,
  };
  // return createTransactionFromSkeleton(txSkeleton);
}

// transfer ckb from omni_multisig_lockscript to some recipient
export async function buildUnlockMultisigCellTx(
  provider: CkitProvider,
  options: UnlockMultisigCellOptions
): Promise<TransactionSkeletonType> {
  const {
    sender,
    multisigScript,
    smtProof,
    adminCellTypeId,
    recipient,
    amount,
  } = options;

  let txSkeleton = TransactionSkeleton({
    cellProvider: provider.asIndexerCellProvider(),
  });

  // const omniMultisigLockscript = provider.parseToScript(sender);
  // console.log(
  //   "omniMultisigLockscript:",
  //   `${JSON.stringify(omniMultisigLockscript)}`
  // );

  // search admin cell
  const searchKey: SearchKey = {
    script: adminCellTypeId,
    script_type: "type",
  };
  const adminCellOutpoints = (
    await provider.mercury.get_cells({ search_key: searchKey })
  ).objects;
  if (adminCellOutpoints.length !== 1) throw new Error("admin cell not unique");
  const adminCellCellDep: CellDep = {
    out_point: adminCellOutpoints[0]!.out_point,
    dep_type: "code",
  };

  // add cellDeps
  txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
    const found = provider.config.SCRIPTS.SECP256K1_BLAKE160;
    return cellDeps.push({
      dep_type: found.DEP_TYPE,
      out_point: { tx_hash: found.TX_HASH, index: found.INDEX },
    });
  });
  txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
    return cellDeps.push(adminCellCellDep);
  });
  txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
    const omniLockCellDeap = provider.findCellDepByAddress(sender);
    if (!omniLockCellDeap) throw new Error("can not find omni lock cell dep");
    return cellDeps.push(omniLockCellDeap);
  });

  // add inputs
  const senderNeedCapacity =
    (BigInt(amount) + BigInt(byteLenOfCkbLiveCell(21 + 1 + 32)) + BigInt(1)) *
    BigInt(100000000);
  const senderInputOutpoints = await provider.collectCkbLiveCells(
    sender,
    `0x${senderNeedCapacity.toString(16)}`
  );
  const senderInputCells: Cell[] = senderInputOutpoints.map((outpoint) => ({
    cell_output: {
      capacity: outpoint.output.capacity,
      lock: outpoint.output.lock,
    },
    data: outpoint.output_data,
    out_point: outpoint.out_point,
  }));
  txSkeleton = txSkeleton.update("inputs", (inputs) => {
    return inputs.push(...senderInputCells);
  });

  // add outputs
  const recipientLockscript = provider.parseToScript(recipient);
  const recipientCell: Cell = {
    cell_output: {
      capacity: helpers.Amount.from(amount, 8).toHex(),
      lock: recipientLockscript,
    },
    data: "0x",
  };
  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.push(recipientCell);
  });

  const inputTotalCapacity = senderInputOutpoints
    .map((o) => BigInt(o.output.capacity))
    .reduce((a, b) => a + b, BigInt(0));
  const changeCellCapacity =
    inputTotalCapacity - BigInt(amount) * BigInt(100000000);
  const changeCell: Cell = {
    cell_output: {
      capacity: `0x${changeCellCapacity.toString(16)}`,
      lock: senderInputCells[0]!.cell_output.lock,
    },
    data: "0x",
  };
  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.push(changeCell);
  });

  // add witness
  const serializedMultisigScript = serializeMultisigScript(multisigScript);
  const signaturePlaceHolder =
    serializedMultisigScript +
    SECP256K1_SIGNATURE_PLACEHOLDER.slice(2).repeat(multisigScript.M);
  console.log(`sig place holder: ${signaturePlaceHolder}`);
  const authMultisigBlake160 = new utils.CKBHasher()
    .update(serializedMultisigScript)
    .digestHex()
    .slice(0, 42);
  // const rcIdentity = {
  //   identity: new Reader(`0x06${serializedMultisigScript.slice(2)}`),
  //   proofs: [{ mask: 3, proof: new Reader(smtProof) }],
  // };
  const omniLockWitness = {
    signature: new Reader(signaturePlaceHolder),
    rc_identity: {
      identity: new Reader(`0x06${authMultisigBlake160.slice(2)}`),
      proofs: [{ mask: 3, proof: new Reader(smtProof) }], // TODO check mask
    },
  };
  const omniLockWitnessHexString = new Reader(
    SerializeRcLockWitnessLock(omniLockWitness)
  ).serializeJson();
  const witness = new Reader(
    SerializeWitnessArgs(
      normalizers.NormalizeWitnessArgs({
        lock: omniLockWitnessHexString,
      })
    )
  ).serializeJson();

  txSkeleton = txSkeleton.update("witnesses", (witnesses) => {
    return witnesses.push(witness);
  });

  // pay tx fee
  const txFee = calculateFee(getTransactionSize(txSkeleton));
  console.log(`txFee: ${txFee.toString(10)}`);
  console.log("txSkeletonBefore: ", `${JSON.stringify(txSkeleton)}`);
  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.map((cell) => {
      if (
        cell.cell_output.lock.args ===
          senderInputCells[0]!.cell_output.lock.args &&
        cell.cell_output.lock.hash_type ===
          senderInputCells[0]!.cell_output.lock.hash_type &&
        cell.cell_output.lock.code_hash ===
          senderInputCells[0]!.cell_output.lock.code_hash
      ) {
        cell.cell_output.capacity = `0x${(
          BigInt(cell.cell_output.capacity) - txFee
        ).toString(16)}`;
      }
      return cell;
    });
  });

  console.log("txSkeletonAfter: ", `${JSON.stringify(txSkeleton)}`);
  return txSkeleton;
}

async function completeTx(
  provider: CkitProvider,
  txSkeleton: TransactionSkeletonType,
  fromAddress: string,
  feeRate = BigInt(10000)
): Promise<TransactionSkeletonType> {
  const inputCapacity = txSkeleton
    .get("inputs")
    .map((c) => BigInt(c.cell_output.capacity))
    .reduce((a, b) => a + b, BigInt(0));
  const outputCapacity = txSkeleton
    .get("outputs")
    .map((c) => BigInt(c.cell_output.capacity))
    .reduce((a, b) => a + b, BigInt(0));
  const needCapacity = outputCapacity - inputCapacity + BigInt(100000000);
  txSkeleton = await common.injectCapacity(
    txSkeleton,
    [fromAddress],
    needCapacity,
    undefined,
    undefined,
    {
      enableDeductCapacity: false,
      config: provider.config,
    }
  );
  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    [fromAddress],
    feeRate,
    undefined,
    { config: provider.config }
  );
  return txSkeleton;
}

function byteLenOfCkbLiveCell(lockArgsByteLen = 20): number {
  // prettier-ignore
  return (
        8 /* capacity: u64 */ +
        32 /* code_hash: U256 */ +
        lockArgsByteLen +
        1 /* hash_type: u8 */
    )
}

/**
 *
 * @param params multisig script params
 * @returns serialized multisig script
 */
export function serializeMultisigScript({
  R,
  M,
  publicKeyHashes,
}: MultisigScript): HexString {
  if (R < 0 || R > 255) {
    throw new Error("`R` should be less than 256!");
  }
  if (M < 0 || M > 255) {
    throw new Error("`M` should be less than 256!");
  }
  // TODO: validate publicKeyHashes
  return (
    "0x00" +
    ("00" + R.toString(16)).slice(-2) +
    ("00" + M.toString(16)).slice(-2) +
    ("00" + publicKeyHashes.length.toString(16)).slice(-2) +
    publicKeyHashes.map((h) => h.slice(2)).join("")
  );
}

function getTransactionSize(txSkeleton: TransactionSkeletonType): number {
  const tx = createTransactionFromSkeleton(txSkeleton);
  return getTransactionSizeByTx(tx);
}

function getTransactionSizeByTx(tx: Transaction): number {
  const serializedTx = SerializeTransaction(
    normalizers.NormalizeTransaction(tx)
  );
  // 4 is serialized offset bytesize
  return serializedTx.byteLength + 4;
}

function calculateFee(size: number, feeRate = BigInt(10000)): bigint {
  const ratio = 1000n;
  const base = BigInt(size) * feeRate;
  const fee = base / ratio;
  if (fee * ratio < base) {
    return fee + 1n;
  }
  return fee;
}
