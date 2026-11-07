const encoder=new TextEncoder();
export const accessTokenPattern=/^[A-Za-z0-9_-]{43}$/;
export const accessIdPattern=/^[a-f0-9-]{36}$/;
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const newAccessToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export const accessHash=async value=>base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const usedSlots=`SELECT COUNT(*) FROM access_slots s WHERE s.friend_id=f.id
  AND s.revoked_at IS NULL AND (s.activated_at IS NOT NULL OR s.expires_at>?)`;

export function accessStore(db,clock=Date.now){
  const sql=(query,...args)=>db.prepare(query).bind(...args);
  async function pendingInvite(friendId,hours,now){
    const id=crypto.randomUUID(),token=newAccessToken(),expires=now+hours*3600000;
    const stmt=sql(`INSERT INTO access_slots(id,friend_id,invite_hash,expires_at,created_at)
      SELECT ?,f.id,?,?,? FROM friends f WHERE f.id=? AND f.blocked=0 AND (${usedSlots})<f.slot_limit
      RETURNING id`,id,await accessHash(token),expires,now,friendId,now);
    return {token,expires,stmt};
  }
  return {
    async list(){
      const [friends,slots,audit]=await db.batch([
        sql('SELECT id,name,slot_limit,blocked FROM friends ORDER BY created_at,id'),
        sql('SELECT id,friend_id,device_name,expires_at,activated_at,revoked_at FROM access_slots ORDER BY created_at,id'),
        sql('SELECT a.event,a.at,f.name FROM access_audit a JOIN friends f ON f.id=a.friend_id ORDER BY a.id DESC LIMIT 15')
      ]);
      return {friends:friends.results,slots:slots.results,audit:audit.results,now:clock()};
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
    async invitation(token){
      return sql(`SELECT f.name,s.expires_at FROM access_slots s JOIN friends f ON f.id=s.friend_id
        WHERE s.invite_hash=? AND s.expires_at>? AND s.activated_at IS NULL AND s.revoked_at IS NULL AND f.blocked=0`,
      await accessHash(token),clock()).first();
    },
    async activate(token,deviceName){
      const key=newAccessToken(),now=clock();
      // One conditional write on the primary: no second request can consume this row.
      const row=await sql(`UPDATE access_slots SET device_hash=?,device_name=?,activated_at=?
        WHERE invite_hash=? AND expires_at>? AND activated_at IS NULL AND revoked_at IS NULL
        AND EXISTS(SELECT 1 FROM friends f WHERE f.id=access_slots.friend_id AND f.blocked=0)
        RETURNING id`,await accessHash(key),deviceName,now,await accessHash(token),now).first();
      return row?key:null;
    },
    async device(key){
      return sql(`SELECT f.blocked,s.revoked_at FROM access_slots s
        JOIN friends f ON f.id=s.friend_id WHERE s.device_hash=?`,await accessHash(key)).first();
    },
    async setLimit(id,limit){
      return Boolean(await sql(`UPDATE friends AS f SET slot_limit=? WHERE id=?
        AND (${usedSlots})<=? RETURNING id`,limit,id,clock(),limit).first());
    },
    async setBlocked(id,blocked){
      return Boolean(await sql('UPDATE friends SET blocked=? WHERE id=? RETURNING id',Number(blocked),id).first());
    },
    async revoke(friendId,id){
      return Boolean(await sql(`UPDATE access_slots SET revoked_at=? WHERE id=? AND friend_id=?
        AND revoked_at IS NULL RETURNING id`,clock(),id,friendId).first());
    }
  };
}
