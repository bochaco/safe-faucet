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
  const { content: webIdMd, resourceType } = await safeApp.fetch( webIdUri );
  if ( resourceType !== 'RDF' ) throw new Error('Service is not mapped to a WebID RDF');

  const webIdRdf = webIdMd.emulateAs( 'rdf' );
  await webIdRdf.nowOrWhenFetched();

  const baseUri = webIdUri.split( '#' )[0];
  const webIdGraph = `${baseUri}#me`;
  const SAFETERMS = webIdRdf.namespace( 'http://safenetwork.org/safevocab/' );
  const xorNamePredicate = SAFETERMS( 'xorName' );
  const typeTagPredicate = SAFETERMS( 'typeTag' );

  let posts;
  const ACTIVITYSTREAMS_VOCAB_URL = 'https://www.w3.org/ns/activitystreams/';
  const ACTSTREAMS = webIdRdf.namespace( ACTIVITYSTREAMS_VOCAB_URL );
  const inboxMatch = webIdRdf.statementsMatching( webIdRdf.sym( webIdGraph ), ACTSTREAMS( 'inbox' ), undefined );
  const inbox = inboxMatch[0] && inboxMatch[0].object.value;
  // if there is no inbox link, let's fallback to try old format
  if (inbox) {
    const { content } = await safeApp.fetch(inbox);
    const nameAndTag = await content.getNameAndTag();
    posts = {
      xorName: nameAndTag.name,
      typeTag: nameAndTag.typeTag
    };
  } else {
    const postsGraph = webIdRdf.sym(`${baseUri}/posts`);
    const postsXorNameMatch = webIdRdf.statementsMatching( postsGraph, xorNamePredicate, undefined );
    const postsXorName = postsXorNameMatch[0].object.value.split( ',' );
    const postsTypeTagMatch = webIdRdf.statementsMatching( postsGraph, typeTagPredicate, undefined );
    const postsTypeTag = parseInt( postsTypeTagMatch[0].object.value );
    posts = {
      xorName: postsXorName,
      typeTag: postsTypeTag
    };
  }

  let walletInbox;
  const WALLETTERMS = webIdRdf.namespace( 'https://w3id.org/cc#' );
  const walletTxInboxMatch = webIdRdf.statementsMatching(webIdRdf.sym( webIdGraph ), WALLETTERMS('inbox'), undefined);
  const walletTxInbox = walletTxInboxMatch[0] && walletTxInboxMatch[0].object.value;
  // if there is no wallet TX inbox link, let's fallback to try old format
  if (walletTxInbox) {
    const { content } = await safeApp.fetch(walletTxInbox);
    const nameAndTag = await content.getNameAndTag();
    walletInbox = {
      xorName: nameAndTag.name,
      typeTag: nameAndTag.typeTag
    };
  } else {
    const walletGraph = webIdRdf.sym(`${baseUri}/walletInbox`);
    const walletXorNameMatch = webIdRdf.statementsMatching( walletGraph, xorNamePredicate, undefined );
    const walletXorName = walletXorNameMatch[0] && walletXorNameMatch[0].object.value.split( ',' );
    const walletTypeTagMatch = webIdRdf.statementsMatching( walletGraph, typeTagPredicate, undefined );
    const walletTypeTag = walletTypeTagMatch[0] && parseInt( walletTypeTagMatch[0].object.value );
    walletInbox = {
      xorName: walletXorName,
      typeTag: walletTypeTag
    };
  }

  const webId = {
    '@id' : baseUri,
    posts,
    walletInbox
  };
  console.log("WebID Info:", webId);
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
