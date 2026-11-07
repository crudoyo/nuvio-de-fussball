const encoder=new TextEncoder();
export const accessTokenPattern=/^[A-Za-z0-9_-]{43}$/;
export const accessIdPattern=/^[a-f0-9-]{36}$/;
export const invitationCodePattern=/^NV-[A-Za-z0-9_-]{24}$/;
export const SETUP_SESSION_SECONDS=30*60;
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const newAccessToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export const accessHash=async value=>base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export async function signAccess(secret,value){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64url(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
// Use zero for invitations without a deadline in the existing NOT NULL column.
export const NO_INVITE_EXPIRY=0;
const validInvitation=`(expires_at=${NO_INVITE_EXPIRY} OR expires_at>?)`;
const activeFriend='EXISTS(SELECT 1 FROM friends f WHERE f.id=access_slots.friend_id AND f.blocked=0)';
const openInvitation=`${validInvitation} AND setup_hash IS NULL
  AND activated_at IS NULL AND revoked_at IS NULL AND ${activeFriend}`;
const openSlot=`id=? AND friend_id=? AND ${openInvitation}`;
const usedSlots=`SELECT COUNT(*) FROM access_slots s WHERE s.friend_id=f.id
  AND s.revoked_at IS NULL AND (
    s.activated_at IS NOT NULL
    OR (s.setup_hash IS NULL AND (s.expires_at=${NO_INVITE_EXPIRY} OR s.expires_at>?))
    OR s.setup_expires_at>?
  )`;

export function accessStore(db,secret,clock=Date.now){
  const sql=(query,...args)=>db.prepare(query).bind(...args);
  // The slot ID and secret reproduce the password without storing it in D1.
  const codeForSlot=async id=>'NV-'+(await signAccess(secret,'nuvio-invite-v1:'+id)).slice(0,24);
  async function pendingInvite(friendId,hours,now){
    const id=crypto.randomUUID(),token=await codeForSlot(id);
    const expires=hours===null?NO_INVITE_EXPIRY:now+hours*3600000;
    const stmt=sql(`INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
      SELECT ?,f.id,?,?,? FROM friends f WHERE f.id=? AND f.blocked=0 AND (${usedSlots})<f.slot_limit
      RETURNING id`,id,await accessHash(token),expires,now,friendId,now,now);
    return {token,expires,stmt};
  }
  async function activateSlot(condition,credential){
    const key=newAccessToken(),now=clock();
    // The guarded update allows a reservation to issue exactly one import key.
    const row=await sql(`UPDATE access_slots SET device_hash=?,activated_at=?
      WHERE ${condition} AND activated_at IS NULL AND revoked_at IS NULL AND ${activeFriend}
      RETURNING id`,await accessHash(key),now,await accessHash(credential),now).first();
    return row?key:null;
  }
  return {
    async list(){
      const now=clock();
      const [friends,slotRows,audit]=await db.batch([
        sql('SELECT id,name,slot_limit,blocked FROM friends ORDER BY created_at,id'),
        sql(`SELECT id,friend_id,expires_at,setup_expires_at,activated_at,revoked_at,
          CASE WHEN ${openInvitation} THEN invite_hash END AS pending_hash FROM access_slots ORDER BY created_at,id`,now),
        sql('SELECT a.event,a.at,f.name FROM access_audit a JOIN friends f ON f.id=a.friend_id ORDER BY a.id DESC LIMIT 15')
      ]);
      const slots=await Promise.all(slotRows.results.map(async ({pending_hash,...slot})=>{
        const code=pending_hash?await codeForSlot(slot.id):null;
        return {...slot,password:code&&await accessHash(code)===pending_hash?code:null};
      }));
      return {friends:friends.results,slots,audit:audit.results,now};
    },
    async createFriend(name,limit,hours){
      const id=crypto.randomUUID(),now=clock(),{token,expires,stmt}=await pendingInvite(id,hours,now);
      await db.batch([sql('INSERT INTO friends(id,name,slot_limit,created_at) VALUES(?,?,?,?)',id,name,limit,now),stmt]);
      return {friendId:id,token,expires};
    },
    async invite(friendId,hours){
      const {token,expires,stmt}=await pendingInvite(friendId,hours,clock());
      return await stmt.first()?{friendId,token,expires}:null;
    },
    async invitationPassword(friendId,id,replace=false){
      const token=await codeForSlot(id),hash=await accessHash(token),now=clock();
      const row=await (replace
        ?sql(`UPDATE access_slots SET invite_hash=? WHERE ${openSlot} RETURNING invite_hash,expires_at`,hash,id,friendId,now)
        :sql(`SELECT invite_hash,expires_at FROM access_slots WHERE ${openSlot}`,id,friendId,now)).first();
      return row?{token:row.invite_hash===hash?token:null,expires:row.expires_at}:null;
    },
    async invitation(token){
      return sql(`SELECT f.name,s.expires_at FROM access_slots s JOIN friends f ON f.id=s.friend_id
        WHERE s.invite_hash=? AND (s.expires_at=${NO_INVITE_EXPIRY} OR s.expires_at>?)
        AND s.activated_at IS NULL AND s.revoked_at IS NULL AND f.blocked=0`,
      await accessHash(token),clock()).first();
    },
    async activate(token){
      return activateSlot(`invite_hash=? AND ${validInvitation} AND setup_hash IS NULL`,token);
    },
    async startSetup(code){
      const session=newAccessToken(),now=clock();
      // Claim the code atomically before showing the configuration form.
      const row=await sql(`UPDATE access_slots SET setup_hash=?,setup_expires_at=?
        WHERE invite_hash=? AND ${validInvitation} AND setup_hash IS NULL
        AND activated_at IS NULL AND revoked_at IS NULL AND ${activeFriend}
        RETURNING id`,await accessHash(session),now+SETUP_SESSION_SECONDS*1000,await accessHash(code),now).first();
      return row?session:null;
    },
    async setup(session){
      return sql(`SELECT f.name FROM access_slots s JOIN friends f ON f.id=s.friend_id
        WHERE s.setup_hash=? AND s.setup_expires_at>? AND s.activated_at IS NULL
        AND s.revoked_at IS NULL AND f.blocked=0`,await accessHash(session),clock()).first();
    },
    async finishSetup(session){
      return activateSlot('setup_hash=? AND setup_expires_at>?',session);
    },
    async device(key){
      return sql(`SELECT f.blocked,s.revoked_at FROM access_slots s
        JOIN friends f ON f.id=s.friend_id WHERE s.device_hash=?`,await accessHash(key)).first();
    },
    async setLimit(id,limit){
      const now=clock();
      return Boolean(await sql(`UPDATE friends AS f SET slot_limit=? WHERE id=?
        AND (${usedSlots})<=? RETURNING id`,limit,id,now,now,limit).first());
    },
    async setBlocked(id,blocked){
      return Boolean(await sql('UPDATE friends SET blocked=? WHERE id=? RETURNING id',Number(blocked),id).first());
    },
    async revoke(friendId,id){
      return Boolean(await sql(`UPDATE access_slots SET revoked_at=? WHERE id=? AND friend_id=?
        AND revoked_at IS NULL RETURNING id`,clock(),id,friendId).first());
    },
    async deleteFriend(id){
      const [, , deleted]=await db.batch([
        sql('DELETE FROM access_audit WHERE friend_id=?',id),
        sql('DELETE FROM access_slots WHERE friend_id=?',id),
        sql('DELETE FROM friends WHERE id=? RETURNING id',id)
      ]);
      return deleted.results.length>0;
    }
  };
}
