import {describe,expect,it} from 'vitest';
import katex from 'katex';
import {sanitizeRichText} from '../../shared/rich-text';
import {exportCSV,importQuestions,parseCSV} from '../../shared/import-export';
import {newQuestion} from '../../shared/model';

describe('safe study content',()=>{
 it('removes active markup, event attributes and executable links',()=>{
  const result=sanitizeRichText('<p onclick="sample()">課程</p><script>sample()</script><a href="javascript:sample()">參考</a><iframe src="https://example.com/"></iframe><input value="sample">');
  expect(result).toBe('<p>課程</p><a>參考</a>');
  expect(sanitizeRichText('<pre><code>SELECT * FROM lessons; &lt;script&gt;文字&lt;/script&gt;</code></pre>')).toBe('<pre><code>SELECT * FROM lessons; &lt;script&gt;文字&lt;/script&gt;</code></pre>');
 });
 it('preserves study formatting, text and meaningful punctuation',()=>{
  const html='<p><strong>澳門</strong>與 ICT</p><pre><code>if (a &lt; b) { 答案(); }</code></pre><table border="1"><tbody><tr><td colspan="2">甲</td></tr></tbody></table>';
  expect(sanitizeRichText(html)).toBe(html);
 });
 it('discards unsupported elements and attributes while preserving text',()=>{
  const html='<p class="custom" style="color:red" id="prefix">文字<q>引述</q><img alt="示例" src="https://example.com/picture.png"></p>';
  expect(sanitizeRichText(html)).toBe('<p>文字引述</p>');
  expect(sanitizeRichText('<a href="https://example.com/">參考</a>')).toBe('<a href="https://example.com/" rel="noreferrer noopener">參考</a>');
 });
 it('keeps the geometry and layout markup used by normal formulas',()=>{
  const html=katex.renderToString(String.raw`\sqrt{x}+\frac{1}{2}+\overrightarrow{AB}`,{output:'html'});
  const result=sanitizeRichText(html);
  expect(result).toContain('class="katex"');
  expect(result).toContain('class="mord sqrt"');
  expect(result).toContain('<svg ');
  expect(result).toContain('<path d=');
  expect(result).toContain('style="height:');
  expect(sanitizeRichText(result)).toBe(result);
 });
 it('exports spreadsheet-like text literally and retains other content',()=>{
  const questions=['=SUM(A1:A2)','普通題幹','-20'].map(prompt=>({...newQuestion('single'),prompt,answer:0}));
  const rows=parseCSV(exportCSV(questions).slice(1));
  expect(rows.slice(1).map(row=>row[1])).toEqual(["'=SUM(A1:A2)",'普通題幹','-20']);
  expect(questions[0].prompt).toBe('=SUM(A1:A2)');
 });
 it('validates and sanitizes imported questions before adding them to the editor',()=>{
  const question={...newQuestion('single'),prompt:'<p id="example">澳門 <b>ICT</b></p>',answer:0};
  const [result]=importQuestions(JSON.stringify([question]),'json');
  expect(result.prompt).toBe('<p>澳門 <b>ICT</b></p>');
  expect(result.answer).toBe(question.answer);
 });
});
