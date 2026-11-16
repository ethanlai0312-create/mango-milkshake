/** Preserve HTTP authorization failures so cached views can fail closed. */
export class ApiError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='ApiError';}
}
export const isAuthorizationError=(error:unknown)=>error instanceof ApiError&&(error.status===401||error.status===403);
