import {describe,it,expect} from 'vitest';
import {confirmAction,promptText,showMessage,subscribeDialogs,finishDialog,type DialogRequest} from '../../src/lib/dialogs';
describe('interaction request queue',()=>{
 it('serializes confirmation and text requests without silently approving a second action',async()=>{
  const received:DialogRequest[]=[];const off=subscribeDialogs(r=>received.push(r));
  const confirm=confirmAction('移入回收站？');const prompt=promptText('名称','旧名称');
  expect(received).toHaveLength(1);expect(received[0].kind).toBe('confirm');
  received[0].resolve(false);finishDialog();expect(await confirm).toBe(false);
  expect(received).toHaveLength(2);expect(received[1].initial).toBe('旧名称');
  received[1].resolve(null);finishDialog();expect(await prompt).toBeNull();off();
 });
 it('retains requests until a host mounts and preserves multiline input',async()=>{
  const result=promptText('每行一个选项');let current:DialogRequest|undefined;
  const off=subscribeDialogs(r=>{current=r;});expect(current).toBeDefined();
  current!.resolve('A. 苹果\nB. 香蕉');finishDialog();expect(await result).toBe('A. 苹果\nB. 香蕉');off();
 });
 it('waits for acknowledgement of a message',async()=>{
  let current:DialogRequest|undefined;const off=subscribeDialogs(r=>{current=r;});
  const result=showMessage('已复制草稿');expect(current?.kind).toBe('alert');current!.resolve(true);finishDialog();await result;off();
 });
});
