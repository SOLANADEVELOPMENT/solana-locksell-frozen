
import { Transaction, SystemProgram, Keypair, Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, createSetAuthorityInstruction, setAuthority, AuthorityType } from '@solana/spl-token';
import { DataV2, createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata';
import { bundlrStorage, keypairIdentity, Metaplex, UploadMetadataInput } from '@metaplex-foundation/js';
import fs from 'fs-extra';
const filepath = './transfer.json';
import bs58 from 'bs58';
import config from './config.json';
// import { publicKey } from "@raydium-io/raydium-sdk";
const secret = Buffer.from(bs58.decode(config.privateKey));
console.log(secret);


const endpoint = config.endpoints;
const solanaConnection = new Connection(endpoint);
const userWallet = Keypair.fromSecretKey(new Uint8Array(secret));
const metaplex = Metaplex.make(solanaConnection)
    .use(keypairIdentity(userWallet))
    .use(bundlrStorage({
        address: 'https://node2.bundlr.network',
        providerUrl: endpoint,
        timeout: 100000,
    }));

const MINT_CONFIG = {
    numDecimals: config.decimals,
    numberTokens: config.supply
}
const MY_TOKEN_METADATA: UploadMetadataInput = {
    name: config.name,
    symbol: config.symbol,
    description: config.description,
    image: config.image //add public URL to image you'd like to use
}
const ON_CHAIN_METADATA = {
    name: MY_TOKEN_METADATA.name,
    symbol: MY_TOKEN_METADATA.symbol,
    uri: 'TO_UPDATE_LATER',
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
} as DataV2;

/**
 * 
 * @param wallet Solana Keypair
 * @param tokenMetadata Metaplex Fungible Token Standard object 
 * @returns Arweave url for our metadata json file
 */
const uploadMetadata = async (tokenMetadata: UploadMetadataInput): Promise<string> => {
    //Upload to Arweave
    const { uri } = await metaplex.nfts().uploadMetadata(tokenMetadata);
    console.log(`Arweave URL: `, uri);
    return uri;
}

const createNewMintTransaction = async (connection: Connection, payer: Keypair, mintKeypair: Keypair, destinationWallet: PublicKey, mintAuthority: PublicKey, freezeAuthority: PublicKey) => {
    //Get the minimum lamport balance to create a new account and avoid rent payments
    const requiredBalance = await getMinimumBalanceForRentExemptMint(connection);
    //metadata account associated with mint
    const metadataPDA = await metaplex.nfts().pdas().metadata({ mint: mintKeypair.publicKey });
    //get associated token account of your wallet
    const tokenATA = await getAssociatedTokenAddress(mintKeypair.publicKey, destinationWallet);


    const createNewTokenTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports: requiredBalance,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
            mintKeypair.publicKey,
            MINT_CONFIG.numDecimals,
            mintAuthority,
            freezeAuthority,
            TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(
            payer.publicKey,
            tokenATA,
            payer.publicKey,
            mintKeypair.publicKey,
        ),
        createMintToInstruction(
            mintKeypair.publicKey,
            tokenATA,
            mintAuthority,
            MINT_CONFIG.numberTokens * Math.pow(10, MINT_CONFIG.numDecimals),//number of tokens
        ),
        createCreateMetadataAccountV3Instruction({
            metadata: metadataPDA,
            mint: mintKeypair.publicKey,
            mintAuthority: mintAuthority,
            payer: payer.publicKey,
            updateAuthority: mintAuthority,
        }, {
            createMetadataAccountArgsV3: {
                data: ON_CHAIN_METADATA,
                isMutable: false,
                collectionDetails: null
            }
        }),
        createSetAuthorityInstruction(
            mintKeypair.publicKey,
            mintAuthority,
            AuthorityType.MintTokens,
            null,
        )

    );

    return createNewTokenTransaction;
}

const main = async () => {
    var count = 0;
    console.log(`---STEP 1: Uploading MetaData---`);
    const userWallet = Keypair.fromSecretKey(new Uint8Array(secret));
    let metadataUri = await uploadMetadata(MY_TOKEN_METADATA);
    ON_CHAIN_METADATA.uri = metadataUri;
    console.log(`---STEP 2: Creating Mint Transaction---`);
    let mintKeypair = Keypair.generate();
    console.log(`New Mint Address: `, mintKeypair.publicKey.toString());

    const newMintTransaction: Transaction = await createNewMintTransaction(
        solanaConnection,
        userWallet,
        mintKeypair,
        userWallet.publicKey,
        userWallet.publicKey,
        userWallet.publicKey
    );
    while (true) {
        try {
            console.log(`---STEP 3: Executing Mint Transaction---`);

            newMintTransaction.feePayer = userWallet.publicKey;
            let { lastValidBlockHeight, blockhash } = await solanaConnection.getLatestBlockhash('processed');
            newMintTransaction.recentBlockhash = blockhash;
            // newMintTransaction.lastValidBlockHeight = lastValidBlockHeight;
            const transactionId = await sendAndConfirmTransaction(solanaConnection, newMintTransaction, [userWallet, mintKeypair], { skipPreflight: false, commitment: 'processed', });

            console.log(`Transaction ID: `, transactionId);
            console.log(`Succesfully minted ${MINT_CONFIG.numberTokens} ${ON_CHAIN_METADATA.symbol} to ${userWallet.publicKey.toString()}.`);
            console.log(`View Transaction: https://solscan.io/tx/${transactionId}?cluster=mainnet`);
            console.log(`View Token Mint: https://solscan.io/token/${mintKeypair.publicKey.toString()}`)
            break;
        } catch (error) {
            count++;
            console.log('count:', count);
        }
    }
}

main();