import test from 'node:test'
import assert from 'node:assert/strict'
import {createEncryption,encryptJournal,unlockEncryption,forgetEncryption,changeEncryptionPassphrase} from '../src/journalCrypto.js'
import {rememberDeviceUnlock,restoreRememberedUnlock,forgetDeviceUnlock,clearDeviceUnlocks} from '../src/deviceUnlock.js'
let fake
try{fake=await import(process.env.FAKE_IDB_MODULE||'fake-indexeddb')}catch{/* Optional local integration dependency. */}
test('device unlock survives key disposal, binds account/key, and is explicitly removable',{skip:!fake},async()=>{
 globalThis.indexedDB=new fake.IDBFactory()
 const first=await createEncryption('device-test-a','synthetic-device-passphrase')
 const cloud=await encryptJournal({privateText:'private synthetic note'},first.unlocked)
 assert.equal(await restoreRememberedUnlock('device-test-a',cloud),null,'default is not remembered')
 await rememberDeviceUnlock(first.unlocked)
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('time-recording-device-unlock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject})
 const saved=await new Promise((resolve,reject)=>{const r=db.transaction('keys').objectStore('keys').get('device-test-a');r.onsuccess=()=>resolve(r.result);r.onerror=reject});db.close()
 assert.equal(saved.wrappingKey.extractable,false)
 await assert.rejects(crypto.subtle.exportKey('raw',saved.wrappingKey))
 assert.equal(saved.raw,undefined);assert.equal(saved.passphrase,undefined);assert.equal(saved.recoveryCode,undefined)
 assert.ok(saved.box instanceof ArrayBuffer)
 forgetEncryption(first.unlocked)
 const resumed=await restoreRememberedUnlock('device-test-a',cloud)
 assert.equal(resumed.userId,'device-test-a')
 assert.equal(await restoreRememberedUnlock('device-test-b',cloud),null)
 const changed=await changeEncryptionPassphrase(resumed,'replacement-device-passphrase')
 const newCloud=await encryptJournal({privateText:'private synthetic note'},changed)
 assert.ok(await restoreRememberedUnlock('device-test-a',newCloud),'passphrase rewrap does not revoke trusted device')
 await forgetDeviceUnlock('device-test-a')
 assert.equal(await restoreRememberedUnlock('device-test-a',newCloud),null)
 assert.ok(await unlockEncryption(newCloud,'device-test-a','replacement-device-passphrase'),'forgetting device does not change cloud key')
 await rememberDeviceUnlock(changed)
 const replacement=await createEncryption('device-test-a','another-synthetic-passphrase')
 assert.equal(await restoreRememberedUnlock('device-test-a',await encryptJournal({},replacement.unlocked)),null,'changed DEK invalidates saved device information')
 assert.equal(await restoreRememberedUnlock('device-test-a',newCloud),null,'invalid saved key was removed')
 await rememberDeviceUnlock(changed)
 await clearDeviceUnlocks()
 assert.equal(await restoreRememberedUnlock('device-test-a',newCloud),null,'logout clearing removes saved unlock')
})
