import DOMPurify from 'dompurify';
import {sanitizeRichText} from '../../shared/rich-text';

/** CSP permits only DOMPurify's private `dompurify` policy; no default policy.
 * A TrustedHTML value is produced only after the shared allowlist and DOMPurify.
 * Browsers without Trusted Types keep both sanitizers and return a string.
 */
export const richHTMLString=(html:string)=>DOMPurify.sanitize(sanitizeRichText(html),{RETURN_TRUSTED_TYPE:false});
export const richHTMLFragment=(html:string)=>DOMPurify.sanitize(sanitizeRichText(html),{RETURN_DOM_FRAGMENT:true});
export const trustedRichHTML=(html:string)=>DOMPurify.sanitize(sanitizeRichText(html),{RETURN_TRUSTED_TYPE:true});
