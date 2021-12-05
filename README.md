# TransferHistory
Fetch history for ETH and BSC contract

## Overview


## Usage

### get_History

```
    get_History( contracts, chain) => dictionary
```

**Takes** :
    - chain : "BSC" or "ETH"
    - an array of contracts dictionaries of the format :

```
    address : contract_address,
    Object  : Contract Object (from ethersIo),
    interface : interface Object (from ethersIo),
    provider : provider Object (from ethersIo),
    type     : "721", "1155" or "20"
    creationBlock : Block on which the contract was created (leave 0 if unknown)
```

**Returns** :
    - Dictionary of the format:
```
{
    contractAddress : [
        {
            block : transfer block,
            transfers : [
                {
                    to : recipient address,
                    from : sender address,
                    token : token ID if 155 or 721,
                    value : amount if ERC20
                }
            ]
          }
    ]
}
```
