import { Hash, Address, Transaction, Cell, HexString, utils, Script } from '@ckb-lumos/base';
import { common } from '@ckb-lumos/common-scripts';
import {
    createTransactionFromSkeleton,
    generateSecp256k1Blake160Address,
    minimalCellCapacity,
    parseAddress,
    sealTransaction,
    TransactionSkeleton,
    TransactionSkeletonType,
} from '@ckb-lumos/helpers';
import { CkitProvider } from '@ckitjs/ckit';
import { SerializeRCData } from './generated/xudt-rce';
import { Reader } from 'ckb-js-toolkit';

export interface CreateAdminCellOptions {
    auth_smt_root: Hash;
}

export async function buildCreateAdminCellTx(
    txSenderAddress: Address,
    provider: CkitProvider,
    options: CreateAdminCellOptions,
): Promise<TransactionSkeletonType> {
    const secp256k1Config = provider.config.SCRIPTS.SECP256K1_BLAKE160;
    let txSkeleton = TransactionSkeleton({ cellProvider: provider.asIndexerCellProvider() });
    // const fromLockscript = parseAddress(fromAddress, { config: provider.config });


    const [resolved] = await provider.collectCkbLiveCells(txSenderAddress, '0');
    if (!resolved) throw new Error(`${txSenderAddress} has no live ckb`);
    const typeId = provider.generateTypeIdScript({ previous_output: resolved.out_point, since: '0x0' }, '0x0');
    const typeIdHash = utils.computeScriptHash(typeId);
    console.log('typeIdHash:', typeIdHash);
    const omniLockArgs = `0x000000000000000000000000000000000000000000` + `01` + `${typeIdHash.substring(2)}`;
    const config = await provider.getScriptConfig('RC_LOCK');

    const omniLockscript: Script = {
        code_hash: config.CODE_HASH,
        hash_type: config.HASH_TYPE,
        args: omniLockArgs,
    };
    const rcData = SerializeRCData({
        type: 'RCRule',
        value: { smt_root: Reader.fromRawString(options.auth_smt_root.substring(2)).toArrayBuffer(), flags: 2 },
    });
    console.log('auth rcData', rcData, new Reader(rcData).serializeJson());

    const adminCell: Cell = {
        cell_output: {
            capacity: '0x0',
            lock: omniLockscript,
            type: typeId,
        },
        data: new Reader(rcData).serializeJson(),
    };
    const cellCapacity = minimalCellCapacity(adminCell);
    adminCell.cell_output.capacity = `0x${cellCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
        return outputs.push(adminCell);
    });

    txSkeleton = await completeTx(txSkeleton, txSenderAddress);

    txSkeleton = txSkeleton.update('cellDeps', (cellDeps) => {
        return cellDeps.clear();
    });
    txSkeleton = txSkeleton.update('cellDeps', (cellDeps) => {
        return cellDeps.push({
            out_point: { tx_hash: secp256k1Config.TX_HASH, index: secp256k1Config.INDEX },
            dep_type: secp256k1Config.DEP_TYPE,
        });
    });

    console.log('txSkeleton', txSkeleton);
    return txSkeleton;
    // return createTransactionFromSkeleton(txSkeleton);
}

async function completeTx(
    txSkeleton: TransactionSkeletonType,
    fromAddress: string,
    feeRate = BigInt(10000),
): Promise<TransactionSkeletonType> {
    const inputCapacity = txSkeleton
        .get('inputs')
        .map((c) => BigInt(c.cell_output.capacity))
        .reduce((a, b) => a + b, BigInt(0));
    const outputCapacity = txSkeleton
        .get('outputs')
        .map((c) => BigInt(c.cell_output.capacity))
        .reduce((a, b) => a + b, BigInt(0));
    const needCapacity = outputCapacity - inputCapacity + BigInt(10) ** BigInt(8);
    txSkeleton = await common.injectCapacity(txSkeleton, [fromAddress], needCapacity, undefined, undefined, {
        enableDeductCapacity: false,
    });
    txSkeleton = await common.payFeeByFeeRate(txSkeleton, [fromAddress], feeRate);
    return txSkeleton;
}
