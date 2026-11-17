import {leaderboardAvatarProfile} from '../../shared/avatar-profile';
import {Mango} from '../components/Mango';
import {duration} from '../../shared/model';
export function LeaderboardRow({row,currentProfile}:{row:any;currentProfile?:any}){return <div className={'rank-row '+(row.score===row.max_score?'perfect':'')}><span className="rank-number">{row.rank}</span><Mango profile={leaderboardAvatarProfile(row,currentProfile)} size={34}/><strong data-user-content>{currentProfile?.id&&(row.user_id??row.profile?.id)===currentProfile.id?currentProfile.username:row.username}</strong><span>{row.score} 分</span><time>{duration(row.duration_seconds)}</time></div>;}
