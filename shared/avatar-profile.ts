/** Nicknames are mutable and non-unique. Compare stable account IDs only. */
export function leaderboardAvatarProfile(row:any,currentProfile?:any){
 const accountId=row.user_id??row.profile?.id;
 return typeof currentProfile?.id==='string'&&currentProfile.id.length>0&&accountId===currentProfile.id?currentProfile:row.profile??{};
}
