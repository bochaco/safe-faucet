/*
  Helper functions to store data in the SAFEnet
*/
import crypto from 'crypto';

let APP_HANDLE = null;
const OWNER_OF_MINTED_COINS = 'GENESIS';
const SERVICE_NAME_POSTFIX = "@email";

const TAG_TYPE_DNS = 15001;
const TAG_TYPE_THANKS_COIN = 21082018;
const TAG_TYPE_WALLET_TX_INBOX = 20082018;

const COIN_ENTRY_KEY_DATA = 'coin-data';
const MD_KEY_EMAIL_ENC_PUBLIC_KEY = "__email_enc_pk";

const _genXorName = (str) => window.safeCrypto.sha3Hash(APP_HANDLE, str);

const _genRandomEntryKey = () => crypto.randomBytes(32).toString('hex');

export const authoriseApp = (appInfo) => {
  console.log("Authenticating app...");

  return window.safeApp.initialise(appInfo)
    .then((appHandle) => {
      APP_HANDLE = appHandle;
      console.log("App handle retrieved: ", appHandle);
      return window.safeApp.authorise(APP_HANDLE, {});
    })
    .then((authUri) => window.safeApp.connectAuthorised(APP_HANDLE, authUri))
    .then(() => console.log('The app was authorised'))
    .catch((err) => console.error('Error when trying to authorise the app: ', err));
}

export const mintCoin = (pk) => {
  const coin = { owner: pk, prev_owner: OWNER_OF_MINTED_COINS };
  const coinData = { [COIN_ENTRY_KEY_DATA]: JSON.stringify(coin) };

  let permSetHandle;
  let coinXorName;
  return window.safeMutableData.newRandomPublic(APP_HANDLE, TAG_TYPE_THANKS_COIN)
    .then((coinHandle) => window.safeMutableData.quickSetup(coinHandle, coinData)
      .then(() => window.safeMutableData.newPermissionSet(APP_HANDLE))
      .then((pmSetHandle) => permSetHandle = pmSetHandle)
      .then(() => window.safeMutableDataPermissionsSet.setAllow(permSetHandle, 'Update'))
      .then(() => window.safeMutableData.setUserPermissions(coinHandle, null, permSetHandle, 1))
      .then(() => window.safeMutableDataPermissionsSet.free(permSetHandle))
      .then(() => window.safeMutableData.getNameAndTag(coinHandle))
      .then((res) => coinXorName = res.name.buffer.toString('hex'))
      .then(() => window.safeMutableData.free(coinHandle))
    )
    .then(() => coinXorName);
}

export const sendTxNotif = (pk, coinIds) => {
  let txId = _genRandomEntryKey();
  let tx = {
    coinIds: coinIds,
    msg: 'In exchange for your feedback about the SAFE Wallet!',
    date: (new Date()).toUTCString()
  }

  console.log("Saving TX inbox data in the network...");
  return window.safeMutableData.newMutation(APP_HANDLE)
    .then((mutHandle) => window.safeMutableDataMutation.insert(mutHandle, txId, JSON.stringify(tx)) // TODO: encrypt notif
      .then(() => _genXorName(pk))
      .then((xorName) => window.safeMutableData.newPublic(APP_HANDLE, xorName, TAG_TYPE_WALLET_TX_INBOX))
      .then((txInboxHandle) => window.safeMutableData.applyEntriesMutation(txInboxHandle, mutHandle)
        .then(() => window.safeMutableData.free(txInboxHandle))
      )
      .then(() => window.safeMutableDataMutation.free(mutHandle))
    );
}

const _encrypt = (input, pk) => {
  if(Array.isArray(input)) {
    input = input.toString();
  }

  return window.safeCrypto.pubEncKeyKeyFromRaw(APP_HANDLE, Buffer.from(pk, 'hex'))
    .then((pubEncKeyHandle) => window.safeCryptoPubEncKey.encryptSealed(pubEncKeyHandle, input))
};

const _writeEmailContent = (email, pk) => {
  return _encrypt(JSON.stringify(email), pk)
    .then(encryptedEmail => window.safeImmutableData.create(APP_HANDLE)
       .then((emailHandle) => window.safeImmutableData.write(emailHandle, encryptedEmail)
         .then(() => window.safeCipherOpt.newPlainText(APP_HANDLE))
         .then((cipherOptHandle) => window.safeImmutableData.closeWriter(emailHandle, cipherOptHandle))
       )
    )
}

const _splitPublicIdAndService = (emailId) => {
  // It supports complex email IDs, e.g. 'emailA.myshop', 'emailB.myshop'
  let str = emailId.replace(/\.+$/, '');
  let toParts = str.split('.');
  const publicId = toParts.pop();
  const serviceId =  str.slice(0, -1 * (publicId.length+1));
  emailId = (serviceId.length > 0 ? (serviceId + '.') : '') + publicId;
  const serviceName = serviceId + SERVICE_NAME_POSTFIX;
  return {emailId, publicId, serviceName};
}

const _genServiceInfo = (emailId) => {
  let serviceInfo = _splitPublicIdAndService(emailId);
  return _genXorName(serviceInfo.publicId)
    .then((hashed) => {
      serviceInfo.serviceAddr = hashed;
      return serviceInfo;
    });
}

const _storeEmail = (email, to) => {
  let serviceInfo;
  return _genServiceInfo(to)
    .then((info) => serviceInfo = info)
    .then(() => window.safeMutableData.newPublic(APP_HANDLE, serviceInfo.serviceAddr, TAG_TYPE_DNS))
    .then((servicesHandle) => window.safeMutableData.get(servicesHandle, serviceInfo.serviceName)
      .catch((err) => {throw Error("Email id not found")})
      .then((service) => window.safeMutableData.fromSerial(servicesHandle, service.buf))
      .then((inboxHandle) => window.safeMutableData.get(inboxHandle, MD_KEY_EMAIL_ENC_PUBLIC_KEY)
        .then((pk) => _writeEmailContent(email, pk.buf.toString())
          .then((emailAddr) => window.safeMutableData.newMutation(APP_HANDLE)
            .then((mutHandle) => {
              let entryKey = _genRandomEntryKey();
              return _encrypt(emailAddr, pk.buf.toString())
                .then((entryValue) => window.safeMutableDataMutation.insert(mutHandle, entryKey, entryValue)
                  .then(() => window.safeMutableData.applyEntriesMutation(inboxHandle, mutHandle))
                )
            })
          )))
    );
}

export const sendEmail = (rating, comments, emailId) => {
  let emailContent = {
    subject: "SAFE Wallet feedback",
    from: "SAFE Faucet",
    time: (new Date()).toUTCString(),
    body: "[" + rating + " star/s] " + comments
  }

  return _storeEmail(emailContent, emailId)
    .then(() => console.log("Email sent"))
}
