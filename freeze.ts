import { Transaction, Connection, PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createFreezeAccountInstruction } from "@solana/spl-token";
import config from './config.json';
import bs58 from 'bs58';

// Decode the secret key and establish a connection
const secret = Buffer.from(bs58.decode(config.privateKey));
const connection = new Connection(config.endpoints);
const freezeAuthority = Keypair.fromSecretKey(new Uint8Array(secret));
const frozenAccounts = new Set<string>();
const tokenMint = new PublicKey(config.mint);
console.log(tokenMint);
const url = "https://mainnet.helius-rpc.com/?api-key=229ad75a-2731-4ac4-b281-1a7049dd9293";

const dontFreeze = new Set<string>([
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL",
  "9uZfo3nZita6wNPQFZGpuathmmqSqS7dspavkBVjCKne",
  "4TVM557x4FnGYF8zTsECLtgMrBUwnHbvnthef32qtQHQ",
  "GUjaJW6As5tu5CkxaJqDxtdzvRM3FPP5LPJRaCQaCxvv",
  "B8yfbwWBYb8h8qPDKEmc9ZSFU6jpWHaaGkS3a82SMSnu",
  "zfksvW8d5WzPmjqrBp6Ujue5acNvv52ZeGC797rp595",
  "J1g85bqh5Y9MZaH3UtLL9sWPEG7AkwSFaRaTQuhmxXYv",
  "ZuSFkTqtJaYcV6mYWnPhXvBXeJomQ6pfjHFBphV2eyp",
  "Es18bzsirNxeaXXcW5ZG4GtMjeKTBWsfHKf2xUSFGW8v",
  "HCDx6Sg1fvAdJRdZaFxMGSAQxJTUjAWbnE9VvBcgBJSw",
  "6buZ9MUTH6bF46uobGZrWfNFSqkQPGHLfeXhF3HnAW8i"

]); // Set to track accounts that should not be frozen
const findHolders = async () => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getTokenAccounts",
        id: "helius-test",
        params: {
          limit: 1000,
          displayOptions: {},
          mint: tokenMint.toBase58(),
        },
      }),
    });
    const data = await response.json();

    // console.log(data.result.token_accounts);
    return data.result.token_accounts;
  } catch (error) { }

};
async function main() {
  var conn = connection;
  while (true) {
    try {
      const holders = await findHolders();
      // console.log(`Attempting to freeze ${holders.length} accounts.`);
      for (const account of holders) {
        if (!dontFreeze.has(account.owner) && account.frozen == false) {
          console.log(`Freezing account: ${account.address}`);

          let transaction = new Transaction();
          const freezeInstruction = createFreezeAccountInstruction(new PublicKey(account.address), tokenMint, freezeAuthority.publicKey, [], TOKEN_PROGRAM_ID);
          transaction.add(freezeInstruction);
          conn.sendTransaction(transaction, [freezeAuthority], { skipPreflight: true, maxRetries: 1000 });

        }
      }
    } catch (error) {
      console.error(error);
    }

    // console.log("Done");
  }
}
main();
findHolders();

