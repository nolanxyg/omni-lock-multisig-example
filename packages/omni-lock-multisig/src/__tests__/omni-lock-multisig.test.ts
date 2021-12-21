import { TestProvider } from "./TestProvider";
import {
  buildCreateAdminCellTx,
  buildUnlockMultisigCellTx,
  buildUpdateAdminCellTx,
  serializeMultisigScript,
} from "../builder";
import {
  signCreateAdminCellTx,
  signUnlockMultisigCellTx,
  signUpdateAdminCellTx,
} from "../signer";
import { key } from "@ckb-lumos/hd";
import { Address, Script, utils } from "@ckb-lumos/base";
import { MultisigScript } from "@ckb-lumos/common-scripts";

const provider = new TestProvider();
const multisigPrivateKeys: string[] = [];
let multisigScript: MultisigScript;
let serializedMultisigScript;
let multisigScriptBlake160;
let omnilockAddress: Address;
let adminCellTypeId: Script;

jest.setTimeout(300000);

beforeAll(async () => {
  console.log("before all");
  await provider.init();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const privateKey1 = provider.testPrivateKeys[1]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const privateKey2 = provider.testPrivateKeys[2]!;
  multisigPrivateKeys.push(privateKey1, privateKey2);
  key.privateKeyToBlake160(privateKey1);
  multisigScript = {
    R: 0,
    M: 2,
    publicKeyHashes: [
      key.privateKeyToBlake160(privateKey1),
      key.privateKeyToBlake160(privateKey2),
    ],
  };
  console.log(`multiscript: ${JSON.stringify(multisigScript, null, 2)}`);
  serializedMultisigScript = serializeMultisigScript(multisigScript);
  console.log(`serializedMultisigScript
 : ${serializedMultisigScript}`);
  multisigScriptBlake160 = new utils.CKBHasher()
    .update(serializedMultisigScript)
    .digestHex()
    .slice(0, 42);
  console.log(`multisigScriptBlake160: ${multisigScriptBlake160}`);
});

test("create admin cell", async () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const senderPrivateKey = provider.testPrivateKeys[1]!;
  const senderAddress = await provider.getGenesisSigner(1).getAddress();
  const buildResult = await buildCreateAdminCellTx(provider, {
    auth_smt_root:
      "0x48633d55e1ab23ac1e05f851b5ac996faef9d3138e08d02727d5e01df637b00b",
    sender: senderAddress,
  });
  omnilockAddress = buildResult.omnilockAddress;
  adminCellTypeId = buildResult.adminCellTypeId;
  const signedTx = await signCreateAdminCellTx(
    buildResult.txSkeleton,
    senderPrivateKey
  );
  console.log(`signed Tx: ${JSON.stringify(signedTx, null, 2)}`);
  const txHash = await provider.sendTxUntilCommitted(signedTx);
  console.log("txHash", txHash);
});

test("unlock omni lock", async () => {
  const smtProof =
    "0x4c4fa6519e47dbecdc20bfc265cdadfe95f7b5d077ff1fad9806a27e099deb14189653ea7500000000000000000000000000000000000000000000000000000000000000004f59";
  const recipient = await provider.getGenesisSigner(1).getAddress();
  const txSkeleton = await buildUnlockMultisigCellTx(provider, {
    sender: omnilockAddress,
    multisigScript: multisigScript,
    smtProof: smtProof,
    adminCellTypeId: adminCellTypeId,
    amount: "100",
    recipient: recipient,
  });
  console.log(`unlock omnilock tx skeleton: ${JSON.stringify(txSkeleton)}`);
  const signedTx = signUnlockMultisigCellTx(
    txSkeleton,
    provider.config,
    multisigScript,
    smtProof,
    multisigPrivateKeys
  );
  console.log(
    `unlock omnilock signed tx: ${JSON.stringify(signedTx, null, 2)}`
  );
  const txHash = await provider.sendTxUntilCommitted(signedTx);
  console.log("txHash", txHash);
});

test("update admin cell", async () => {
  const smtProof =
    "0x4c4fa6519e47dbecdc20bfc265cdadfe95f7b5d077ff1fad9806a27e099deb14189653ea7500000000000000000000000000000000000000000000000000000000000000004f59";
  const senderPrivateKey = provider.testPrivateKeys[3]!;
  const senderAddress = await provider.getGenesisSigner(3).getAddress();

  const txSkeleton = await buildUpdateAdminCellTx(provider, {
    sender: senderAddress,
    multisigScript: multisigScript,
    smtProof: smtProof,
    adminCellTypeId: adminCellTypeId,
    new_auth_smt_root:
      "0xffff3d55e1ab23ac1e05f851b5ac996faef9d3138e08d02727d5e01df637ffff",
  });
  console.log(`update admin cell tx skeleton: ${JSON.stringify(txSkeleton)}`);
  const signedTx = signUpdateAdminCellTx(
    txSkeleton,
    provider.config,
    multisigScript,
    smtProof,
    multisigPrivateKeys,
    senderPrivateKey
  );
  console.log(
    `update admin cell signed tx: ${JSON.stringify(signedTx, null, 2)}`
  );
  const txHash = await provider.sendTxUntilCommitted(signedTx);
  console.log("txHash", txHash);
});
