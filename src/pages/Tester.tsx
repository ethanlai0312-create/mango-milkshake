import {roleLabel} from '../../shared/roles';
import {useState} from 'react';
import {Button} from '../ui/Button';
/** Local interface samples only. Never mounts privileged components or fetches their data. */
export function TesterPage({page,role='tester'}:{page:string;role?:string}){
 const [search,setSearch]=useState('');
 const specs:Record<string,{title:string;sample:string[];actions:string[]}>= {
  review:{title:'试卷审核',sample:['示例试卷（非真实资料）','待审核'],actions:['发布','退回']},
  users:{title:'账号管理',sample:['示例账号（非真实用户）','身份、在线状态与登录时间已隐藏'],actions:['调整权限','停用','重置密码','永久删除账号']},
  invites:{title:'注册密令',sample:['示例密令（无有效密钥）','有效期与使用者资料已隐藏'],actions:['生成密令','撤销']},
  grading:{title:'人工批改',sample:['示例答卷（非真实答卷）','答案、分数与用户身份已隐藏'],actions:['查看详情','保存批改']},
  trash:{title:'试卷回收站',sample:['示例试卷（非真实资料）','已删除'],actions:['恢复','永久删除']},
  logs:{title:'操作日志',sample:['示例事件（非真实日志）','操作者、时间、对象与请求资料已隐藏'],actions:[]},
  config:{title:'系统配置',sample:['示例配置（非实际设置）','地址、密钥及实际配置均不读取'],actions:['保存配置']},
 };
 const spec=specs[page];if(!spec)return null;
 return <div data-tester-preview="true"><div className="page-heading"><h1>{spec.title}</h1><span className="badge">{roleLabel(role)} · 界面测试</span></div>
  <p className="notice" role="note">仅供检查界面。以下为示例数据，不读取真实管理资料，管理操作不可执行。自己的出题、答题和文件功能可正常使用。</p>
  <label>搜索示例<input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="仅筛选本页示例"/></label>
  <section className="card data-region"><div className="table-wrap"><table className="responsive-records"><thead><tr><th>记录</th><th>状态 / 信息</th><th>操作</th></tr></thead><tbody>{spec.sample.join(' ').includes(search)&&<tr>{spec.sample.map((value,i)=><td key={i} data-label={i?'状态 / 信息':'记录'}>{value}</td>)}<td data-label="操作"><div className="actions"><span className="muted">只读预览</span></div></td></tr>}</tbody></table></div></section>
 </div>;
}
