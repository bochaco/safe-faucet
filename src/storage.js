/*
  Helper functions to store data in the SAFEnet
*/
import crypto from 'crypto';
import * as base64 from 'urlsafe-base64';

const EMAIL_ID = "safewalletfeedback";

export const getXorName = (id) => { return base64.encode(crypto.createHash('sha256').update(id).digest('base64')); }

if (process.env.NODE_ENV !== 'production') {
  require('safe-js/dist/polyfill')
}

let AUTH_TOKEN = null;
const WALLET_INBOX_PREFIX = "WALLETINBOX-";

const _getHandleId = (res) => {
  return res.hasOwnProperty('handleId') ? res.handleId : res.__parsedResponseBody__.handleId;
}

export const authoriseApp = (app) => {
  console.log("Authenticating app...");
  return window.safeAuth.authorise(app)
    .then((res) => (AUTH_TOKEN = res.token) )
    .then(() => (console.log("Auth Token retrieved") ))
}

const _createSData = (id, data) => {
  let dataHandle = null;
  const payload = new Buffer(JSON.stringify(data)).toString('base64');

  return window.safeStructuredData.create(AUTH_TOKEN, id, 500, payload, null)
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
    .then(() => (console.log("Fetched dataIdHandle:", dataIdHandle)) )
    .then(() => window.safeStructuredData.getHandle(AUTH_TOKEN, dataIdHandle))
    .then(_getHandleId)
    .then(handleId => {
      window.safeDataId.dropHandle(AUTH_TOKEN, dataIdHandle);
      console.log("Fetched SD handle:", handleId);
      return handleId;
    })
}

const _generateStructredDataId = () => {
  return base64.encode(crypto.randomBytes(32).toString('base64'));
};

export const mintCoin = (pk) => {
  let data = {
    type_tag: 15001,
    owner: pk,
    prev_owner: '1Eup55KofQRtBk1xS48LZs4RPYW2x8bgg5',
  }

  let dataId = _generateStructredDataId();
  console.log("Minting coin: ", dataId, data);

  return _createSData(dataId, data)
    .then( (handleId) => {
      console.log("SD just created:", handleId);
      return dataId;
    }, (err) => {
      console.log("The coin already exists, trying to update it...I know...we are stealing a coin from someone :)");
      const payload = new Buffer(JSON.stringify(data)).toString('base64');
      return _getSDataHandle(dataId)
        .then((handleId) => {
          // let's try to save the data now!
          return window.safeStructuredData.updateData(AUTH_TOKEN, handleId, payload, null)
            .then(() => window.safeStructuredData.post(AUTH_TOKEN, handleId))
            .then(() => {
              console.log("Coin updated in the network successfully");
              return dataId;
            }, (err) => {
              console.log("Error when updating coin:", err);
            })

        }, (err) => {
          console.log("Failed loading coin data:", err);
        })

    })
}

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
          console.log("Error reading data:", err);
        })

    }, (err) => {
      console.log("Failed loading data:", err);
    })
}

export const saveTxInboxData = (pk, data) => {
  const payload = new Buffer(JSON.stringify(data)).toString('base64');
  let dataId = getXorName(WALLET_INBOX_PREFIX + pk);

  console.log("Saving data in the network...");

  return _getSDataHandle(dataId)
    .then((handleId) => {
      // let's try to save the data now!
      return window.safeStructuredData.updateData(AUTH_TOKEN, handleId, payload, null)
        .then(() => window.safeStructuredData.post(AUTH_TOKEN, handleId))
        .then(() => {
          console.log("Data saved in the network successfully");
          return data;
        }, (err) => {
          console.log("Error when updating data:", err);
        })

    }, (err) => {
      console.log("Failed loading data:", err);
    })
}

export const readTxInboxData = (pk) => {
  let dataId = getXorName(WALLET_INBOX_PREFIX + pk);
  console.log("Reading TX inbox...", dataId);
  return _loadData(dataId);
}

const _getADataHandle = (id) => {
  console.log("Fetching AD handle...", id);
  let dataIdHandle = null;
  return window.safeDataId.getAppendableDataHandle(AUTH_TOKEN, id, true)
    .then(_getHandleId)
    .then(handleId => (dataIdHandle = handleId))
    .then(() => (console.log("Fetched dataIdHandle:", dataIdHandle)) )
    .then(() => window.safeAppendableData.getHandle(AUTH_TOKEN, dataIdHandle))
    .then(_getHandleId)
    .then(handleId => {
      console.log("Fetched AD handle:", handleId);
      window.safeDataId.dropHandle(AUTH_TOKEN, dataIdHandle);
      return handleId;
    })
}

export const sendEmail = (rating, comments, pk) => {
  let emailId = EMAIL_ID;
  let data = {
    subject: "SAFE Wallet feedback",
    from: "SAFE Faucet",
    time: (new Date()).toUTCString(),
    body: "{ rating: '" + rating + "', feedback: '" + comments + "', pk: '" + pk + "' }",
  }

  let emailContent = new Uint8Array(new Buffer(JSON.stringify(data)));
  let _handleId, _encryptKey, _cypherOptsAssymmetric, _immHandleId, _immToAppendHandleId;
  return _getADataHandle(emailId)
    .then((handleId) => _handleId = handleId)
    .then(() => window.safeAppendableData.getEncryptKey(AUTH_TOKEN, _handleId))
    .then(_getHandleId)
    .then((encryptKey) => _encryptKey = encryptKey)
    .then(() => console.log("Got encryption key"))
    .then(() => (window.safeCipherOpts.getHandle(
        AUTH_TOKEN, window.safeCipherOpts.getEncryptionTypes().ASYMMETRIC, _encryptKey) ))
    .then(_getHandleId)
    .then(handleId => _cypherOptsAssymmetric = handleId )
    .then(() => console.log("Got asymmetric encryption options handle"))
    .then(() => window.safeAppendableData.dropEncryptKeyHandle(AUTH_TOKEN, _encryptKey))
    .then(() => window.safeImmutableData.getWriterHandle(AUTH_TOKEN))
    .then(_getHandleId)
    .then(handleId => _immHandleId = handleId)
    .then(() => console.log("Got immutable data handle"))
    .then(() => window.safeImmutableData.write(AUTH_TOKEN, _immHandleId, emailContent))
    .then(() => window.safeImmutableData.closeWriter(AUTH_TOKEN, _immHandleId, _cypherOptsAssymmetric))
    .then(_getHandleId)
    .then(handleId => _immToAppendHandleId = handleId)
    .then(() => window.safeImmutableData.dropWriter(AUTH_TOKEN, _immHandleId))
    .then(() => console.log("Wrote email in immutableData"))
    .then(() => window.safeAppendableData.append(AUTH_TOKEN, _handleId, _immToAppendHandleId))
    .then(() => console.log("Added email to appendableData"))
    .then(() => window.safeAppendableData.dropHandle(AUTH_TOKEN, _handleId))
    .then(() => console.log("Email sent"))
}
