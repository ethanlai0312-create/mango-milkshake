/** A cached rank must not override the signed-in user's freshly saved avatar. */
export function leaderboardAvatarProfile(row:any,currentProfile?:any){
 return currentProfile?.username&&row.username===currentProfile.username?currentProfile:row.profile??{};
}
