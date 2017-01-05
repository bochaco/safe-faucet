/*
  Helper functions to store data in the SAFEnet
*/
import crypto from 'crypto';
import * as base64 from 'urlsafe-base64';

let AUTH_TOKEN = null;
const EMAIL_ID = "safewalletfeedback";
const WALLET_INBOX_PREFIX = "WALLETINBOX-AD-";
const OWNER_OF_MINTED_COINS = '1Eup55KofQRtBk1xS48LZs4RPYW2x8bgg5';

export const getXorName = (id) => { return base64.encode(crypto.createHash('sha256').update(id).digest('base64')); }

if (process.env.NODE_ENV !== 'production') {
  require('safe-js/dist/polyfill')
}

const _getHandleId = (res) => {
  return res.hasOwnProperty('handleId') ? res.handleId : res.__parsedResponseBody__.handleId;
}

export const authoriseApp = (app) => {
  console.log("Authenticating app...");
  return window.safeAuth.authorise(app)
    .then((res) => (AUTH_TOKEN = res.token) )
    .then(() => (console.log("Auth Token retrieved") ))
}

const _createSData = (id, data, encryptHandle) => {
  let dataHandle = null;
  const payload = new Buffer(JSON.stringify(data)).toString('base64');

  return window.safeStructuredData.create(AUTH_TOKEN, id, 500, payload, encryptHandle)
    .then(_getHandleId)
    .then(handleId => (dataHandle = handleId))
    .then(() => window.safeStructuredData.put(AUTH_TOKEN, dataHandle))
    .then(() => {
      console.log("New SD saved in the net", dataHandle);
      return dataHandle;
    })
}

const _getSDataHandle = (id) => {
  console.log("Fetching SD handle...");
  let dataIdHandle = null;
  return window.safeDataId.getStructuredDataHandle(AUTH_TOKEN, id, 500)
    .then(_getHandleId)
    .then(handleId => (dataIdHandle = handleId))
    .then(() => window.safeStructuredData.getHandle(AUTH_TOKEN, dataIdHandle))
    .then(_getHandleId)
    .then(handleId => {
      window.safeDataId.dropHandle(AUTH_TOKEN, dataIdHandle);
      return handleId;
    })
}

const _generateStructredDataId = () => {
  return base64.encode(crypto.randomBytes(32).toString('base64'));
};

const _loadData = (dataId) => {
  return _getSDataHandle(dataId)
    .then((handleId) => {
      // let's try to read the data now!
      console.log("Reading the data...");
      return window.safeStructuredData.readData(AUTH_TOKEN, handleId, '')
        .then((res) => res.json ? res.json() : JSON.parse(new Buffer(res).toString()))
        .then((parsedData) => {
          console.log("Data successfully retrieved");
          return parsedData;
        }, (err) => {
          console.error("Error reading data:", err);
        })

    }, (err) => {
      console.error("Failed loading data:", err);
    })
}

const _getADataHandle = (id) => {
  let dataIdHandle = null;
  return window.safeDataId.getAppendableDataHandle(AUTH_TOKEN, id, true)
    .then(_getHandleId)
    .then(handleId => (dataIdHandle = handleId))
    .then(() => window.safeAppendableData.getHandle(AUTH_TOKEN, dataIdHandle))
    .then(_getHandleId)
    .then(handleId => {
      window.safeDataId.dropHandle(AUTH_TOKEN, dataIdHandle);
      return handleId;
    })
}

const _getEncryptionHandle = (handleId) => {
  let _cypherOptsAssymmetric, _encryptKey;
  return window.safeAppendableData.getEncryptKey(AUTH_TOKEN, handleId)
    .then(_getHandleId)
    .then((encryptKey) => _encryptKey = encryptKey)
    .then(() => (window.safeCipherOpts.getHandle(
        AUTH_TOKEN, window.safeCipherOpts.getEncryptionTypes().ASYMMETRIC, _encryptKey) ))
    .then(_getHandleId)
    .then(handleId => _cypherOptsAssymmetric = handleId )
    .then(() => window.safeAppendableData.dropEncryptKeyHandle(AUTH_TOKEN, _encryptKey))
    .then(() => {
      return _cypherOptsAssymmetric;
    })
}

export const mintCoin = (pk) => {
  let data = {
    type_tag: 15001,
    owner: pk,
    prev_owner: OWNER_OF_MINTED_COINS,
  }

  let dataId = _generateStructredDataId();
  console.log("Minting coin: ", dataId, data);

  let recipientInboxId = getXorName(WALLET_INBOX_PREFIX + pk);
  let _handleId, _cypherOptsAssymmetric;
  return _getADataHandle(recipientInboxId)
    .then((handleId) => _handleId = handleId)
    .then(() => _getEncryptionHandle(_handleId))
    .then(encryptHandle => _cypherOptsAssymmetric = encryptHandle)
    .then(() => _createSData(dataId, data, _cypherOptsAssymmetric))
    .then((handleId) => {
      console.log("SD just created:", handleId);
      window.safeAppendableData.dropHandle(AUTH_TOKEN, _handleId);
      return dataId;
    }, (err) => {
      throw Error("The coin already exists...that's bad luck!");
    })
}

const _appendToTxInbox = (id, content) => {
  let _handleId, _encryptKey, _cypherOptsAssymmetric, _immHandleId, _immToAppendHandleId;
  return _getADataHandle(id)
    .then((handleId) => _handleId = handleId)
    .then(() => _getEncryptionHandle(_handleId))
    .then(encryptHandle => _cypherOptsAssymmetric = encryptHandle)
    .then(() => window.safeImmutableData.getWriterHandle(AUTH_TOKEN))
    .then(_getHandleId)
    .then(handleId => _immHandleId = handleId)
    .then(() => window.safeImmutableData.write(AUTH_TOKEN, _immHandleId, content))
    .then(() => window.safeImmutableData.closeWriter(AUTH_TOKEN, _immHandleId, _cypherOptsAssymmetric))
    .then(_getHandleId)
    .then(handleId => _immToAppendHandleId = handleId)
    .then(() => window.safeImmutableData.dropWriter(AUTH_TOKEN, _immHandleId))
    .then(() => window.safeAppendableData.append(AUTH_TOKEN, _handleId, _immToAppendHandleId))
    .then(() => window.safeAppendableData.dropHandle(AUTH_TOKEN, _handleId))
}

export const sendTxNotif = (pk, coinIds) => {
  let txInboxId = getXorName(WALLET_INBOX_PREFIX + pk);
  let data = {
    coinIds: coinIds,
    msg: 'In exchange of your feedback about SAFE Wallet!',
    date: (new Date()).toUTCString()
  }
  const txNotif = new Uint8Array(new Buffer(JSON.stringify(data)));

  console.log("Saving TX inbox data in the network...");
  return _appendToTxInbox(txInboxId, txNotif)
    .then(() => console.log("TX notification sent"))
}

export const sendEmail = (rating, comments) => {
  let emailId = EMAIL_ID;
  let data = {
    subject: "SAFE Wallet feedback",
    from: "SAFE Faucet",
    time: (new Date()).toUTCString(),
    body: "{ rating: '" + rating + "', feedback: '" + comments + "' }",
  }

  let emailContent = new Uint8Array(new Buffer(JSON.stringify(data)));
  return _appendToTxInbox(emailId, emailContent)
    .then(() => console.log("Email sent"))
}
