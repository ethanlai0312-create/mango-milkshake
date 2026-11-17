import {inviteLabelError} from './invite-label.ts';
import {validPresenceId as uuid} from './presence.ts';

type Rule = (input: unknown) => boolean;
type Fields = Record<string, Rule>;
type Payload = Record<string, unknown>;
const record = (value: unknown): value is Payload => typeof value === 'object' && value !== null && !Array.isArray(value);
const reservedKeys = new Set(['__proto__', 'prototype', 'constructor']);
function validJson(value: unknown, depth = 0): boolean {
 if (depth > 64) return false;
 if (value === null || typeof value === 'boolean') return true;
 if (typeof value === 'string') return !value.includes('\0');
 if (typeof value === 'number') return Number.isFinite(value);
 if (Array.isArray(value)) return value.every(item => validJson(item, depth + 1));
 if (!record(value)) return false;
 const prototype = Object.getPrototypeOf(value);
 return (prototype === Object.prototype || prototype === null) && Object.entries(value).every(
  ([key, item]) => !reservedKeys.has(key) && validJson(item, depth + 1),
 );
}
const text = (max: number): Rule => value => typeof value === 'string' && value.length <= max && !value.includes('\0');
const requiredText = (max: number): Rule => value => text(max)(value) && (value as string).length > 0;
const bool: Rule = value => typeof value === 'boolean';
const integer = (min: number, max: number): Rule => value =>
 typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const enumeration = (...choices: string[]): Rule => value => typeof value === 'string' && choices.includes(value);
const optional = (rule: Rule): Rule => value => value === undefined || rule(value);
const nullable = (rule: Rule): Rule => value => value === null || rule(value);
const array = (rule: Rule, max: number): Rule => value => Array.isArray(value) && value.length <= max && value.every(rule);
const fields = (rules: Fields): Rule => value => record(value)
 && Object.keys(value).every(key => Object.hasOwn(rules, key))
 && Object.entries(rules).every(([key, rule]) => rule(value[key]));
const questionMap = (rule: Rule): Rule => value => {
 if (!record(value)) return false;
 const keys = Object.keys(value);
 return keys.length <= 2000 && keys.every(key => uuid(key) && rule(value[key]));
};

const offset = optional(integer(0, 1_000_000));
const revision = integer(0, 2_147_483_646);
const search = optional(text(200));
const id = {id: uuid};
const password = requiredText(256);
const login = {loginId: requiredText(128), password};
const purposes = enumeration('shared', 'attachment', 'submission', 'avatar', 'conversion');
const avatar = fields({
 color: optional(value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)),
 expression: optional(enumeration('smile', 'surprise')),
 hat: optional(enumeration('none', 'cap', 'bow', 'flower', 'headphones')),
 glasses: optional(bool),
});
const textList = (max: number, count: number): Rule => array(text(max), count);
const optionIndex = integer(0, 99);
const answerFor = (kind: unknown, answer: unknown): boolean => {
 // The editor may save incomplete answers before submitting for review.
 if (answer === undefined || answer === null || answer === '') return true;
 switch (kind) {
  case 'single': return optionIndex(answer);
  case 'multiple': case 'ordering': return array(optionIndex, 100)(answer);
  case 'matching': case 'connection': return array(nullable(optionIndex), 100)(answer);
  case 'boolean': return enumeration('true', 'false')(answer);
  case 'blank': return textList(10000, 100)(answer);
  case 'blanks': case 'table': return array(nullable(textList(10000, 100)), 100)(answer);
  case 'numeric': return typeof answer === 'number' && Number.isFinite(answer) || text(10000)(answer);
  case 'drawing': return record(answer);
  case 'hotspot': {
   const coordinate: Rule = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
   return fields({x: coordinate, y: coordinate, radius: coordinate})(answer);
  }
  default: return text(50000)(answer);
 }
};
const question: Rule = value => record(value) && Object.keys(value).every(key => questionFields.has(key)) &&
 answerFor(value.kind, value.answer);
const questionFields = new Set([
 'id', 'kind', 'prompt', 'points', 'options', 'answer', 'explanation', 'traditionalOnly', 'ignoreCase',
 'ignorePunctuation', 'partial', 'shuffle', 'attachments', 'tolerance', 'blankPoints', 'drawing',
]);

// Older Admin pages send these unused filters for several list endpoints.
const legacyAdminFilters = {mode: optional(enumeration('admin')), search, offset};
const exam = fields({
 id: uuid,
 revision,
 title: requiredText(200),
 description: text(10000),
 subject: text(100),
 tags: array(text(100), 30),
 questions: array(question, 2000),
 time_limit: integer(0, 604800),
 repeat_allowed: bool,
 reveal_answers: bool,
 show_explanations: bool,
 // DB row metadata travels with the existing editor model and is never written from the request.
 owner_id: optional(uuid),
 status: optional(enumeration('draft', 'pending', 'returned', 'published', 'unpublished', 'deleted')),
 published_version_id: optional(nullable(uuid)),
 updated_at: optional(nullable(text(64))),
 created_at: optional(nullable(text(64))),
 deleted_at: optional(nullable(text(64))),
 deleted_by: optional(nullable(uuid)),
 purged_at: optional(nullable(text(64))),
 review_reason: optional(nullable(text(10000))),
});

