/** The server marks the viewer's own row; other rows never share client-side account IDs. */
export function leaderboardAvatarProfile(row:any,currentProfile?:any){
 return row?.is_me===true&&currentProfile?currentProfile:row?.profile??{};
}
