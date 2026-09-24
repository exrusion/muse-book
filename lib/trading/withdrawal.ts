export function withdrawalMessage(agentId:string,address:string,amount:string,requestId:string,expires:number){
 return `Withdraw from my Jolly trading wallet\nAgent: ${agentId}\nNetwork: Robinhood Chain (4663)\nAmount: ${amount} ETH\nRecipient: ${address.toLowerCase()}\nRequest: ${requestId}\nExpires: ${new Date(expires).toISOString()}\n\nI authorize this one withdrawal to my connected wallet.`;
}
