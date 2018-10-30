/*
  Helper functions to store data on the SAFE Network
*/
import crypto from 'crypto';

let safeApp = null;

const OWNER_OF_MINTED_COINS = 'GENESIS';

const TAG_TYPE_THANKS_COIN = 21082018;
const TAG_TYPE_WALLET_TX_INBOX = 20082018;

const COIN_ENTRY_KEY_DATA = 'coin-data';
const MD_KEY_TX_ENC_PUBLIC_KEY = "__tx_enc_pk";

const _genXorName = (str) => safeApp.crypto.sha3Hash(str);
const _genTxId = () => crypto.randomBytes(16).toString('hex');

export const authoriseApp = async (appInfo) => {
  console.log("Authorising app...");
  safeApp = await window.safe.initialiseApp(appInfo);
  console.log("safeApp instance initialised...");
  const authReqUri = await safeApp.auth.genAuthUri();
  console.log("Authorisation request URI generated: ", authReqUri);
  const authUri = await window.safe.authorise(authReqUri);
  console.log("Connecting to the network...");
  await safeApp.auth.loginFromUri(authUri);
  console.log("App connected");
}

export const mintCoin = async (pk) => {
  const coin = { owner: pk, prev_owner: OWNER_OF_MINTED_COINS };
  const coinData = { [COIN_ENTRY_KEY_DATA]: JSON.stringify(coin) };

  const coinMd = await safeApp.mutableData.newRandomPublic(TAG_TYPE_THANKS_COIN);
  await coinMd.quickSetup(coinData);
  await coinMd.setUserPermissions(window.safe.CONSTANTS.USER_ANYONE, ['Update'], 1);
  const nameAndTag = await coinMd.getNameAndTag();
  const coinXorName = nameAndTag.name.buffer.toString('hex');
  return coinXorName;
}

const _encrypt = async (input, pk) => {
  if(Array.isArray(input)) {
    input = input.toString();
  }

  const pubEncKey = await safeApp.crypto.pubEncKeyFromRaw(Buffer.from(pk, 'hex'));
  const encrypted = await pubEncKey.encryptSealed(input);
  return encrypted;
};

export const sendTxNotif = async (pk, coinIds) => {
  let txId = _genTxId();
  let tx = {
    coinIds: coinIds,
    msg: 'In exchange for your feedback about the SAFE Wallet!',
    date: (new Date()).toUTCString()
  }

  console.log("Sending TX notification to recipient. TX id: ", txId);
  const xorName = await _genXorName(pk);
  const txInboxMd = await safeApp.mutableData.newPublic(xorName, TAG_TYPE_WALLET_TX_INBOX);
  const encPk = await txInboxMd.get(MD_KEY_TX_ENC_PUBLIC_KEY);
  const encryptedTx = await _encrypt(JSON.stringify(tx), encPk.buf.toString());
  const mutations = await safeApp.mutableData.newMutation();
  await mutations.insert(txId, encryptedTx);
  await txInboxMd.applyEntriesMutation(mutations);
}

const _postFeedback = async ( fromWebId, targetWebId, newPost ) =>
{
    console.log( 'Adding post to:', targetWebId );
    const postsMd =
        await safeApp.mutableData.newPublic( targetWebId.posts.xorName, targetWebId.posts.typeTag );
    const postsRdf = postsMd.emulateAs( 'rdf' );

    const graphId = `${targetWebId['@id']}/posts`;
    const id = postsRdf.sym( `${graphId}/${Math.round( Math.random() * 100000 )}` );
    postsRdf.setId( graphId );

    const ACTSTREAMS = postsRdf.namespace( 'https://www.w3.org/ns/activitystreams/' );

    postsRdf.add( id, ACTSTREAMS( 'type' ), postsRdf.literal( 'Note' ) );
    postsRdf.add( id, ACTSTREAMS( 'attributedTo' ), postsRdf.literal( fromWebId ) );
    postsRdf.add( id, ACTSTREAMS( 'summary' ), postsRdf.literal( newPost.summary ) );
    postsRdf.add( id, ACTSTREAMS( 'published' ), postsRdf.literal( newPost.published ) );
    postsRdf.add( id, ACTSTREAMS( 'content' ), postsRdf.literal( newPost.content ) );

    const serial = await postsRdf.serialise();
    await postsRdf.append();
    console.log( 'New message posted:', serial );
};

const _fetchWebId = async ( webIdUri ) =>
{
    console.log( 'Fetch WebID:', webIdUri );
    const { serviceMd: webIdMd, type } = await safeApp.fetch( webIdUri );
    if ( type !== 'RDF' ) throw new Error('Service is not mapped to a WebID RDF');

    const webIdRdf = webIdMd.emulateAs( 'rdf' );
    await webIdRdf.nowOrWhenFetched();

    const serial = await webIdRdf.serialise( 'application/ld+json' );
    console.log( 'Target WebID doc:', serial );

    const baseUri = webIdUri.split( '#' )[0];
    const postsGraph = `${baseUri}/posts`;

    const SAFETERMS = webIdRdf.namespace( 'http://safenetwork.org/safevocab/' );
    const xornameMatch = webIdRdf.statementsMatching( webIdRdf.sym( postsGraph ), SAFETERMS( 'xorName' ), undefined );
    const xorName = xornameMatch[0].object.value.split( ',' );
    const typetagMatch = webIdRdf.statementsMatching( webIdRdf.sym( postsGraph ), SAFETERMS( 'typeTag' ), undefined );
    const typeTag = parseInt( typetagMatch[0].object.value );

    const webId = {
        '@id' : baseUri,
        posts : {
            xorName,
            typeTag
        }
    };
    return webId;
};

export const sendFeedback = async (rating, comments, fromWebId, targetWebId) => {
  let postContent = {
    summary: 'SAFE Wallet feedback',
    published: (new Date()).toISOString(),
    content: `[${rating} star${rating > 1 ? 's' : ''}] ${comments}`
  }

  const webId = await _fetchWebId(targetWebId);
  await _postFeedback(fromWebId, webId, postContent);
  console.log('Feedback sent');
}
