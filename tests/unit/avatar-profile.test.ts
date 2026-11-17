import {it,expect} from 'vitest';
import {leaderboardAvatarProfile} from '../../shared/avatar-profile';
it('uses a freshly saved own avatar after nickname changes',()=>{
 const current={id:'account-a',username:'new nickname',avatar_path:'new-photo',avatar:{hat:'flower'}};
 expect(leaderboardAvatarProfile({user_id:'account-a',username:'old nickname',profile:{avatar_path:'old-photo'}},current)).toBe(current);
});
it('never substitutes an own avatar for a duplicate nickname on another account',()=>{
 const profile={id:'account-b',avatar_path:'other-photo'};
 expect(leaderboardAvatarProfile({user_id:'account-b',username:'same nickname',profile},{id:'account-a',username:'same nickname'})).toBe(profile);
});
it('does not guess account identity from a nickname when IDs are absent',()=>{
 const profile={avatar_path:'rank-photo'};
 expect(leaderboardAvatarProfile({username:'same',profile},{username:'same',avatar_path:'own-photo'})).toBe(profile);
 expect(leaderboardAvatarProfile({username:'other'})).toEqual({});
});
it('immediately reflects restoring the own default mango using stable profile identity',()=>{
 const current={id:'account-a',username:'visitor',avatar_path:null,avatar:{}};
 expect(leaderboardAvatarProfile({profile:{id:'account-a',avatar_path:'old-photo'}},current).avatar_path).toBeNull();
});
it('prefers authoritative ranked identity over an inconsistent nested profile identity',()=>{
 const profile={id:'account-a',avatar_path:'rank-photo'};
 expect(leaderboardAvatarProfile({user_id:'account-b',profile},{id:'account-a',avatar_path:'own-photo'})).toBe(profile);
});
