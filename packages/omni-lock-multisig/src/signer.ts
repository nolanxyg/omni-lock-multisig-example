import { HexString, Transaction, utils } from "@ckb-lumos/base";
import {
  common,
  MultisigScript,
  secp256k1Blake160Multisig,
} from "@ckb-lumos/common-scripts";
import {
  createTransactionFromSkeleton,
  sealTransaction,
  TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import { key } from "@ckb-lumos/hd";
import { nonNullable } from "./utils";
import { CkitConfig } from "@ckitjs/ckit";
import { normalizers, Reader } from "ckb-js-toolkit";
import { SerializeRcLockWitnessLock } from "./generated/rc-lock";
import { serializeMultisigScript } from "./builder";
import { SerializeWitnessArgs } from "@ckb-lumos/base/lib/core";

export async function signCreateAdminCellTx(
  txSkeleton: TransactionSkeletonType,
  privateKey: string
): Promise<Transaction> {
  txSkeleton = common.prepareSigningEntries(txSkeleton);
  const { message } = nonNullable(txSkeleton.get("signingEntries").get(0));
  const Sig = key.signRecoverable(message, privateKey);
  return sealTransaction(txSkeleton, [Sig]);
}

export function signUnlockMultisigCellTx(
  txSkeleton: TransactionSkeletonType,
  config: CkitConfig,
  multisigScript: MultisigScript,
  smtProof: HexString,
  privateKeys: string[]
): Transaction {
  const trickyLumosConfig = {
    PREFIX: config.PREFIX,
    SCRIPTS: {
      SECP256K1_BLAKE160_MULTISIG: config.SCRIPTS.RC_LOCK,
    },
  };
  txSkeleton = secp256k1Blake160Multisig.prepareSigningEntries(txSkeleton, {
    config: trickyLumosConfig,
  });

  const { message } = nonNullable(txSkeleton.get("signingEntries").get(0));
  // const message =
  //   "0x123478c07740eef9989a7f27d207792fdcae04e9ad6578cbce59981016684983";

  console.log(`unlock omnilock msg: ${message}`);
  const sigs = privateKeys.map((privKey) => {
    return key.signRecoverable(message, privKey).slice(2);
  });
  const multisigs = sigs.join("");
  console.log(`multisigs: ${multisigs}`);

  // const unsignedWitness = txSkeleton.witnesses.get(0)!;
  // const unsignedWitnessArgs = new core.WitnessArgs(new Reader(unsignedWitness));
  // const unsignedLock = unsignedWitnessArgs.getLock().value().raw();
  // const omniLock = new RcLockWitnessLock(unsignedLock, { validate: true });

  const serializedMultisigScript = serializeMultisigScript(multisigScript);
  const signaturePlaceHolder = serializedMultisigScript + multisigs;
  console.log(`sigs: ${signaturePlaceHolder}`);
  const authMultisigBlake160 = new utils.CKBHasher()
    .update(serializedMultisigScript)
    .digestHex()
    .slice(0, 42);
  const omniLockWitness = {
    signature: new Reader(signaturePlaceHolder),
    rc_identity: {
      identity: new Reader(`0x06${authMultisigBlake160.slice(2)}`),
      proofs: [{ mask: 3, proof: new Reader(smtProof) }],
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
    return witnesses.map((value, index) => {
      if (index === 0) {
        return witness;
      }
      return value;
    });
  });
  return createTransactionFromSkeleton(txSkeleton);
}

export function signUpdateAdminCellTx(
  txSkeleton: TransactionSkeletonType,
  config: CkitConfig,
  multisigScript: MultisigScript,
  smtProof: HexString,
  privateKeys: string[],
  senderPrivateKey: string
): Transaction {
  const trickyLumosConfig = {
    PREFIX: config.PREFIX,
    SCRIPTS: {
      SECP256K1_BLAKE160_MULTISIG: config.SCRIPTS.RC_LOCK,
      SECP256K1_BLAKE160: config.SCRIPTS.SECP256K1_BLAKE160,
    },
  };
  txSkeleton = common.prepareSigningEntries(txSkeleton, {
    config: trickyLumosConfig,
  });
  console.log(
    "txSkeletonWithSigningEntries: ",
    `${JSON.stringify(txSkeleton)}`
  );

  // const trickyLumosConfigMK = {
  //   PREFIX: config.PREFIX,
  //   SCRIPTS: {
  //     SECP256K1_BLAKE160: config.SCRIPTS.SECP256K1_BLAKE160,
  //     SECP256K1_BLAKE160_MULTISIG: config.SCRIPTS.RC_LOCK,
  //   },
  // };
  // console.log(
  //   "txSkeletonWithSigningEntriesMK: ",
  //   `${JSON.stringify(
  //     common.prepareSigningEntries(txSkeleton, {
  //       config: trickyLumosConfigMK,
  //     })
  //   )}`
  // );

  const { message } = nonNullable(
    txSkeleton
      .get("signingEntries")
      .filter((value) => value.index === 0)
      .get(0)
  );
  // const message =
  //   "0x123478c07740eef9989a7f27d207792fdcae04e9ad6578cbce59981016684983";

  console.log(`update admin cell msg: ${message}`);
  const sigs = privateKeys.map((privKey) => {
    return key.signRecoverable(message, privKey).slice(2);
  });
  const multisigs = sigs.join("");
  console.log(`multisigs: ${multisigs}`);

  // const unsignedWitness = txSkeleton.witnesses.get(0)!;
  // const unsignedWitnessArgs = new core.WitnessArgs(new Reader(unsignedWitness));
  // const unsignedLock = unsignedWitnessArgs.getLock().value().raw();
  // const omniLock = new RcLockWitnessLock(unsignedLock, { validate: true });

  const serializedMultisigScript = serializeMultisigScript(multisigScript);
  const signaturePlaceHolder = serializedMultisigScript + multisigs;
  console.log(`sigs: ${signaturePlaceHolder}`);
  const authMultisigBlake160 = new utils.CKBHasher()
    .update(serializedMultisigScript)
    .digestHex()
    .slice(0, 42);
  const omniLockWitness = {
    signature: new Reader(signaturePlaceHolder),
    rc_identity: {
      identity: new Reader(`0x06${authMultisigBlake160.slice(2)}`),
      proofs: [{ mask: 3, proof: new Reader(smtProof) }],
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
    return witnesses.map((value, index) => {
      if (index === 0) {
        return witness;
      }
      return value;
    });
  });

  const { message: senderMessageToSign } = nonNullable(
    txSkeleton
      .get("signingEntries")
      .filter((value) => value.index === 1)
      .get(0)
  );
  console.log(`update admin cell senderMessageToSign: ${senderMessageToSign}`);
  const senderSignature = key.signRecoverable(
    senderMessageToSign,
    senderPrivateKey
  );

  const senderWitness = new Reader(
    SerializeWitnessArgs(
      normalizers.NormalizeWitnessArgs({
        lock: senderSignature,
      })
    )
  ).serializeJson();

  txSkeleton = txSkeleton.update("witnesses", (witnesses) => {
    return witnesses.map((value, index) => {
      if (index === 1) {
        return senderWitness;
      }
      return value;
    });
  });

  return createTransactionFromSkeleton(txSkeleton);
}
