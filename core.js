const { utils, providers, BigNumber } = require("ethers");
const Axios = require("axios");

const {BSC_API, ETH_API, ethkey, bsckey, apiKey} = require("../constants")

let next_query_time = 0
const getLogs = async (from_block, to_block, contract, topic, chain) => {

    try {

        const r = await Axios.post((chain == "ETH" ? ETH_API : BSC_API),
            {
                jsonrpc: '2.0',
                id: (chain == "ETH" ? 74 : "getblock.io"),
                method: 'eth_getLogs',
                params : [{
                    "fromBlock": "0x" + from_block.toString(16),
                    "toBlock": "0x" + to_block.toString(16),
                    "address": contract,
                    "topics" : [topic]
                    }]
            },
            {
                headers : {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json-rpc',
                    'Accept': 'application/json-rpc'
                },
            })

        return r.data.result;
    }
    catch (err)
    {
        console.log("failed to query blockchain: ",  err.response.data, "For", chain, "contract ", contract );
        return null
    }
}

const Transfers_FromBlock = async(from_block, contract, to_block, ) =>
{
    try
    {
        let transactions = [];
        if (contract.type == "721" || contract.type == "20")
        {
            const logs = await getLogs(from_block, to_block, contract.address, "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", contract.chain)
            if (!logs)
                return {"success" : false, from_block, to_block};
            transactions = logs.map(log => {
                return {
                    block: Number(log.blockNumber),
                    transfer: {
                        from: "0x" + log.topics[1].slice(26),
                        to: "0x" + log.topics[2].slice(26),
                        token: [Number(log.topics[3])]
                    }
                }
            })
        }
        else if (contract.type == "1155")
        {
            // TransferSingle
            let logs = await getLogs(from_block, to_block, contract.address, "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62", contract.chain)
            transactions = logs.map(log => {
                const [id, value] = utils.defaultAbiCoder.decode(
                    ['uint256', 'uint256'],
                    log.data
                )
                return {
                    block: Number(log.blockNumber),
                    transfer: {
                        from: "0x" + log.topics[2].slice(26),
                        to: "0x" + log.topics[3].slice(26),
                        token: [id.toNumber()],
                    }
                }
            })
            // TransferBatch
            logs = await getLogs(from_block, to_block, contract.address, "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb", contract.chain)
            if (!logs)
                return {"success" : false, from_block, to_block};
            transactions2 = logs.map(log => {
                try{

                const [ids, values] = utils.defaultAbiCoder.decode(
                    ['uint256[]', 'uint256[]'],
                    log.data
                )
                return {
                    block: Number(log.blockNumber),
                    transfer: {
                        from: "0x" + log.topics[2].slice(26),
                        to: "0x" + log.topics[3].slice(26),
                        token: ids.map((e) => e.toNumber()),
                    }
                }
                }
                catch(err)
                {
                    console.log("ERROR", err, log.data)
                }
            })
            transactions = transactions.concat(transactions2);
        }

        return {"success" : true, transactions};
    }
    catch(err)
    {
        console.log("Failed to get transfers from", from_block, "to", to_block, err)
        return {"success" : false, from_block, to_block};
    }
}

const tryAgain = async (failed, contract) =>
{
    let transfers = []
    let failedAgain = [];
    for (let f of failed)
    {
        console.log("ALL from", f[0], "to", f[1])
        for (;;) {
            if (new Date().getTime() >= next_query_time) {
                let result = await Transfers_FromBlock(f[0], contract, f[1])
                if (result.success)
                    transfers.push(result.transactions)
                else
                    failedAgain.push([result.from_block, result.to_block])
                next_query_time = new Date().getTime() + 200;
                break ;
            }
        }
    }
    return {transfers, failedAgain}
}

const get_AlltransfersToBlock = async (contract, to_block) =>
{
    // console.log(contract, to_block)
    let transfers = []
    let failed = []
    let block = contract.creationBlock;
    let old = block;
        // console.log("HI", block, to_block)
    while (block < to_block)
    {
        // console.log("HI")
        block += 4999
        if (block >= to_block)
            block = to_block
        console.log("ALL from", old, "to", block)
        for (;;) {
            if (new Date().getTime() >= next_query_time) {
                let result = await Transfers_FromBlock(old, contract, block)
                if (result.success === true)
                     transfers.push(result.transactions)
                else
                {
                    failed.push([result.from_block, result.to_block])
                    break ;
                }
                next_query_time = new Date().getTime() + 150;
                break ;
            }
        }
        old = block;
    }

    while (failed.length > 0)
    {
        console.log("failed", failed.length, "Trying again")
        let result = await tryAgain(failed, contract);

        failed = result.failedAgain
        transfers = [...transfers,...result.transfers]
    }
    // console.log("TRANSFERS", transfers)
    return transfers;
}

module.exports =
{
    get_AlltransfersToBlock,
    getLogs,
    Transfers_FromBlock
}
