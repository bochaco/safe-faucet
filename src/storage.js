/*
  Helper functions to store data on the SAFE Network
*/
import crypto from 'crypto';

let safeApp = null;

const OWNER_OF_MINTED_COINS = 'GENESIS';

const TYPE_TAG_THANKS_COIN = 21082018;
const TYPE_TAG_WALLET_TX_INBOX = 20082018;

const COIN_ENTRY_KEY_DATA = 'coin-data';
const MD_KEY_TX_ENC_PUBLIC_KEY = '__tx_enc_pk';
const MD_KEY_TX_WALLET_PK = '__wallet_pk';

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

  const coinMd = await safeApp.mutableData.newRandomPublic(TYPE_TAG_THANKS_COIN);
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

export const sendTxNotif = async (recipient, coinIds) => {
  let txId = _genTxId();
  let tx = {
    coinIds: coinIds,
    msg: 'In exchange for your feedback about the SAFE Wallet!',
    date: (new Date()).toUTCString()
  }

  console.log("Sending TX notification to recipient. TX id:", txId);
  const encryptedTx = await _encrypt(JSON.stringify(tx), recipient.encPk);
  const mutations = await safeApp.mutableData.newMutation();
  await mutations.insert(txId, encryptedTx);
  await recipient.txInboxMd.applyEntriesMutation(mutations);
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

  await postsRdf.append();
};

const _fetchWebId = async ( webIdUri ) =>
{
  console.log( 'Fetch WebID:', webIdUri );
  const { serviceMd: webIdMd, type } = await safeApp.fetch( webIdUri );
  if ( type !== 'RDF' ) throw new Error('Service is not mapped to a WebID RDF');

  const webIdRdf = webIdMd.emulateAs( 'rdf' );
  await webIdRdf.nowOrWhenFetched();

  const baseUri = webIdUri.split( '#' )[0];
  const postsGraph = webIdRdf.sym(`${baseUri}/posts`);
  const walletGraph = webIdRdf.sym(`${baseUri}/walletInbox`);

  const SAFETERMS = webIdRdf.namespace( 'http://safenetwork.org/safevocab/' );
  const xorNamePredicate = SAFETERMS( 'xorName' );
  const typeTagPredicate = SAFETERMS( 'typeTag' );

  const postsXorNameMatch = webIdRdf.statementsMatching( postsGraph, xorNamePredicate, undefined );
  const postsXorName = postsXorNameMatch[0].object.value.split( ',' );
  const postsTypeTagMatch = webIdRdf.statementsMatching( postsGraph, typeTagPredicate, undefined );
  const postsTypeTag = parseInt( postsTypeTagMatch[0].object.value );

  const walletXorNameMatch = webIdRdf.statementsMatching( walletGraph, xorNamePredicate, undefined );
  let walletXorName;
  if (walletXorNameMatch[0]) {
    walletXorName = walletXorNameMatch[0].object.value.split( ',' );
  }
  const walletTypeTagMatch = webIdRdf.statementsMatching( walletGraph, typeTagPredicate, undefined );
  let walletTypeTag;
  if (walletTypeTagMatch[0]) {
    walletTypeTag = parseInt( walletTypeTagMatch[0].object.value );
  }

  const webId = {
    '@id' : baseUri,
    posts : {
      xorName: postsXorName,
      typeTag: postsTypeTag
    },
    walletInbox : {
      xorName: walletXorName,
      typeTag: walletTypeTag
    }
  };
  return webId;
};

export const fetchRecipientInfo = async (recipient) =>
{
  let txInboxMd;
  if (recipient.toLowerCase().startsWith('safe://')) {
    const webId = await _fetchWebId(recipient);
    if (!webId.walletInbox.xorName || !webId.walletInbox.typeTag) {
      throw Error('No wallet TX inbox link found in WebID');
    }
    txInboxMd = await safeApp.mutableData.newPublic(webId.walletInbox.xorName, webId.walletInbox.typeTag);
  } else {
    const xorName = await _genXorName(recipient);
    txInboxMd = await safeApp.mutableData.newPublic(xorName, TYPE_TAG_WALLET_TX_INBOX);
  }

  const pk = await txInboxMd.get(MD_KEY_TX_WALLET_PK);
  const encPk = await txInboxMd.get(MD_KEY_TX_ENC_PUBLIC_KEY);

  return {
    pk: pk.buf.toString(),
    encPk: encPk.buf.toString(),
    txInboxMd
  };
}

export const sendFeedback = async (rating, comments, fromWebId, targetWebId) => {
  const ratingStr = rating >= 0 ? `[${rating} star${rating > 1 ? 's' : ''}]` : '[no rating]';
  let postContent = {
    summary: 'SAFE Wallet feedback',
    published: (new Date()).toISOString(),
    content: `${ratingStr} ${comments || '<no feedback>'}`
  }

  const webId = await _fetchWebId(targetWebId);
  await _postFeedback(fromWebId, webId, postContent);
  console.log('Feedback sent');
}
