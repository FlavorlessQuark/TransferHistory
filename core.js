const dotenv = require('dotenv');
dotenv.config();

const { utils } = require("ethers");
const ETH_NETWORK =  process.env.ETH_PROVIDER;
const BSC_NETWORK =  process.env.BSC_PROVIDER;
const BSCprovider = new providers.getDefaultProvider(BSC_NETWORK);
const ETHprovider = new providers.getDefaultProvider(ETH_NETWORK);

const Transfers_FromBlock = async(from_block, contracts, to_block) =>
{
    let return_data =  { "transactionCount": 0, "transfers": { } };
    for (contract of contracts)
    {
        if (contract.type == "721" || contract.type == "20")
        {
            let filter = contract.Object.filters.Transfer(null, null)
            transactions = await contract.Object.queryFilter(filter, from_block, to_block);
        }
        else
        {
            let filter = contract.Object.filters.TransferSingle(null, null)
            transactions = await contract.Object.queryFilter(filter, from_block, to_block);
            filter = contract.Object.filters.TransferBatch(null, null)
            transactions = [...transactions, ...await contract.Object.queryFilter(filter, from_block, to_block)];
        }
        return_data.transactionCount += transactions.length;
        return_data.transfers[contract.address] = {"count" : 0, "hashes": [], "iface": null, "provider": null};
        return_data.transfers[contract.address].count = transactions.length;
        return_data.transfers[contract.address].hashes = transactions.map((tr) => {return tr.transactionHash});
        return_data.transfers[contract.address].hashes = new Set(return_data.transfers[contract.address].hashes)
        return_data.transfers[contract.address].iface = contract.interface;
        return_data.transfers[contract.address].provider = contract.provider;
    }
    return return_data
}

const decode_Transactions = async(transactions, interface, provider, address) =>
{
    let parsed = [];
    let promises = []
    for(hash of transactions)
    {
        promises.push( (await provider.getTransaction(hash)).wait())
    }
    Promise.all(promises).then(async (hash) =>
    {
        for (let res of hash)
        {

        try
            {
                let transfer = {"contract": address}
                let decoded = [];
                transfer["block"] = res.logs[0].blockNumber;
                transfer["transfers"] = []
                for (log of res.logs)
                {
                    if (log.address == address)
                    {
                        try
                        {
                            decoded = (interface.parseLog(log))
                            if (decoded.name.startsWith("Transfer"))
                            {
                                let transaction = {}
                                transaction["from"] = decoded.args.from;
                                transaction["to"] = decoded.args.to;
                                if (decoded.args.tokenId)
                                    transaction["token"] = (decoded.args.tokenId.toNumber());
                                else if (decoded.args.id)
                                    transaction["token"] = (decoded.args.id.toNumber());
                                else if (decoded.args.value)
                                    transaction["value"] = (utils.formatEther(decoded.args.value.toString()));
                                transfer["transfers"].push(transaction)
                            }
                        }
                        catch(err)
                        {
                            console.log("Error parsing logs", err,log, transfer)
                        }
                    }
                }
                parsed.push(transfer);
            }
            catch(err)
            {
                console.log("Error on transaction", err, hash,)
                throw "Error on transaction"
            }
        }
    })
    return parsed;
}

const get_AllTransfersToBlock = (contracts, to_block) =>
{
    let transfer = []
    let block = contracts.reduce((curr, next) => curr.creationBlock < next.creationBlock ? curr.creationBlock : next.creationBlock)
    let old = block;

    console.log(block)


    for (; ;)
    {
        let batch = [];
        contracts.map((item) => {item.creationBlock <= block ? batch.push(item) : null})
        block += 4999
        transfer.push(Transfers_FromBlock(old, batch, block))
        old = block
        if (block >= to_block)
            break ;
    }
    return transfer;
}

const get_History = async(contracts, chain) =>
{
    let current_block = chain == "BSC" ? await BSCprovider.getBlockNumber() : await ETHprovider.getBlockNumber();
    let promises = get_AllTransfersToBlock(contracts, current_block)
    let res  = await Promise.all(promises)
    // {
        let returnData = {};
        let data = res.flatMap((e) => {return e})
        let tokens = {}
        let decoded = []
        for (let t of data)
        {
            if (t.transactionCount > 0)
            {
                for (let address of Object.keys(t.transfers))
                {
                    if (!tokens[address])
                        tokens[address] = {}
                    if (t.transfers[address]["count"])
                    {
                        decoded.push(decode_Transactions(t.transfers[address]["hashes"],t.transfers[address]["iface"],  t.transfers[address]["provider"], address))
                    }
                }
            }
        }
        let stuff = await Promise.all(decoded)
        // {
            for (let arr of stuff)
            {
                for (let dic of arr)
                {
                    if (!returnData[dic.contract])
                        returnData[dic.contract] = []
                    returnData[dic.contract].push({"block": dic.block,"trnasfers": dic.transfers})

                }
            }
    return returnData
}

module.exports =
{
    Transfers_FromBlock,
    get_AllTransfersToBlock,
    decode_Transactions,
    get_History,
}
