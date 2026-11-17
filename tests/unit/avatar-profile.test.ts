import {it,expect} from 'vitest';
import {leaderboardAvatarProfile} from '../../shared/avatar-profile';
const current={id:'account-a',username:'new nickname',avatar_path:'new-photo',avatar:{hat:'flower'}};
it('uses the viewer profile only for the row the server marked as self',()=>{
 expect(leaderboardAvatarProfile({is_me:true,profile:{avatar_path:'old-photo'}},current)).toBe(current);
});
it('never substitutes the viewer avatar for another row',()=>{
 const profile={avatar_path:'other-photo'};
 expect(leaderboardAvatarProfile({is_me:false,profile},current)).toBe(profile);
});
it('falls back to the sanitized public profile and never exposes an account id',()=>{
 expect(leaderboardAvatarProfile({username:'same',profile:{username:'same'}},current)).toEqual({username:'same'});
 expect(leaderboardAvatarProfile({username:'other'})).toEqual({});
});
