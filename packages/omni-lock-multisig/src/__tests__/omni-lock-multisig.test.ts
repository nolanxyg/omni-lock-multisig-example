import {TestProvider} from "./TestProvider";
import {buildCreateAdminCellTx} from "../builder";
import {signCreateAdminCellTx} from "../signer";
import {generateSecp256k1Blake160Address} from "@ckb-lumos/helpers";
import { key } from '@ckb-lumos/hd';

const provider = new TestProvider();

jest.setTimeout(300000);

beforeAll(async () => {
    console.log('before all');
    await provider.init();
});

test('create admin cell', async () => {
    const senderPrivateKey = provider.testPrivateKeys[1]!;
    // const senderAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(senderPrivateKey));
    const senderAddress = await provider.getGenesisSigner(1).getAddress();
    const unsignedTx = await buildCreateAdminCellTx(senderAddress, provider, {auth_smt_root: '0x1faef097431e6bfe5e6175c414df885519466024984b8ebf3f93f6136a124b09'});
    const signedTx = await signCreateAdminCellTx(unsignedTx, senderPrivateKey);
    console.log(`signed Tx: ${JSON.stringify(signedTx)}`);
    const txHash = await provider.sendTxUntilCommitted(signedTx);
    console.log('txHash', txHash);
});