const actions: Record<string, Fields> = {
 health: {}, mistakeExams: {}, mistakes: {exam:uuid,mode:optional(enumeration('wrong','partial','all')),offset},
 login,
 register: {password, nickname: requiredText(128), invite: requiredText(256)},
 bootstrap: {...login, nickname: optional(requiredText(128)), token: requiredText(512)},
 ackLoginIdNotice: {}, sessionStatus: {}, sessionActivity: {}, me: {},
 settings: {
  nickname: optional(requiredText(128)),
  settings: fields({theme: optional(enumeration('light', 'dark', 'system')), language: optional(enumeration('zh-CN', 'zh-TW'))}),
  // Kept for compatibility with saved editor/app builds. The settings action reads the existing avatar server-side.
  avatar: optional(avatar), avatar_path: optional(nullable(uuid)),
 },
 changePassword: {currentPassword: password, newPassword: password},
 presence: {tab: uuid, sequence: integer(0, Number.MAX_SAFE_INTEGER), online: bool},
 userPresence: {ids: array(uuid, 50)},
 users: legacyAdminFilters,
 userVisibility: {id: uuid},
 setUserVisibility: {id: uuid, blocked: array(uuid, 200), all: bool},
 maintenance: {},
 setMaintenance: {active: bool, minutes: optional(integer(1, 120)), message: optional(text(200))},
 impersonateUser: {id: uuid},
 updateAvatar: {avatar: optional(avatar), avatar_path: optional(nullable(uuid))},
 purgeAccount: {...id, confirmPermanent: bool, confirmUsername: requiredText(128)},
 userState: {...id, active: bool},
 setUserRole: {...id, role: enumeration('user','tester','secondary admin'), expectedRole: enumeration('user','tester','secondary admin')},
 testerExam: id, testerFile: id,
 resetPassword: id,
 invites: legacyAdminFilters,
 createInvite: {loginId: requiredText(128), label: value=>!inviteLabelError(value), hours: optional(integer(1, 8760)), testOnly: optional(bool)},
 revokeInvite: id,
 exams: {mode: optional(enumeration('mine', 'admin', 'trash', 'public')), search, offset},
 createExam: {title: requiredText(200)},
 getExam: id,
 saveExam: {exam},
 submitReview: {...id, revision},
 review: {...id, revision: optional(revision), decision: enumeration('publish', 'return', 'unpublish', 'restore'), reason: optional(text(2000))},
 deleteExam: {...id, revision: optional(revision)},
 purgeExam: {...id, confirmPermanent: bool, confirmTitle: requiredText(200)},
 copyExam: id, startAttempt: id, attempt: id,
 saveAttempt: {...id, revision, answers: questionMap(() => true)},
 submitAttempt: {...id, revision, answers: questionMap(() => true)},
 historyQuery: {all: optional(bool), version: optional(nullable(uuid)), sort: optional(enumeration('date', 'score', 'duration')), offset},
 history: {all: optional(bool), exam_id: optional(nullable(uuid)), offset},
 grade: {
  ...id, revision: optional(revision),
  scores: optional(questionMap(nullable(value => value === '' || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000))),
  comments: optional(questionMap(text(20000))),
  manualStatus: optional(questionMap(enumeration('correct', 'wrong', 'partial', 'review'))),
  referenceReleases: optional(questionMap(bool)),
 },
 leaderboard: {version: uuid, offset},
 upload: {purpose: purposes, name: requiredText(255), size: integer(1, Number.MAX_SAFE_INTEGER), mime: requiredText(255), exam_id: optional(nullable(uuid)), attempt_id: optional(nullable(uuid))},
 renewUpload: id, verifyUpload: id,
 files: {purpose: optional(purposes), search, category: optional(text(100)), sort: optional(enumeration('name', 'size', 'created_at')), ascending: optional(bool), offset},
 fileUrl: {...id, download: optional(bool)},
 updateFile: {...id, name: optional(text(200)), description: optional(text(2000)), category: optional(text(100))},
 replaceShared: {...id, new_id: uuid},
 deleteFile: id,
 conversionInfo: {}, conversionInputs: {}, wakeConverter: {}, conversions: {offset},
 createConversion: {file_id: uuid, target: value => typeof value === 'string' && /^[a-z0-9]{1,8}$/.test(value)},
 deleteConversion: id, cancelConversion: id, conversionDownload: id,
 logs: legacyAdminFilters,
 saveConfig: {key: enumeration('converter_url', 'registration_enabled'), value: value => typeof value === 'boolean' || text(255)(value)},
 config: legacyAdminFilters,
 workerHealth: {}, workerClaim: {},
 workerFinish: {...id, lease: uuid, success: bool, error: optional(text(500))},
};

/** Return a stable error without reflecting request content in the response. */
export function validateApiInput(body: unknown) {
 if (!record(body) || typeof body.action !== 'string') return {error: '请求格式无效', status: 400} as const;
 if (!validJson(body)) return {error: '请求字段或格式无效', status: 400} as const;
 if (!Object.hasOwn(actions, body.action)) return {error: '接口不存在', status: 404} as const;
 const {action, ...params} = body;
 if (!fields(actions[action])(params)) return {error: '请求字段或格式无效', status: 400} as const;
 return {action, params} as const;
}

/** Keep the operation separate from field values before they cross the network. */
export function serializeApiRequest(action: string, params: Payload): string {
 if (!record(params) || Object.hasOwn(params, 'action')) throw new Error('请求字段或格式无效');
 // JSON drops optional undefined fields used by existing callers.
 const body = JSON.stringify({...params, action});
 const result = validateApiInput(JSON.parse(body));
 if (result.error) throw new Error(result.error);
 return body;
}
