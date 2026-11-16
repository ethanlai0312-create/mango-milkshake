/** Only expose conversion pairs implemented by the isolated worker. */
export const conversionFormats:Record<string,string[]>={doc:['pdf','docx','odt','txt','html'],docx:['pdf','odt','txt','html'],odt:['pdf','docx','txt'],rtf:['pdf','docx','txt'],txt:['pdf','docx'],md:['html','pdf'],html:['pdf','docx'],xls:['pdf','xlsx','csv'],xlsx:['pdf','csv','ods'],ods:['xlsx','pdf','csv'],csv:['xlsx','pdf'],ppt:['pdf','pptx','odp'],pptx:['pdf','odp'],odp:['pdf','pptx'],pdf:['docx','png'],png:['pdf'],jpg:['pdf'],jpeg:['pdf'],epub:['html','pdf']};
conversionFormats.pdf.push('txt');
for(const format of ['webp','gif','bmp','tif','tiff']) conversionFormats[format]=['pdf'];
export function targetsFor(name:string){return conversionFormats[name.split('.').pop()?.toLowerCase()??'']??[];}
